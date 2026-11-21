# PRD: Sports Insight Bot upgrade

## Problem Statement

Sports Insight Bot is a portfolio project that no longer works and no longer represents its owner well.

- The Analyst cannot reply at all: its model (`qwen/qwen-2.5-vl-7b-instruct`) has no providers left on OpenRouter.
- Every Visitor shares one conversation: the server keeps a single global history, so one Visitor's Messages and image summaries leak into everyone else's answers. On a serverless host that history also resets at random.
- The README is wrong: it calls the bot RAG (it has no retrieval), names files that do not exist, gives an `npm start` for a frontend with no package file, and the deploy file points at the wrong module. The production deploys run from two other repos.
- The experience is thin: replies arrive all at once as plain text, "New session" reloads the page, one image at a time, no sense of which sport the Visitor cares about, and nothing interactive beyond a text box.
- A recruiter who opens it learns nothing about the owner's judgment, and the owner cannot explain much of the code.

## Solution

Rebuild the app in the same repo as a cricket-first, multimodal sports analyst with an interactive cricket Ground.

A Visitor opens the site, picks a Sport focus (cricket by default), and chats with the Analyst. Replies stream in word by word and render as formatted text (tables, lists). The Visitor can paste, drag or attach up to four images per Message; the browser shrinks them before upload. Chats are kept in the Visitor's own browser, so Visitors never see each other's Chats, and a Visitor can start, rename and delete Chats.

For cricket, the Analyst can show its answer on the Board: a Field placement on the Ground, drawn from a checked tool call. The Visitor can drag fielders, flip the Batter hand, pick the Format and Phase, see live warnings when a Fielding restriction is broken, and ask the Analyst about the field as it now stands. The Visitor can also build a Wagon wheel by tapping where Shots went and ask the Analyst to read the pattern. Voice input uses the browser's speech-to-text. A rate limit, upload limits and a two-layer prompt-injection defense protect the paid model key.

The app runs as one Vercel project (Svelte frontend + FastAPI API) on the model `google/gemma-4-26b-a4b-it`, picked by a six-model test (see `docs/model-eval/`). Every slice is tested, documented in the README and in a learning note, and pushed under the owner's name.

## User Stories

### Chatting with the Analyst

1. As a Visitor, I want to ask the Analyst a cricket question in plain words, so that I get a tactical answer without knowing any special commands.
2. As a Visitor, I want the Analyst's reply to appear word by word as it is written, so that I am not left staring at a spinner.
3. As a Visitor, I want to see that the Analyst is working before the first word arrives, so that I know my Message was sent.
4. As a Visitor, I want replies with tables, lists and bold text rendered properly, so that stats and plans are easy to read.
5. As a Visitor, I want to ask a follow-up question that relies on earlier Messages, so that the conversation feels continuous.
6. As a Visitor, I want to stop a reply that is going the wrong way, so that I can rephrase without waiting.
7. As a Visitor, I want a clear message when the Analyst fails (network, model or limit error), with a way to retry, so that I am never stuck.
8. As a Visitor, I want the Analyst to say when it is not sure, especially about image details, so that I can trust what it does say.
9. As a Visitor, I want to ask about football, basketball, tennis or another sport and still get a useful text answer, so that the app is not useless outside cricket.

### Chats

10. As a Visitor, I want my Chats saved in my browser, so that I can close the tab and come back to them.
11. As a Visitor, I want to start a new Chat without reloading the page, so that a new topic starts clean.
12. As a Visitor, I want a list of my Chats with sensible titles, so that I can find an old one.
13. As a Visitor, I want to rename a Chat, so that its title means something to me.
14. As a Visitor, I want to delete a Chat, so that I can clear things I no longer need.
15. As a Visitor, I want to be sure no other Visitor can see my Chats or influence my answers, so that my questions stay mine.
16. As a Visitor, I want a long Chat to keep working, so that the app does not break after many Messages (only recent Messages go to the model).

### Sport focus

17. As a Visitor, I want to pick a Sport focus (cricket, football, basketball, tennis or Other), so that the Analyst answers in the right frame.
18. As a Visitor, I want to name the team I care about, so that the Analyst can tailor its analysis.
19. As a Visitor, I want cricket to be the default, so that I see the app's strongest features first.
20. As a Visitor, I want the Sport focus to stay with each Chat, so that switching Chats switches context.

### Images

21. As a Visitor, I want to attach a screenshot or photo from a match, so that the Analyst can explain what is happening in it.
22. As a Visitor, I want to paste an image from my clipboard or drag it onto the Chat, so that sharing a screenshot is quick.
23. As a Visitor, I want to attach up to four images in one Message, so that I can compare moments.
24. As a Visitor, I want a preview of each attached image with a way to remove it before sending, so that I send only what I meant.
25. As a Visitor, I want large phone photos to just work, so that I do not have to resize them myself.
26. As a Visitor, I want a clear message if a file is not an image or is too large, so that I know what to fix.
27. As a Visitor, I want a short note telling me that images go to the model provider, so that I do not upload personal photos by mistake.
28. As a Visitor, I want to see my images in the Chat history later, so that the Analyst's answer still makes sense when I return.

### Field placement Board

29. As a Visitor, I want the Analyst to show a suggested Field placement on a drawn Ground, so that I can see the plan instead of reading a list of names.
30. As a Visitor, I want each fielder labelled with their Fielding position, so that I learn the names.
31. As a Visitor, I want to drag any fielder to a new spot, so that I can try my own ideas.
32. As a Visitor, I want the Board to name the nearest Fielding position while I drag, so that I know what I am creating.
33. As a Visitor, I want to switch the Batter hand and see the field mirror, so that I understand how fields change for a left-hander.
34. As a Visitor, I want to choose the Format and Phase, so that the right Fielding restrictions apply.
35. As a Visitor, I want a live warning when my field breaks a Fielding restriction (too many outside the 30-yard circle, too many behind square on the leg side), so that I learn the rules by doing.
36. As a Visitor, I want to ask the Analyst "is this field good?" about the field as it stands, so that I get feedback on my own changes.
37. As a Visitor, I want the Board to work on my phone with touch, so that I can use it anywhere.
38. As a Visitor, I want the Board kept with the Chat Message it belongs to, so that I can look back at earlier fields.
39. As a Visitor, I want a Field placement from the Analyst to always obey the rules for its Format and Phase, so that the app never teaches me something illegal.

### Wagon wheel

40. As a Visitor, I want to add Shots to a Wagon wheel by tapping where the ball went and choosing the runs, so that I can record an innings.
41. As a Visitor, I want to undo or remove a Shot, so that mistakes are easy to fix.
42. As a Visitor, I want to ask the Analyst what the Wagon wheel says about the batter, so that I learn their scoring areas and weaknesses.
43. As a Visitor, I want run totals by area shown on the Wagon wheel, so that the pattern is obvious at a glance.

### Voice

44. As a Visitor, I want to speak my question instead of typing, so that I can use the app hands-free or on a phone.
45. As a Visitor, I want to see and edit the transcribed text before sending, so that speech mistakes do not reach the Analyst.
46. As a Visitor whose browser has no speech-to-text, I want the mic button hidden, so that I do not press something that cannot work.

### Limits and safety

47. As a Visitor, I want a friendly message telling me when I have hit the hourly limit and when I can continue, so that I am not confused by a failure.
48. As the project owner, I want each IP limited to 20 chat requests per hour, so that one script cannot burn the monthly budget.
49. As the project owner, I want Message length, image count and image size limited, so that requests stay cheap and under the host's body limit.
50. As the project owner, I want text inside images treated as untrusted data, so that an image saying "ignore your instructions" cannot steer the Analyst.
51. As the project owner, I want suspicious image text and long Messages screened against a written prompt-injection policy, so that attacks are caught before the main model sees them.
52. As the project owner, I want the Analyst limited to the Board tools and every tool result checked, so that a successful injection still cannot do anything harmful.
53. As a Visitor whose Message was blocked by the screen, I want a short, polite reason, so that I can rephrase if it was a false alarm.

### Owner, recruiter and developer

54. As a recruiter, I want a live URL that works on my phone in under a minute, so that I can judge the project quickly.
55. As a recruiter, I want a README that explains the stack choices and links the model test, so that I can see the owner's reasoning.
56. As the project owner, I want the model chosen by a recorded test, so that I can defend the choice in an interview.
57. As the project owner, I want the model ID in configuration, so that I can switch models without code changes.
58. As the project owner, I want a learning note per slice, so that I understand and can explain every part of the code.
59. As the project owner, I want every slice committed and pushed under my own name with the README updated, so that the history shows my work step by step.
60. As the project owner, I want to comment on preview deploys (Vercel Toolbar) and on the local app (sv-agentation), so that the coding agent can read and fix my UI feedback.
61. As the project owner, I want the Fielding restrictions defined once and checked by both the browser and the server, so that the two can never disagree.
62. As the project owner, I want the old code and the old split deploys retired, so that this repo is the single source of truth.
63. As a developer, I want the chat API testable with a fake model, so that tests are fast, free and deterministic.
64. As a developer, I want a health endpoint, so that I can check a deploy is alive.

## Implementation Decisions

**Stack and hosting** (ADR 0002)
- Frontend: Svelte 5 + Vite + TypeScript, built as a static single-page app. Svelte code is written with the official Svelte docs and autofixer (`svelte-code-writer`) and `svelte-core-bestpractices`.
- Backend: Python FastAPI, managed with `uv` and `pyproject.toml`, linted with `ruff`, tested with `pytest`. The old `requirements.txt`, `Procfile`, vanilla frontend and backend file are removed.
- One Vercel project serves the static frontend and the API under `/api` (same origin, so no CORS). The exact Vercel layout for a Vite build plus a FastAPI function is confirmed in Context7 in the first slice.
- Respect Vercel limits: 4.5 MB request body, function duration, no memory between requests.

**Model**
- `google/gemma-4-26b-a4b-it` on OpenRouter, chosen by the test in `docs/model-eval/`. Model ID and API key come from environment variables; the `:free` variant may be used in development.
- Gemma supports tools and structured outputs and does not take audio.
- The system prompt makes the Analyst cricket-first, concise, honest about uncertainty (especially image details), and aware of the Sport focus.

**Chat storage** (ADR 0001)
- Chats, Messages, images (already resized) and Board states are stored in the browser's IndexedDB. The server is stateless.
- Each request carries the recent Messages (last 20), the Sport focus and, when relevant, the current Board state.

**Modules**
- *Analyst* (backend, deep module): takes a chat request and yields a stream of Analyst events. It hides prompt building, the OpenRouter call, tool calls, Field placement checking and the single repair retry. Its only dependency on the outside world is a model-provider adapter (real OpenRouter adapter; fake adapter in tests).
- *Input guard* (backend): enforces Message, image and history limits and runs the injection screen through a screen adapter. Returns accept or a blocked reason.
- *Fielding restrictions* (shared, ADR 0003): one data file holds the limits per Format and Phase; small check functions in TypeScript and Python read it and return a list of violations for a Field placement.
- *Chat store* (frontend): create, list, rename, delete Chats; append Messages; persist to IndexedDB.
- *Chat stream client* (frontend): sends a chat request and turns the server's event stream into UI state (streaming, done, failed, blocked, rate-limited).
- *Image prep* (frontend): checks type and count, resizes to 1600 px on the long side, produces the upload payload.
- *Board* (frontend): renders the Ground, a Field placement or a Wagon wheel; handles drag, mirror, Format and Phase pickers, nearest-position naming and live warnings via Fielding restrictions.
- *Voice input* (frontend): wraps the Web Speech API; hidden when not supported.

**API contract**
- `GET /api/health` returns OK and the configured model ID.
- `POST /api/chat` accepts: recent Messages (text + images), Sport focus (sport and optional team), and optional Board state. It responds with a stream of server-sent events:
  - `text` (a piece of reply text),
  - `field_placement` (a checked Field placement),
  - `blocked` (the input guard's reason),
  - `error` (code, message, retryable flag),
  - `done`.
- Rate-limit rejections come from the Vercel firewall as HTTP 429; the client shows the friendly limit message.

**Field placement shape** (from the model-test prototype; trimmed to the decision)

```
FieldPlacement {
  format: "T20" | "ODI" | "Test"
  phase: "powerplay" | "middle" | "death"   // per Format
  bowler_type: string
  batter_hand: "right" | "left"
  fielders: 11 x { position: FieldingPositionName, x: -1..1, y: -1..1 }
}
Ground = circle of radius 1 at (0,0); striker at (0, 0.1) facing the bowler at (0, -0.15);
30-yard circle radius 0.43; for a right-handed batter the off side is x < 0 (mirrored for left).
```

- The Analyst emits a Field placement only through a `show_field_placement` tool call. The server checks it against the Fielding restrictions; if it fails, the server asks the model to fix it once; if it fails again, the Visitor gets the text answer without a Board.

**Fielding restrictions**
- T20: overs 1-6 at most 2 fielders outside the 30-yard circle; overs 7-20 at most 5.
- ODI: overs 1-10 at most 2; overs 11-40 at most 4; overs 41-50 at most 5.
- Test: no circle limit.
- All Formats: at most 2 fielders behind square on the leg side. Bowler and wicketkeeper are not counted.

**Wagon wheel**
- The Visitor adds Shots by tapping a point on the Ground and choosing runs (1, 2, 3, 4, 6). The Wagon wheel travels with the request as Board state when the Visitor asks the Analyst about it. Reading Shots out of an uploaded image is a later, optional step (would use a `show_wagon_wheel` tool).

**Limits and safety**
- Vercel firewall rule: 20 POST requests per IP to `/api/chat` in a 10-minute fixed window; over the limit, HTTP 429 for 1 hour (persistent action). Reason: the Hobby plan allows one rate-limit rule, and its window can be at most 10 minutes, so "20 per hour" cannot be set directly. The 1-hour block stops bursts. (Changed in slice 02; the first plan said 20 per hour.)
- Max 4 images per Message, resized to 1600 px long side in the browser; max 2,000 characters per Visitor Message (earlier Analyst replies sent back as history may be up to 12,000); last 20 Messages sent; the server rejects bodies over its limit with a clear error.
- Injection defense, layer 1 (always): image-derived text is wrapped and labelled as untrusted data in the prompt; the Analyst has only the Board tools; every tool call is validated.
- Injection defense, layer 2: `openai/gpt-oss-safeguard-20b` screens image text and long Messages against a written prompt-injection policy before the main model call.
- The OpenRouter key has a $5/month credit cap set by the owner.

**Voice**
- Browser speech-to-text (Web Speech API); the transcript fills the input box for editing; the mic button is hidden where unsupported.

**Process**
- Built in vertical slices in a fresh max-effort session. Each slice: Context7 lookup → agreed seams → test first → code → check in the browser → Vercel preview → visual feedback round (Vercel Toolbar comments, sv-agentation locally) → learning note → README update → commit and push under the owner's name only.
- After the feature slices: the state-machine prompt ("Find all of the implicit state machines in my app. Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything"), an architecture pass, a code review, README polish and a `brag` demo video.
- UI direction (theme, colors, layout, motion) is chosen by the owner from options at the UI slice.

## Testing Decisions

- A good test checks behaviour through a public seam, never internals: it states what a Visitor or caller sees ("a valid Field placement reaches the client as a `field_placement` event"), so it survives refactors. Expected values come from the rules and worked examples, not from re-running the code's own logic.
- Three seams, agreed with the owner:
  1. **Chat API** (`POST /api/chat`) through FastAPI's test client with a fake model-provider adapter. Covers: streaming text events, a valid tool call becoming a `field_placement` event, an invalid Field placement repaired once, a second failure falling back to text only, input-guard rejections (`blocked`), provider errors mapped to `error` with the retryable flag, and history trimming.
  2. **Fielding restrictions**, run in both TypeScript and Python against one shared table of cases (legal fields, too many outside the circle per Format and Phase, leg-side limit, mirrored left-hander fields).
  3. **Browser flows** with Playwright against a mocked API: send a Message and see it stream, attach and resize images, Chats survive a reload, drag a fielder and see a warning, ask about the field.
- Prior art: no tests exist in the old code. The model test's field checks (`docs/model-eval/scripts/score.py`) are prior art for the Fielding-restriction cases.
- Every slice ends with its tests green before commit.

## Out of Scope

- RAG or any retrieval over a sports knowledge base.
- Live match data or sports APIs.
- User accounts, sign-in, a server database, or syncing Chats across devices.
- Boards for sports other than cricket (they get text answers only).
- Reading Shots for the Wagon wheel out of uploaded images (later, optional).
- Audio sent to the model (voice is browser speech-to-text only).
- A native mobile app; the web app must work at phone width.
- Analytics and tracking.

## Further Notes

- Old deploys (frontend and backend from separate repos) are shut down by the owner once the new Vercel site is live; all work goes to `v1d1tt/sports-insight-bot`.
- Domain language: see `GLOSSARY.md`. Decisions: `docs/adr/0001`–`0003`. Model test: `docs/model-eval/README.md`.
- The Analyst's main weakness found in testing is inventing image details; the prompt and the "say when unsure" rule address it, and the Board never relies on image reading.
- Cost check from the model test: about $0.01 per 100 chats with Gemma 4, well under the $5 monthly cap; the screen model adds a small amount per screened Message.
