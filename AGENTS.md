# Working on AI Office Workspace

The macOS app is in `office/`. The repository root preserves upstream reference code and the authoritative provider registry in `agents/`; do not flatten or move these paths independently. Root package commands belong to the reference project.

- App dependencies: `npm --prefix office ci`.
- Prepare artwork only from an explicitly supplied, authorized local upstream checkout: `node office/scripts/prepare-local-artwork.cjs --from /absolute/path`. Never download or publish restricted artwork automatically.
- Tests: `npm --prefix office test`. Native checks: `npm --prefix office run verify:renderer` and `office/test/visitor-renderer-smoke.cjs` via Electron.
- Build: `npm --prefix office run build:mac`.
- Preserve real session identities, parent relationships, state evidence, provider catalog compatibility, bilingual UI, reduced motion, and passive observation. Do not approve tools or send AI messages.
- Do not commit dependencies, installers, private runtime data, settings, credentials, restored avatars or the upstream application icon. Preserve all notices.
- Upstream architecture reference: `UPSTREAM-AGENTS.md`; app behavior: `office/README.md`.
