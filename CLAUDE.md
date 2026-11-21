# Sports Insight Bot

A multimodal sports analysis chatbot. This repo is project 1 of the portfolio upgrade. Load the `project-upgrade` skill for any work here.

## Project rules

- **Git:** commit only under the user's own git identity. No `Co-Authored-By: Claude` line and no mention of Claude in commit messages, PR titles or PR text.
- **Branch + PR per slice:** each slice works on its own branch (`slice/<NN>-<short-name>`) from an up-to-date `main`. At the end of the slice, after its tests pass: one commit, push the branch, open a PR whose body says `Closes #<ticket>`. Never push mid-slice, never push to `main` directly.
- **Merging (merge rights granted by the owner on 2026-11-21):** the agent turns on auto-merge for each slice PR with `gh pr merge <n> --auto --merge --delete-branch`. The PR merges itself with a merge commit when the required CI check ("Lint and test") is green; branch protection on `main` enforces that check. Merged branches are deleted: GitHub deletes the remote branch, and the agent deletes the local branch and fast-forwards local `main`.
- **README:** update `README.md` in the same commit as each slice, so it always matches the code.
- **Docs first:** look up every library and platform API in Context7 before writing code for it.
- **Learning notes:** each slice adds `docs/learning/<slice-id>.md`.
- **Secrets:** `backend/.env` holds `OPENROUTER_API_KEY`. Never commit it.

## Agent skills

### Issue tracker

Issues, the PRD and slice tickets live in GitHub Issues on `v1d1tt/sports-insight-bot` (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when the first term or decision is settled. See `docs/agents/domain.md`.
