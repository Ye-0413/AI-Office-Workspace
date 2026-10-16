"""Passive Hermes observer. All callbacks return None; no directives or answers.

Only a bounded, allowlisted event crosses an in-memory queue. A daemon worker
uses Mini Office's existing bounded spool writer. No prompt, history, answer,
tool result body, child goal, or error text is copied or persisted.
"""
from __future__ import annotations

import atexit
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import uuid

OWNER = "ai-mini-office-hermes-observer-v1"
HOOKS = ("on_session_start", "on_session_reset", "pre_llm_call", "pre_tool_call",
         "post_tool_call", "on_session_end", "on_session_finalize", "subagent_start",
         "subagent_stop", "on_human_input_request", "on_human_input_resolved")


def _text(value, limit=256):
    return value if isinstance(value, str) and 0 < len(value) <= limit and not any(ord(c) < 32 or ord(c) == 127 for c in value) else None


class Observer:
    def __init__(self, config, sender=None):
        self.config = config
        self.sender = sender or self._send
        self.events = queue.Queue(maxsize=64)
        self.closing = threading.Event()
        self.parents = {}
        self.lock = threading.Lock()
        self.cwd = os.getcwd()
        self.thread = threading.Thread(target=self._work, daemon=True, name="mini-office-observer")
        self.thread.start()

    def _send(self, raw):
        # No shell; arguments select only our passive observer, never an AI tool.
        subprocess.run([self.config["electronPath"], self.config["observer"], "--provider", "hermes",
                        "--event", raw["hook_event_name"], "--mini-office-observer-v1"],
                       input=json.dumps(raw).encode("utf-8"), timeout=1.5, check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env={"ELECTRON_RUN_AS_NODE": "1", "MINI_OFFICE_DATA_DIR": self.config["dataDir"]})

    def _work(self):
        while not self.closing.is_set() or not self.events.empty():
            try:
                raw = self.events.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                self.sender(raw)
            except Exception:
                pass  # Observation loss cannot affect Hermes work or approval.
            finally:
                self.events.task_done()

    def flush(self, seconds=2.0):
        deadline = time.monotonic() + seconds
        while self.events.unfinished_tasks and time.monotonic() < deadline:
            time.sleep(0.005)

    def close(self):
        # Reloading plugins must not retain an idle worker from each old load.
        # Pending observations drain in the daemon; the gateway never waits for
        # a full queue of subprocess sends before continuing its own work.
        self.closing.set()
        self.flush(0.2)

    def observe(self, name, **kwargs):
        try:
            if name not in HOOKS or self.closing.is_set():
                return None
            raw = {"hook_event_name": name, "event_id": uuid.uuid4().hex}
            # The hook schema is version-specific; missing stable identity drops
            # the event instead of borrowing the last active chat's identity.
            for field in ("session_id", "session_key", "turn_id", "tool_call_id", "request_id",
                          "parent_session_id", "child_session_id", "status", "child_status", "outcome"):
                value = _text(kwargs.get(field))
                if value is not None:
                    raw[field] = value
            tool_name = _text(kwargs.get("tool_name"), 96)
            if tool_name:
                raw["tool_name"] = tool_name
            for field in ("completed", "failed", "interrupted"):
                if isinstance(kwargs.get(field), bool):
                    raw[field] = kwargs[field]
            cwd = _text(kwargs.get("cwd"), 4096) or self.cwd
            if os.path.isabs(cwd):
                raw["cwd"] = cwd
            # Only the terminal command is needed transiently for conservative
            # classification. observe.cjs removes it before writing the spool.
            args = kwargs.get("args")
            if tool_name == "terminal" and isinstance(args, dict):
                command = args.get("command")
                if isinstance(command, str) and len(command) <= 32768:
                    raw["tool_input"] = {"command": command}
            with self.lock:
                child = raw.get("child_session_id")
                parent = raw.get("parent_session_id")
                if child and parent:
                    self.parents[child] = parent
                    while len(self.parents) > 256:
                        self.parents.pop(next(iter(self.parents)))
                session = raw.get("session_id") or raw.get("session_key")
                if session in self.parents and "parent_session_id" not in raw:
                    raw["parent_session_id"] = self.parents[session]
            self.events.put_nowait(raw)
        except Exception:
            pass
        # pre_tool_call / pre_llm_call support directives. Never return a dict,
        # string or decision, and never wait for disk/subprocess work here.
        return None


def register(ctx):
    try:
        file = Path(__file__).parent / "observer-config.json"
        if file.is_symlink() or file.stat().st_size > 32768:
            return
        config = json.loads(file.read_text(encoding="utf-8"))
        if config.get("owner") != OWNER or not all(isinstance(config.get(k), str) and os.path.isabs(config[k]) for k in ("electronPath", "observer", "dataDir")):
            return
        observer = Observer(config)
        for name in HOOKS:
            def callback(_name=name, **kwargs):
                observer.observe(_name, **kwargs)
                # These are observer-only boundaries, never tool policy hooks.
                # Bounded drain protects short one-shot sessions from losing the
                # last event when their interpreter exits.
                if _name in ("on_session_end", "on_session_finalize"):
                    observer.flush()
                return None
            ctx.register_hook(name, callback)
        atexit.register(observer.close)
        on_unload = getattr(ctx, "on_unload", None)
        if callable(on_unload):
            def cleanup():
                atexit.unregister(observer.close)
                observer.close()
            on_unload(cleanup)
    except Exception:
        return
