# Oryx

Dental practice management SaaS built with Next.js.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

## Contraintes Next.js 16
`middleware.ts` n'est pas utilisable dans ce projet (Next.js 16 + proxy.ts). La protection des routes se fait dans `proxy.ts`.
