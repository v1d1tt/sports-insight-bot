# 01: Walking skeleton

Ticket: [#2](https://github.com/v1d1tt/sports-insight-bot/issues/2). A walking skeleton is the thinnest version of the app that goes through every layer: page → API → configuration → page, deployed and tested. Later slices add features to this frame.

## What this slice built

- A new web page in `frontend/` (Svelte 5 + Vite + TypeScript). It asks the API for its health and shows "Analyst online" with the model ID, or "Analyst offline".
- A new API in `backend/` (FastAPI, managed with uv) with one route: `GET /api/health`.
- `vercel.json`, which runs both parts as one Vercel project with two Services.
- One test layer per part (pytest, Vitest, Playwright) and a CI workflow that runs them on GitHub.
- Visual feedback: Vercel Toolbar comments on preview deploys, sv-agentation in local dev.
- The old app is gone: `frontend/index.html`, `script.js`, `style.css`, `backend/backend.py`, `requirements.txt`, `Procfile` and the old `venv/`.

## How the code flows

On Vercel:

1. The browser asks for `/`. The rewrite `/(.*)` in `vercel.json` sends it to the **frontend** service, which serves `index.html` from the Vite build.
2. `index.html` loads `src/main.ts`. It calls `mount(App, ...)`, and `App.svelte` renders `<AnalystStatus />`.
3. `src/lib/AnalystStatus.svelte` runs `checkHealth()`, which calls `fetch('/api/health')`.
4. The rewrite `/api/(.*)` sends the request to the **backend** service. Vercel loads `app` from `backend/app/main.py` (the entrypoint `app.main:app`). The service sees the full path, `/api/health`.
5. `health()` in `app/main.py` gets a `Settings` object through the `SettingsDep` dependency. `get_settings()` in `app/config.py` creates `Settings()`, which reads the `OPENROUTER_MODEL` environment variable (default: `google/gemma-4-26b-a4b-it`).
6. `health()` returns `Health(status="ok", model=...)`. FastAPI checks it against the `Health` model and sends it as JSON.
7. In the component, the `{#await}` block first shows "Checking the Analyst…". Then `{:then}` shows "Analyst online" and the model ID, or `{:catch}` shows "Analyst offline". A non-200 answer also goes to `{:catch}`, because `checkHealth()` throws when `response.ok` is false.

In local dev, step 1 is the Vite dev server (port 5173), and step 4 is Vite's proxy (`server.proxy` in `vite.config.ts`). It forwards `/api` to `fastapi dev` on port 8000. The page uses the same relative path, `/api/health`, in both places, so it needs no CORS setup and no API URL setting.

## Why each part

| Part | Version | Why |
|---|---|---|
| Svelte | 5.59.1 | Compiles components to small JavaScript. Runes (`$state`, `$derived`) make state explicit. Chosen over the usual React default (see the PRD). |
| Vite | 8.3.8 | Dev server with fast reload, and the static build (`dist/`). Vercel detects it with no adapter. |
| @sveltejs/vite-plugin-svelte | 7.3.1 | Lets Vite compile `.svelte` files. |
| TypeScript | 6.0.3 | Types for the page code (the create-vite template pins 6.0; TypeScript 7 exists but the template does not use it yet). |
| svelte-check | 4.7.8 | Type-checks `.svelte` files (`npm run check`). |
| FastAPI | 0.165.0 | Typed routes, response models, dependency injection, and a test client. |
| Pydantic / pydantic-settings | 2.14.4 / 2.16.3 | `BaseSettings` reads environment variables into a typed object. |
| uvicorn (via `fastapi[standard]`) | 0.54.0 | The local server behind `fastapi dev`. Vercel runs the app with its own runtime. |
| uv | 0.12.7 (local) | One tool for Python versions, packages and the lockfile (`uv.lock`). |
| ruff | 0.17.6 | Lint and format for Python, in one fast tool. |
| pytest | 9.2.0 | Python tests. FastAPI's `TestClient` calls the app without a real server. |
| Vitest | 5.1.1 | Component tests that reuse the Vite config. |
| jsdom | 31.0.1 | A browser-like DOM inside Node, so Vitest can render components. |
| @testing-library/svelte / jest-dom | 5.4.2 / 8.0.0 | Render a component and find things the way a user does (by text or role); readable matchers such as `toBeInTheDocument()`. |
| Playwright | 1.65.1 | Tests the built page in a real Chromium browser. |
| sv-agentation | 0.4.0 | Svelte 5 port of Agentation: leave notes on page elements in dev and copy them as Markdown. MIT, about 19k downloads a week, last release June 2026. |
| GitHub Actions | checkout v7, setup-node v7, setup-uv v10.4.0, upload-artifact v7 | CI that runs on GitHub's machines. |

### Decisions made in this slice

- **Vercel Services, not the older `api/` folder.** Vercel's docs now describe `api/*.py` file functions as support for existing projects. Services (beta on all plans, including Hobby) run a Vite frontend and a FastAPI backend side by side, each in its own folder with its own tools, under one domain. The cost: it is a beta feature. If it breaks, the fallback is one `api/index.py` with a rewrite.
- **The folders keep their old names** (`frontend/`, `backend/`). They match Vercel's Services examples, and `backend/.env` stays where it was.
- **The model ID has a default.** Without `OPENROUTER_MODEL`, the API uses `google/gemma-4-26b-a4b-it`, the model the model test picked. Production needs only the API key; local dev sets the `:free` variant in `backend/.env`.
- **`Settings` reads environment variables only, not the `.env` file.** Local dev loads `.env` with `uv run --env-file .env`. Reason: if `Settings` read `.env` itself, the tests would also read your local `.env` and could pass or fail depending on your machine.
- **sv-agentation is loaded only in dev.** `src/main.ts` imports it inside `if (import.meta.env.DEV)`. Vite replaces `import.meta.env.DEV` with `false` in a production build, so the block and the package drop out. Checked: `dist/` has no sv-agentation code.
- **Vercel Toolbar needs no code.** Vercel adds the toolbar to preview deploys for logged-in members of the project.

## Tests

The ticket fixed the seams: one test layer per part.

| Layer | File | It checks | It does not check |
|---|---|---|---|
| pytest | `backend/tests/test_health.py` | `GET /api/health` returns `ok` and the model from `OPENROUTER_MODEL`; without the variable it returns the default model. | Vercel routing. |
| Vitest | `frontend/src/lib/AnalystStatus.test.ts` | The component shows "Analyst online" + model for a healthy answer, and "Analyst offline" for an HTTP 500. `fetch` is replaced with a fake (`vi.stubGlobal`). | A real browser, the real API. |
| Playwright | `frontend/e2e/status.spec.ts` | The built page loads in Chromium and shows the status. `page.route` answers `/api/health` with a fake reply. | The real API. |

The real path (page → Vercel → API) is checked by hand on the preview deploy, and in local dev with both servers running.

Each test was written first and seen failing (red), then the code was written to pass it (green). For example, the default-model test failed with "Field required" until `openrouter_model` got its default value.

## CI from zero

### What CI is

CI (continuous integration) means a server runs your checks every time you push code. You see on GitHub whether the code still lints and the tests still pass, without running anything yourself.

### What a workflow file is

A workflow is a YAML file in `.github/workflows/`. Ours is [`ci.yml`](../../.github/workflows/ci.yml). It has three parts:

- `on:` says **when** it runs: `push` (any branch) and `pull_request`.
- `jobs:` lists the work. We have one job, `test`, named **"Lint and test"**. It runs on a fresh Ubuntu machine (`runs-on: ubuntu-latest`) that GitHub creates for each run and deletes after.
- `steps:` run in order. If one step fails, the job stops and is marked failed. Ours: check out the code → install uv → install API packages → ruff → pytest → install Node.js → install web packages → svelte-check → Vitest → install Chromium → Playwright. If a Playwright test fails, the last step uploads its traces so you can download them from the run page.

### When it runs

- When you push a commit to any branch.
- When a pull request opens or gets new commits. This run tests your branch merged with `main`.

So a pull request shows the check twice: once from the push, once from the pull request. That is expected.

### How to read a green or red check on a pull request

At the bottom of a pull request, GitHub lists the checks:

- **Green tick:** every step passed.
- **Red cross:** a step failed. Click **Details**, then open the red step to see the error (for example a failing test name and the expected and actual values).
- **Yellow dot:** it is still running (about 2-3 minutes for this repo).

You also see the "Vercel" check (the preview build) and its preview URL there.

### Branch protection

Branch protection is a rule on `main`: a pull request can merge only when the required check, "Lint and test", is green. Nobody can merge broken code into `main` by mistake, the agent included.

### Auto-merge

Auto-merge is a switch on one pull request: "merge this when all required checks pass". The agent turns it on with `gh pr merge <n> --auto --merge --delete-branch`. When CI goes green, GitHub merges the pull request with a merge commit, closes the ticket named in `Closes #<n>`, and deletes the branch. If CI goes red, nothing merges, and the pull request waits for a fix.

### What you have to do

Nothing, unless a check is red. Then open the red check, read the error, and ask the agent to fix it (or fix it yourself on the same branch).

## Setup outside the code

- **Vercel project:** two settings changed, with the owner's approval. Root Directory: `frontend` → `.` (the repo root), because `vercel.json` at the root now defines both Services. Framework Preset: `Other` → `Services`; without it, Vercel's remote build built only the page and `/api/health` returned `NOT_FOUND`.
- **Vercel environment variables:** `OPENROUTER_API_KEY` is added by the owner in the Vercel dashboard. `OPENROUTER_MODEL` is optional.
- **GitHub:** branch protection on `main` requires "Lint and test". The repo settings "Allow auto-merge" and "Automatically delete head branches" are on.

## Gotchas found

- **Services need the "Services" Framework Preset.** A local `vercel build` built both services with the preset still on "Other", but Vercel's remote build skipped the backend. `"framework": "services"` in `vercel.json` is not allowed next to `services`, so the preset is a project setting.
- **The Vercel CLI ignores `.gitignore`.** A deploy from the local folder would upload `backend/.env` (with the key). `.vercelignore` lists the files the CLI must never upload. Deploys from GitHub are safe anyway, because `.env` is not in git.
- **`vercel link` edits `.gitignore`.** It added `.env*`, which also hid `.env.example`. The fix is `!.env.example` after it. It also wrote a `.env.local` with a short-lived Vercel token; it was deleted because this project does not use it.
- **Vitest picks up Playwright files.** Vitest's default pattern also matches `*.spec.ts`, so `test.include` in `vite.config.ts` limits Vitest to `src/**/*.test.ts`.
- **Testing Library matches an element's own text.** "Analyst online" is in its own `<strong>`, so `getByText('Analyst online')` finds it exactly.

## Interview questions

1. **The page calls `/api/health` with a relative path. How does that reach the API in dev and in production?**
   In dev, Vite's proxy forwards `/api` to the FastAPI server on port 8000. On Vercel, a rewrite in `vercel.json` sends `/api/*` to the backend service. Both are on the same origin as the page, so the browser needs no CORS headers.

2. **How do you keep a dev-only tool out of the production bundle?**
   Import it dynamically inside `if (import.meta.env.DEV)`. Vite replaces the flag with `false` at build time, and the bundler removes the dead branch and the import. You check it by searching the `dist/` output.

3. **Your tests fake `fetch` and the API. Is that cheating?**
   No. Each test checks one seam. The component test checks what the component shows for a healthy or failing answer. The Playwright test checks that the built page works in a real browser. The pytest test checks the real API route. The parts are joined by hand on the preview deploy. Fakes keep the tests fast, free and the same every time.

4. **What do branch protection and auto-merge give you?**
   `main` only gets code that passed lint and every test layer. The pull request merges by itself when CI is green, so nobody has to wait and click. The risk: the checks are only as good as the tests, so a missing test still lets a bug through.
