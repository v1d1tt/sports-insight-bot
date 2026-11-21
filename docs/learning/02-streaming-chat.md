# 02: Streaming chat with saved Chats and a rate limit

Ticket: [#3](https://github.com/v1d1tt/sports-insight-bot/issues/3). The Visitor can now chat with the Analyst. The reply streams in word by word and renders as Markdown. Chats are saved in the Visitor's own browser.

## What this slice built

- `POST /api/chat`: the server streams the Analyst's reply as server-sent events (SSE): `text` events, then exactly one `done` or `error`.
- The Analyst (`backend/app/analyst.py`): the system prompt, the 20-Message history limit, and the mapping from model errors to friendly messages. Its only outside dependency is a model-provider adapter: OpenRouter for real, a fake in tests.
- The page: a Chat list (new, open, rename, delete, automatic titles), the Messages, a "thinking" line, the streaming reply, Stop, an error with Retry, and a "limit reached" message on HTTP 429.
- Chats and Messages live in IndexedDB in the browser (ADR 0001). The server keeps nothing.
- `"fluid": true` in `vercel.json` (see Decisions).

## How the code flows

1. `ChatView.svelte` `submit()` calls `session.send(text)` in `chat-session.svelte.ts`.
2. `ChatSession.send()` saves the Visitor's Message with `chat-store.ts`: `createChat()` for the first Message of a new Chat, then `addMessage(chatId, 'visitor', text)`. The first Visitor Message also becomes the Chat's title.
3. `ChatSession.#reply()` calls `streamReply(history, { onText, signal })` in `chat-stream.ts`.
4. `streamReply()` keeps the last 20 non-empty Messages and sends `POST /api/chat` with `{ messages: [{ role, text }] }`.
5. On Vercel, the rewrite `/api/(.*)` sends it to the backend service. `chat()` in `backend/app/main.py` gets a checked `ChatRequest` (Visitor Messages up to 2,000 characters, earlier Analyst replies up to 12,000) and a model provider from `get_model_provider()`. That function builds an `OpenRouterProvider` around the one shared `httpx2.AsyncClient` that `lifespan()` creates at startup.
6. `stream_reply()` in `analyst.py` builds the prompt with `build_prompt()`: the system prompt, then the last 20 Messages with `visitor` → `user` and `analyst` → `assistant`.
7. `OpenRouterProvider.stream_reply()` in `openrouter.py` posts to `https://openrouter.ai/api/v1/chat/completions` with `stream: true` and reads the answer line by line. Each `data:` line is a JSON chunk; the text is in `choices[0].delta.content`. It skips `: OPENROUTER PROCESSING` keep-alive lines and stops at `data: [DONE]`. Any failure becomes a `ProviderError(code)`.
8. Back in `analyst.py`, each text piece becomes a `TextEvent`. The end becomes a `DoneEvent`. A `ProviderError` becomes an `ErrorEvent` through `error_for(code)`.
9. `chat()` turns each event into `ServerSentEvent(event=..., data=...)`. FastAPI writes `event: text` / `data: {"text": "..."}` lines and sends a `: ping` every 15 seconds when nothing else happens.
10. In the browser, `streamReply()` pipes the response body through `TextDecoderStream` (bytes → text) and `EventSourceParserStream` (text → events), and calls `onText()` for each text event.
11. `onText()` grows `ChatSession.draft`. `ChatView.svelte` renders it with `renderMarkdown()` from `markdown.ts` inside `{@html}`.
12. When the reply ends, `ChatSession` saves it with `addMessage(chatId, 'analyst', text)`. After Stop it saves the part the Visitor saw. After an error the partial text stays on screen with the message and a Retry button. Retry sends the same history again.

## The stream protocol

| Event | Data | Meaning |
|---|---|---|
| `text` | `{"text": "..."}` | The next piece of the reply. |
| `done` | `{}` | The reply is complete. |
| `error` | `{"code", "message", "retryable"}` | The reply failed. `message` is safe to show. |

A reply is zero or more `text` events, then exactly one `done` or `error`. The client ignores event names it does not know, so later slices can add `field_placement` and `blocked` without breaking old pages.

| Model error | `code` | Retry button | Message |
|---|---|---|---|
| 429 (provider rate limit) | `model_busy` | yes | The Analyst is busy right now. Please try again in a moment. |
| 408, 5xx, network failure, timeout | `model_unavailable` | yes | The Analyst could not answer just now. Please try again. |
| 401, 402 (bad key, no credits) | `analyst_offline` | no | The Analyst is offline right now. Please try again later. |
| 403 (moderation) | `message_rejected` | no | The Analyst cannot answer this Message. Please rephrase it. |
| other 4xx | `bad_request` | no | The Analyst could not read this Chat. Please start a new Chat. |
| no text at all | `empty_reply` | yes | The Analyst sent an empty reply. Please try again. |
| a bug in our code | `internal_error` | yes | Something went wrong on our side. Please try again. |

The provider's own error text goes to the server log only, never to the Visitor.

## Why each library

| Part | Pick (version) | Usual default | Why this one |
|---|---|---|---|
| Call OpenRouter | `httpx2` 2.16.2 + a 15-line SSE reader | `openai` SDK | One endpoint and a simple wire format: the same SSE the page reads from our server. OpenRouter's error codes and mid-stream error chunks are easy to see and map. You can explain every line. `httpx2` is Pydantic's maintained fork of `httpx` (same API; `httpx` has had no release since 0.28.1 in Dec 2024). The `openai` SDK now uses `httpx2` itself. Other options: OpenRouter's own SDK (generated, changes daily), PydanticAI (would move the seam into the framework). |
| SSE on the server | FastAPI 0.165.0 `EventSourceResponse` | `StreamingResponse` with hand-written lines | Built in: correct wire format, keep-alive pings, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. |
| Read SSE in the page | `eventsource-parser` 4.1.3 | hand-written `split('\n\n')`, `@microsoft/fetch-event-source` | The browser's `EventSource` only does GET. This parser handles chunks that cut a line in half, comment lines (our pings) and CRLF. It is tiny and used by many SDKs. `@microsoft/fetch-event-source` has had no code changes for years. |
| IndexedDB | `idb` 8.0.4 | Dexie, `localStorage` | A thin typed wrapper over the real IndexedDB API (object stores, indexes, transactions), so you learn IndexedDB itself. Dexie adds its own query layer and live queries that the page does not need. `localStorage` is synchronous, small and string-only. |
| IndexedDB in tests | `fake-indexeddb` 6.2.8 | mocking the store | jsdom has no IndexedDB. This is a full in-memory one, so the tests run the real store code. |
| Markdown | `markdown-it` 15.0.3, `html: false` | `marked` | Safe by default: raw HTML shows as text, and `validateLink` drops `javascript:`, `vbscript:`, `file:` and most `data:` links. `marked` does no sanitising at all. Tables and lists work out of the box. |
| Sanitising | `dompurify` 3.4.18 | none | The second layer: it cleans markdown-it's HTML in case a future option or plugin lets something through. Its hook makes links open in a new tab with `rel="noopener noreferrer"`. |

Other versions: Svelte 5.59.1, Vite 8.3.8, Vitest 5.1.1, Playwright 1.65.1, Pydantic 2.14.4.

## Decisions made in this slice

- **History limit on both sides.** The page sends the last 20 non-empty Messages; the server keeps the last 20 again (it never trusts the page).
- **Limits per role.** Visitor Messages: up to 2,000 characters. Earlier Analyst replies sent back as history: up to 12,000. The first version used 2,000 for both, and the live check found the bug (see Gotchas).
- **Reply size and time.** `max_tokens` is 1,500 (about 6,000 characters). The OpenRouter call has a 5 s connect timeout and a 30 s read timeout (the longest wait between two pieces).
- **One HTTP client per server instance**, made in FastAPI's `lifespan()`. With Fluid compute, a warm instance reuses its open connection to OpenRouter and skips a new TLS handshake.
- **Stop closes the model call too.** `aclosing()` in `analyst.py` closes the provider stream when the generator stops, so the connection to OpenRouter closes and the model stops writing tokens we would pay for.
- **What gets saved.** A complete reply, or the part before Stop. A reply that failed is not saved; its text stays on screen until Retry.
- **New Chat saves nothing** until the first Message, so empty Chats do not fill the list.
- **The 429 time.** The firewall blocks an IP for 1 hour after it passes the limit, so the page says "try again after" the time of the first 429 plus 60 minutes. It keeps that time in `localStorage`, so a second 429 or a reload does not move it.
- **`"fluid": true` in `vercel.json`.** Streaming needs a long enough function time. Fluid compute is the default for projects made after April 2025 (this one is), and gives 300 s on Hobby. The line makes the dependency visible in the repo.
- **No OpenRouter app-attribution headers**, and the key is a `SecretStr`, so it shows as `**********` if it is ever printed.

## Tests

| Layer | File | It checks |
|---|---|---|
| pytest (seam 1) | `backend/tests/test_chat_api.py` | Through `POST /api/chat` with a fake provider: text events then `done`; 429 → retryable `model_busy`, no `done`; text then 502 → partial text + `model_unavailable`; 402 → not retryable and the provider's words do not leak; only the last 20 Messages reach the model; a 2,001-character Visitor Message → 422 before any model call; a long Analyst reply in the history is accepted; an empty reply → `empty_reply`; a crash in our code → `internal_error`. |
| pytest (adapter contract) | `backend/tests/test_openrouter.py` | The real `OpenRouterProvider` against recorded OpenRouter stream bytes through `httpx2.MockTransport` (no network): text pieces, keep-alive lines skipped, the request (URL, key, model, `stream: true`, no attribution header); HTTP 429; a mid-stream error chunk; timeout → 408; connection error → 502. |
| Vitest | `frontend/src/lib/chat-stream.test.ts` | The stream client with a real `ReadableStream` body: pieces in order (even when a chunk cuts a line), the 20-Message limit, error events, 429 with the time kept, network failure, a stream that ends early, Stop. |
| Vitest | `frontend/src/lib/chat-store.test.ts` | The Chat store on `fake-indexeddb`: automatic titles, Message order, newest Chat first, rename, delete with its Messages, data still there after the store opens again. |
| Vitest | `frontend/src/lib/markdown.test.ts` | Bold, lists and tables render; raw HTML shows as text; `javascript:` links are dropped; links open in a new tab. |
| Playwright (seam 3) | `frontend/e2e/chat.spec.ts` | In Chromium against the built page with a mocked API: a reply streams in (a real local SSE server) and renders as Markdown; Stop keeps the partial reply, also after a reload; Chats survive a reload; rename and delete; two browser contexts (two Visitors) never see each other's Chats; an error and Retry; HTTP 429 shows the limit message with a time. |

Every `/api` request that a Playwright test does not mock fails on purpose (`mockApi()` in `e2e/mock-api.ts`), so no test can reach a real server or the real model.

Red before green: the chat API tests and the page tests were written first and seen failing (for example, the error tests failed because the error escaped the stream). The adapter tests were written after the adapter, so I broke the adapter on purpose once (408 → 499) and saw a test fail. The history test first had a wrong expected value (the last 20 of 25 Messages start at Message 6, not 7); the code was right.

## Checked by hand

- **Local, real model:** first words after 1.12 s; a table, headings and lists render; Stop keeps the partial reply after a reload; the error + Retry flow works; rename works; phone width (375 px) shows one column with a "Chats (n)" button.
- **CLI preview** (`vercel deploy`, before any push): first words after **1.38 s** on the first request and **0.56 s** on the next; the body arrived in 7-8 network pieces, so Vercel streams it and does not buffer it. Stop, error + Retry (the browser's `fetch` made to fail once) and reload were checked there too.

## Setup outside the code

- **Vercel firewall rule "Chat rate limit"** (ticket #3): condition Request Path equals `/api/chat` AND Method equals `POST`; rate limit by IP, fixed window 600 s (10 minutes), 20 requests; over the limit: HTTP 429, persistent for 1 hour. The PRD first said "20 per hour", but the Hobby plan allows a window of at most 10 minutes, so the 1-hour block replaces the long window. The Vercel MCP could not create the rule (404 "access denied" on the firewall config), so the owner created it with the Vercel CLI 64.0.2 on 2026-11-21. It is live: `vercel firewall rules list` shows "Chat rate limit, Rate Limit (20/600s), Enabled". The commands:

  ```bash
  vercel firewall rules add "Chat rate limit" --condition '{"type":"path","op":"eq","value":"/api/chat"}' --condition '{"type":"method","op":"eq","value":"POST"}' --action rate_limit --rate-limit-window 600 --rate-limit-requests 20 --rate-limit-keys ip --rate-limit-algo fixed_window --rate-limit-action rate_limit --duration 1h --yes
  ```

  ```bash
  vercel firewall publish --yes
  ```

  The first command only stages a draft; `publish` makes it live (without `--yes` it asks for confirmation). Dashboard path: project → Firewall → New Rule → the same settings → Save → Review Changes → Publish.
- **What the 1-hour block covers.** Vercel's docs say a persistent action stores the IP in the platform-wide firewall and blocks it *before* any rule runs. So for that hour, likely every request from the IP is blocked, the page included. A Visitor who reloads then sees Vercel's own block page, not the app's "limit reached" message. The app's message shows for the 429 that starts the block. (Not tested live: it needs 21 real requests.)
- **`OPENROUTER_API_KEY`** is set on Vercel for Preview and Production.

## Gotchas found

- **A docs flag the installed CLI did not have.** The Vercel docs showed `vercel firewall publish --confirm-name <project>`; CLI 64.0.2 rejects that flag. Check `--help` of the installed version before writing a command for someone else to run.

- **The 2,000-character limit hit the Analyst's own replies.** A follow-up question failed with HTTP 422, because the earlier reply (sent back as history) was longer than 2,000 characters. Only the live check found it. Fix: one Pydantic model per role, chosen by `role` (a discriminated union).
- **`route.fulfill()` cannot stream.** It sends the whole body at once. The streaming and Stop tests start a small SSE server inside the test and send `/api/chat` to it with `route.continue({ url })`.
- **`getByLabel('Message')` also matched the log named "Messages".** Use `getByRole('textbox', { name: 'Message' })`.
- **`tsc` with `module: nodenext` wants file extensions** in the e2e imports: `./mock-api.ts` (allowed by `allowImportingTsExtensions`).
- **The `:free` model variant answered 429** (busy upstream) during the local check. The page showed "The Analyst is busy", as designed. Local checks used the paid model ID.
- **The Hobby plan limits a rate-limit window to 10 minutes.** Check plan limits for every number the host must enforce when the PRD is written.

## Interview questions

1. **Why server-sent events and not WebSockets?**
   The reply flows one way, server to page. SSE is plain HTTP: a normal POST whose response stays open, so it works through Vercel's functions and proxies with no special server. WebSockets need a long-lived two-way connection, which Vercel Functions do not host. The page reads SSE from `fetch()` because the browser's `EventSource` cannot send a POST body.

2. **The Visitor presses Stop. What happens, step by step?**
   The page aborts the `fetch()` with an `AbortController`. The browser closes the connection. Starlette sees the disconnect and stops our generator. `aclosing()` in the Analyst then closes the provider's generator, which leaves its `async with client.stream(...)` block and closes the connection to OpenRouter, so the model stops writing tokens we pay for. The page keeps the text it already has and saves it.

3. **How do you know the rendered Markdown is safe?**
   Two layers. markdown-it runs with `html: false`, so `<script>` or `<img onerror>` shows as text, and its link check drops `javascript:` links. Then DOMPurify cleans the HTML before Svelte's `{@html}` puts it in the page. Tests feed both attacks in and check that no `img`, `script` or `javascript:` link comes out.

4. **The server is stateless. How does the Analyst remember the conversation?**
   The page sends the last 20 Messages with every request, and the server trims to 20 again. Any server instance can answer any request, and no Visitor can see another's Chat, because the Chats only live in each Visitor's own browser. The cost: a long Chat forgets its oldest Messages, and Chats do not move between devices.
