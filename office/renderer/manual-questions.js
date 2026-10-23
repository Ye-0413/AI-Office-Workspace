/* Explicit human answers only. Drafts exist only in this renderer's memory. */
(function (root) {
  'use strict';
  const COPY = {
    zh: { title: 'Agent 提问', count: 'Agent 提问 · {count} 项待处理', close: '关闭 Agent 提问',
      scope: '仅 OpenCode 1.x（1.18.31 起）与 MiMoCode 0.1.x（0.1.15 起）的原生提问支持在此手动回答。Codex 与其他工具的等待输入仅作观察，请回原工具处理；此处不会批准工具或自动回答。',
      empty: '当前没有可在此处理的 Agent 提问。', provider: '工具', session: '会话', call: '工具调用',
      question: '问题 {index}', single: '请选择一项；每个问题都需要回答。', multiple: '可选择多项；每个问题至少回答一项。',
      other: '其他回答', custom: '填写其他回答', submit: '提交回答', native: '回原工具处理',
      sending: '正在提交；请等待接收确认。', awaiting: '回答已暂存，正在等待原工具确认接收。',
      unconfirmed: '回答接收未获确认。请回原工具处理；此处不会重复发送。', unavailable: '此提问暂不能在此回答，请回原工具处理。',
      expired: '此提问已过期，请回原工具查看当前问题。', resolved: '提问已解决。', returning: '正在交回原工具…',
      nativeDone: '已交回原工具，请在原工具继续处理。', nativeError: '未能交回原工具。请直接返回原工具处理。',
      statusError: '提问连接暂不可用，请回原工具处理。', validation: '请完整回答每一个问题；选择其他回答后需要填写文字。'
    },
    en: { title: 'Agent questions', count: 'Agent questions · {count} pending', close: 'Close agent questions',
      scope: 'Manual answers here support native questions from OpenCode 1.x (starting at 1.18.31) and MiMoCode 0.1.x (starting at 0.1.15). Codex and other tools remain read-only for waiting input; continue in the original tool. This panel never approves tools or answers automatically.',
      empty: 'No agent questions are available here.', provider: 'Tool', session: 'Session', call: 'Tool call',
      question: 'Question {index}', single: 'Choose one option. Every question needs an answer.', multiple: 'Choose one or more options. Every question needs an answer.',
      other: 'Other answer', custom: 'Write another answer', submit: 'Submit answers', native: 'Continue in original tool',
      sending: 'Submitting; waiting for receipt confirmation.', awaiting: 'Answer held; waiting for the original tool to confirm receipt.',
      unconfirmed: 'Receipt was not confirmed. Continue in the original tool; this panel will not send the answer again.', unavailable: 'This question cannot be answered here. Continue in the original tool.',
      expired: 'This question expired. Check the current question in the original tool.', resolved: 'Question resolved.', returning: 'Returning to the original tool…',
      nativeDone: 'Returned to the original tool. Continue there.', nativeError: 'Could not return the question. Continue directly in the original tool.',
      statusError: 'The question connection is unavailable. Continue in the original tool.', validation: 'Answer every question. Write a response for each selected Other answer.'
    }
  };
  function create(options = {}) {
    const bridge = options.bridge, doc = options.document || root.document;
    const actions = doc?.querySelector('.top-actions');
    if (!actions) return Object.freeze({ update() {}, updateLanguage() {}, dispose() {} });
    let language = options.language === 'en' ? 'en' : 'zh', disposed = false, rows = [], status = null, selectedId = null, restoreFocus = null, notice = '';
    const drafts = new Map(), dismissed = new Set(), listeners = [];
    const has = name => typeof bridge?.[name] === 'function';
    const tr = (key, values) => COPY[language][key].replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? ''));
    const node = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = String(text); return el; };
    const on = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); };
    const button = node('button', 'icon-button manual-questions-button', '?'); button.id = 'manual-questions-button'; button.type = 'button';
    const badge = node('span', 'manual-question-badge'); badge.setAttribute('aria-hidden', 'true'); button.append(badge); actions.append(button);
    const dialog = node('dialog', 'office-dialog manual-questions-dialog'); dialog.id = 'manual-questions-dialog';
    dialog.setAttribute('aria-labelledby', 'manual-questions-title'); dialog.setAttribute('aria-describedby', 'manual-questions-scope');
    const header = node('div', 'dialog-header'), title = node('h2'); title.id = 'manual-questions-title';
    const close = node('button', 'dialog-close', '×'); close.id = 'manual-questions-close'; close.type = 'button'; header.append(title, close);
    const scope = node('p', 'manual-question-scope'); scope.id = 'manual-questions-scope';
    const feedback = node('p', 'manual-question-feedback'); feedback.id = 'manual-questions-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const list = node('nav', 'manual-question-list'); list.id = 'manual-question-list';
    const content = node('div'); content.id = 'manual-question-content'; dialog.append(header, scope, feedback, list, content); doc.body.append(dialog);
    let renderedDraft = null, renderedLanguage = '', inputs = [], submit = null, fallback = null, delivery = null;
    function current() { return rows.find(row => row.id === selectedId); }
    function expired(row) { if (row?.expiresAt == null) return false; const at = new Date(row.expiresAt).getTime(); return Number.isFinite(at) && at <= Date.now(); }
    function canAnswer(row, draft) { return Boolean(row && draft && ['opencode', 'mimocode'].includes(row.provider) && status?.available !== false && !status?.error && row.state === 'waiting' && row.canAnswer && !expired(row) && !draft.lock && !draft.returning && has('answerAgentQuestion')); }
    function answersFor(row, draft) {
      const result = Object.create(null);
      if (!Array.isArray(row?.questions) || !row.questions.length) return null;
      for (const question of row.questions) {
        const answer = draft.answers.get(question.id), values = [];
        for (const key of answer?.selected || []) {
          if (key === 'other') { const text = answer.text.trim(); if (!text || text.length > 4000 || question.allowOther === false) return null; values.push(text); }
          else { const option = question.options?.[Number(key.slice(2))]; if (!option || key !== 'o:' + Number(key.slice(2))) return null; values.push(option.label); }
        }
        if (!values.length || (!question.multiSelect && values.length !== 1) || new Set(values).size !== values.length) return null;
        result[question.id] = values;
      }
      return result;
    }
    function updateControls() {
      const row = current(), draft = drafts.get(selectedId), enabled = canAnswer(row, draft);
      for (const control of inputs) control.disabled = !enabled || (control.tagName === 'TEXTAREA' && !draft.answers.get(control.dataset.questionId)?.selected.includes('other'));
      if (submit) submit.disabled = !enabled || !answersFor(row, draft);
      if (fallback) fallback.disabled = !row || draft?.returning || draft?.lock === 'sending' || !has('returnQuestionToNative');
      if (delivery) {
        const key = draft?.returning ? 'returning' : draft?.lock === 'sending' ? 'sending' : draft?.lock === 'unconfirmed' ? 'unconfirmed'
          : draft?.lock === 'awaiting-delivery' ? 'awaiting' : expired(row) ? 'expired' : !enabled ? 'unavailable' : '';
        delivery.textContent = key ? tr(key) : ''; delivery.dataset.error = String(key === 'unconfirmed');
      }
    }
    async function answer() {
      const row = current(), draft = drafts.get(selectedId);
      if (!canAnswer(row, draft)) return;
      const answers = answersFor(row, draft);
      if (!answers) { notice = 'validation'; render(); return; }
      draft.lock = 'sending'; notice = ''; updateControls();
      try {
        const result = await bridge.answerAgentQuestion({ id: row.id, answers });
        if (disposed || drafts.get(row.id) !== draft) return;
        if (result?.ok === false || result?.id !== row.id || result?.state !== 'awaiting-delivery') throw new Error('Unconfirmed');
        if (draft.lock !== 'unconfirmed') draft.lock = 'awaiting-delivery';
      } catch { if (!disposed && drafts.get(row.id) === draft) draft.lock = 'unconfirmed'; }
      finally { if (!disposed) render(); }
    }
    async function returnNative() {
      const row = current(), draft = drafts.get(selectedId);
      if (!row || !draft || draft.returning || draft.lock === 'sending' || !has('returnQuestionToNative')) return;
      draft.returning = true; notice = ''; updateControls();
      try {
        const result = await bridge.returnQuestionToNative(row.id);
        if (disposed) return;
        if (result?.ok === false || result?.dismissed !== true) throw new Error('Not returned');
        dismissed.add(row.id); rows = rows.filter(item => item.id !== row.id); drafts.delete(row.id);
        if (selectedId === row.id) selectedId = rows[0]?.id || null;
        notice = 'nativeDone';
      } catch { if (!disposed) notice = 'nativeError'; }
      finally { if (!disposed) { draft.returning = false; render(); } }
    }
    function renderForm() {
      const row = current(), draft = drafts.get(selectedId);
      if (renderedDraft === draft && renderedLanguage === language) { updateControls(); return; }
      const focus = doc.activeElement, focusKey = content.contains(focus) ? focus.dataset.focusKey : null;
      const selection = focus?.tagName === 'TEXTAREA' ? [focus.selectionStart, focus.selectionEnd] : null;
      renderedDraft = draft; renderedLanguage = language; inputs = []; submit = null; fallback = null; delivery = null;
      content.replaceChildren();
      if (!row || !draft) { content.append(node('p', 'manual-question-empty', tr('empty'))); return; }
      const provider = root.OfficeProviders?.getProvider(row.provider)?.name || row.provider;
      const attribution = node('p', 'manual-question-attribution', tr('provider') + ': ' + provider + ' · ' + tr('session') + ': ' + row.sessionId + ' · ' + tr('call') + ': ' + row.toolCallId);
      const form = node('form'); form.id = 'manual-question-form'; form.noValidate = true; content.append(attribution, form);
      row.questions.forEach((question, index) => {
        const field = node('fieldset', 'manual-question-fieldset'), legend = node('legend', '', question.header || tr('question', { index: index + 1 }));
        const prompt = node('p', 'manual-question-text', question.question); prompt.id = 'manual-question-prompt-' + index;
        field.setAttribute('aria-describedby', prompt.id); field.append(legend, prompt, node('p', 'manual-question-hint', tr(question.multiSelect ? 'multiple' : 'single')));
        const answer = draft.answers.get(question.id);
        let otherText = null;
        const addOption = (key, label, description) => {
          const option = node('label', 'manual-question-option'), input = node('input'), copy = node('span', 'manual-question-option-copy');
          input.type = question.multiSelect ? 'checkbox' : 'radio'; input.name = 'manual-question-' + index; input.value = key;
          input.dataset.focusKey = index + ':' + key; input.checked = answer.selected.includes(key); inputs.push(input);
          copy.append(node('span', '', label)); if (description) copy.append(node('small', '', description)); option.append(input, copy); field.append(option);
          input.addEventListener('change', () => {
            if (!canAnswer(current(), draft)) return;
            answer.selected = question.multiSelect ? (input.checked ? [...new Set([...answer.selected, key])] : answer.selected.filter(value => value !== key)) : [key];
            if (otherText) otherText.hidden = !answer.selected.includes('other');
            notice = ''; updateControls();
          });
        };
        (question.options || []).forEach((option, optionIndex) => addOption('o:' + optionIndex, option.label, option.description));
        if (question.allowOther !== false) {
          addOption('other', tr('other'));
          otherText = node('textarea', 'manual-question-custom'); otherText.value = answer.text; otherText.maxLength = 4000;
          otherText.dataset.questionId = question.id; otherText.dataset.focusKey = index + ':text'; otherText.hidden = !answer.selected.includes('other');
          otherText.setAttribute('aria-label', (question.header || tr('question', { index: index + 1 })) + ' · ' + tr('custom'));
          otherText.addEventListener('input', () => { if (canAnswer(current(), draft)) { answer.text = otherText.value; notice = ''; updateControls(); } });
          inputs.push(otherText); field.append(otherText);
        }
        form.append(field);
      });
      delivery = node('p', 'manual-question-feedback'); delivery.id = 'manual-question-delivery'; delivery.setAttribute('role', 'status'); delivery.setAttribute('aria-live', 'polite');
      const controls = node('div', 'manual-question-actions'); submit = node('button', 'button button-warm', tr('submit')); submit.type = 'submit'; submit.id = 'manual-question-submit'; submit.dataset.focusKey = 'submit';
      fallback = node('button', 'button button-paper', tr('native')); fallback.type = 'button'; fallback.id = 'manual-question-native'; fallback.dataset.focusKey = 'native'; fallback.addEventListener('click', returnNative);
      controls.append(submit, fallback); form.append(delivery, controls); form.addEventListener('submit', event => { event.preventDefault(); void answer(); });
      updateControls();
      if (focusKey && dialog.open) {
        const replacement = [...content.querySelectorAll('[data-focus-key]')].find(item => item.dataset.focusKey === focusKey);
        if (replacement && !replacement.disabled) { replacement.focus({ preventScroll: true }); if (selection && replacement.tagName === 'TEXTAREA') replacement.setSelectionRange(...selection); }
      }
    }
    function render() {
      if (disposed) return;
      const count = rows.length; button.setAttribute('aria-label', tr('count', { count })); button.title = tr('count', { count });
      badge.textContent = String(count); badge.hidden = !count;
      title.textContent = tr('title'); close.setAttribute('aria-label', tr('close')); scope.textContent = tr('scope'); list.setAttribute('aria-label', tr('title'));
      feedback.textContent = notice ? tr(notice) : status?.error || status?.available === false ? tr('statusError') : '';
      feedback.dataset.error = String(notice === 'nativeError' || Boolean(status?.error));
      const focusedId = list.contains(doc.activeElement) ? doc.activeElement.dataset.questionId : null;
      const fragment = doc.createDocumentFragment();
      for (const row of rows) {
        const provider = root.OfficeProviders?.getProvider(row.provider)?.name || row.provider;
        const item = node('button', 'manual-question-nav', provider + ' · ' + row.sessionId + ' · ' + (row.questions?.[0]?.header || tr('question', { index: 1 })));
        item.type = 'button'; item.dataset.questionId = row.id; item.setAttribute('aria-pressed', String(row.id === selectedId)); item.setAttribute('aria-controls', 'manual-question-content');
        item.addEventListener('click', () => { selectedId = row.id; notice = ''; render(); }); fragment.append(item);
      }
      list.replaceChildren(fragment);
      if (focusedId) [...list.children].find(item => item.dataset.questionId === focusedId)?.focus({ preventScroll: true });
      renderForm();
    }
    function update(snapshot) {
      if (disposed) return;
      status = snapshot?.questionStatus || null;
      const next = (Array.isArray(snapshot?.questions) ? snapshot.questions : []).filter(row => row && typeof row.id === 'string' && Array.isArray(row.questions) && !dismissed.has(row.id));
      for (const [id] of drafts) if (!next.some(row => row.id === id)) { drafts.delete(id); dismissed.add(id); notice = 'resolved'; }
      for (const row of next) {
        const binding = JSON.stringify([row.provider, row.sessionId, row.toolCallId, row.questions]);
        let draft = drafts.get(row.id);
        if (!draft || draft.binding !== binding) {
          draft = { binding, lock: draft?.lock || '', returning: false, answers: new Map(row.questions.map(question => [question.id, { selected: !(question.options || []).length && question.allowOther !== false ? ['other'] : [], text: '' }])) };
          drafts.set(row.id, draft);
        }
        if (row.state === 'unconfirmed') draft.lock = 'unconfirmed';
        else if (row.state === 'awaiting-delivery' && draft.lock !== 'unconfirmed') draft.lock = 'awaiting-delivery';
      }
      rows = next; if (!rows.some(row => row.id === selectedId)) selectedId = rows[0]?.id || null;
      render();
    }
    on(button, 'click', () => { if (disposed || dialog.open) return; restoreFocus = doc.activeElement; render(); dialog.showModal(); close.focus(); });
    on(close, 'click', () => dialog.close());
    on(dialog, 'close', () => { if (!disposed && restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true }); });
    render();
    return Object.freeze({ update, updateLanguage(value) { language = value === 'en' ? 'en' : 'zh'; render(); }, dispose() { disposed = true; drafts.clear(); rows = []; for (const remove of listeners) remove(); if (dialog.open) dialog.close(); dialog.remove(); button.remove(); } });
  }
  root.OfficeManualQuestions = Object.freeze({ create });
})(typeof globalThis === 'object' ? globalThis : this);
