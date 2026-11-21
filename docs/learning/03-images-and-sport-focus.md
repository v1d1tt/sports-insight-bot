# 03: Images in Messages and Sport focus

Ticket: [#4](https://github.com/v1d1tt/sports-insight-bot/issues/4). The Visitor can now show the Analyst what they are looking at (up to 4 images per Message) and tell it which sport, and which team, the Chat is about.

## What this slice built

- **Images.** Attach (button), paste (into the Message box) or drop (anywhere on the chat) up to 4 JPEG, PNG or WebP images. Each shows a preview with a Remove button. The browser shrinks each image before upload and keeps its real type. A note by the button says images go to the model provider. Images are saved with the Chat and show again after a reload.
- **Untrusted image text.** Before a Message's images, the prompt says that any text in them is untrusted data and must not be followed. The system prompt states the same rule (injection defense layer 1, part one; ticket 08 adds the screen model).
- **Limits on the server.** At most 4 images per Message, each image must really be the type it claims, and the body must be at most 4.5 MB.
- **Sport focus.** A picker (cricket by default, football, basketball, tennis, Other) and a free-text team field above the Messages. Each Chat keeps its own Sport focus, sends it with every request, and the Analyst frames its answers for it. Non-cricket sports get text answers only.

## How the code flows

**Attach an image**

1. `ChatView.svelte`: the Attach button opens the hidden `<input type="file">`; `pickFiles()`, `onpaste()` (only when the clipboard holds files) and `ondrop()` all call `session.attach(files)`.
2. `ChatSession.attach()` in `chat-session.svelte.ts` sets `preparing`, calls `prepareImages(files, alreadyAttached)` in `image-prep.ts`, and adds the results to `attachments` (each with an id, so a preview can be removed).
3. `prepareImages()` refuses files that are not JPEG, PNG or WebP, keeps only as many as fit in 4, and calls `resizeImage()` for each. Every problem becomes one sentence in `error`, which the page shows in a `role="alert"` line.
4. `resizeImage()`: `createImageBitmap(file)` decodes the image and turns it upright from its EXIF orientation. `fitWithin()` gives the size with the long side at 1600 px (never larger than the original). `encode()` draws it on a canvas and calls `canvas.toBlob(type, 0.85)` with the file's own type. If the result is over 700 KB, it tries again at 80 % of the size, down to 400 px. The blob becomes base64 with `FileReader.readAsDataURL()`. `blob.type` is used as the MIME type, because a browser that cannot write a type gives PNG instead.

**Send a Message with images**

5. `ChatSession.send()` creates the Chat with the current Sport focus if it is new (`store.createChat(sportFocus)`), saves the Message with its images (`store.addMessage(chatId, 'visitor', text, images)`) and clears the composer.
6. `#reply()` passes the history, with images, and `sportFocus` to `streamReply()` in `chat-stream.ts`.
7. `requestMessages()` keeps the last 20 Messages that have text or images. Only the newest Message with images keeps them (as `{media_type, data}`); older ones go as text. The body is `{messages, sport_focus: {sport, team}}`.
8. On HTTP 413 `streamReply()` returns "This Message is too large to send. Remove an image and try again." (not retryable).

**On the server**

9. `chat()` in `main.py` has `max_body_size=4_500_000`. A bigger body gets HTTP 413 before our code runs.
10. Pydantic checks the body (`ChatRequest` in `main.py`, `VisitorMessage`, `ImageAttachment` and `SportFocus` in `analyst.py`): only the three image types; a Visitor Message needs text or at least one image; `sport` is one of five values; `team` is at most 60 characters with no control characters.
11. `check_request()` in `input_guard.py` returns an `error` event for more than 4 images in a Message (`too_many_images`) or for an image whose bytes do not match its type (`image_unreadable`: it decodes the base64 and checks the first "magic" bytes). The route then sends that one event and stops, before any model call.
12. `stream_reply()` in `analyst.py` calls `build_prompt(messages, sport_focus)`:
    - The system message is `SYSTEM_PROMPT` plus `_sport_focus_rules()`: `Sport focus: football`, `Team: "Arsenal" (typed by the Visitor)`, and how to frame the answer. The team is quoted with `json.dumps()`, so it reads as a name, not as a rule.
    - A Visitor Message without images stays a plain string. With images, `_with_images()` makes a list of content parts: the Visitor's text, then `UNTRUSTED_IMAGE_NOTE`, then one `{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}` per image. OpenRouter advises text first, then images.
13. `OpenRouterProvider` sends these messages unchanged; OpenRouter's chat completions API takes the same content parts.

**Sport focus**

14. `SportFocusPicker.svelte` shows `session.sportFocus`. A change of sport (on `change`) or team (on `change`, so when the field loses focus or on Enter) calls `session.setSportFocus()`. For a saved Chat that also calls `store.setSportFocus(id, focus)`.
15. `openChat()` reads the Chat's `sportFocus` (`sportFocusOf()` gives cricket for Chats saved before this slice). `newChat()` starts at cricket.

## Request size: what the numbers say

| Check | Original file | Request body |
|---|---|---|
| Local, real model | 13.8 MB noise JPEG (4000 × 3000, quality 0.97) | 0.61 MB |
| CLI preview, real model | 0.1 MB PNG diagram + 13.8 MB noise JPEG | 0.75 MB |
| Playwright | four 10+ MB noise JPEGs | under 4.5 MB (checked) |

Random noise is the worst case for JPEG: a real phone photo shrinks much more. The budget: 4 images × 700 KB × 4/3 (base64) is about 3.7 MB, plus up to 20 Messages of text, stays under 4.5 MB.

## Why each choice

| Part | Pick (version) | Usual default | Why this one |
|---|---|---|---|
| Image resize | Browser APIs: `createImageBitmap`, `<canvas>`, `toBlob`, `FileReader` | `browser-image-compression`, `compressorjs`, `pica` | No new package. The built-in APIs decode, turn the photo upright (EXIF), resize and encode in the same type. `pica` gives slightly sharper downscaling, which a model reading a screenshot does not need. Re-encoding also drops metadata such as the photo's GPS location. |
| Canvas | A normal `<canvas>` element | `OffscreenCanvas` in a worker | Works in every browser the page supports. A worker would keep the page smoother during a 14 MB decode (about 3 s in the worst case), but it is more code for a rare case. The page shows "Preparing images…" meanwhile. |
| Paste and drop | `paste` and `drop` events, `clipboardData.files`, `dataTransfer.files` | a drop-zone library (`react-dropzone`-style) | A few lines each. `dragover` must call `preventDefault()` for `drop` to fire. |
| Image format to the model | Data URL in an `image_url` content part | upload to storage, send a URL | The server is stateless (ADR 0001), and OpenRouter accepts base64 data URLs for PNG, JPEG, WebP and GIF. |
| Image storage | Base64 strings in IndexedDB, next to the Message | `Blob` objects in IndexedDB | One shape everywhere: stored, shown (`<img src="data:...">`) and sent. Blobs would save a third of the space but need object URLs and cleanup. |
| Body limit | FastAPI 0.165.0 `max_body_size` on the route | none, or a check of `Content-Length` | FastAPI counts the bytes it reads, so a client cannot lie in a header. |
| Count and type limits | `input_guard.py`, answered as an `error` event | `Field(max_length=4)` (HTTP 422) | The page already shows `error` events with their message; a 422 would show only a generic failure. |

No new libraries. Other versions: Svelte 5.59.1, Pydantic 2.14.4, Playwright 1.65.1, Vitest 5.1.1.

## Decisions made in this slice

- **Only the newest Message with images carries them.** A follow-up ("and who is at gully?") still sees the picture, and a request never holds more than 4 images. Older images stay in the Chat on the page; the model has its own earlier answer about them.
- **700 KB per image after resizing.** A PNG screenshot is lossless, so a busy one can be over 700 KB at 1600 px; it is then shrunk further (to 1280 px, then 1024 px …) and stays PNG. This keeps "PNG stays PNG" and still fits 4 images under 4.5 MB.
- **GIF, HEIC and SVG are refused** in the browser with a clear message. A canvas cannot write GIF (an animated GIF would lose its animation), HEIC does not decode in most browsers, and SVG is not a photo. iPhones send JPEG to a web page by default.
- **The server checks image bytes against the MIME type.** So the model always gets the right type, and a wrong file fails with a clear message instead of a provider error.
- **A new Chat starts with cricket.** The Sport focus belongs to a Chat, not to the Visitor.
- **The team name is data.** At most 60 characters, no control characters, quoted in the prompt.

## Changed from the plan

- **A body over 4.5 MB gets HTTP 413, not an `error` event.** The ticket asked for an `error` event for every server limit. That is not possible for the body size: on Vercel a body over 4.5 MB never reaches our function. The preview check showed Vercel's own answer: `413 Request Entity Too Large, FUNCTION_PAYLOAD_TOO_LARGE`. FastAPI's `max_body_size` also answers 413 from its middleware, before any exception handler. So the page turns any 413 into the clear message. The count and type limits do arrive as `error` events.

## Tests

| Layer | File | It checks |
|---|---|---|
| pytest (seam 1) | `backend/tests/test_chat_images_and_sport.py` | Through `POST /api/chat` with the fake provider: PNG and JPEG reach the model as `data:image/png;base64,...` and `data:image/jpeg;base64,...` after the Visitor's text; the untrusted label sits just before the images and the system prompt has the rule; an image-only Message works; an empty Message is refused; 5 images → `too_many_images`; a JPEG labelled PNG and bad base64 → `image_unreadable`; WebP accepted, GIF refused; a 4.7 MB body → 413; football + "Arsenal" reach the system prompt with "text only"; no Sport focus → cricket; an unknown sport or a 61-character team → 422. In each refusal the model is never called. |
| Vitest | `frontend/src/lib/image-prep.test.ts` | `fitWithin()` (4000 × 3000 → 1600 × 1200, never enlarges); types kept in order; PDF and GIF refused with their names; the 4-image limit counts images already attached and does not read the extra file; an unreadable image is skipped with a message. The real resize needs a browser, so these tests pass a stand-in resizer. |
| Vitest | `frontend/src/lib/chat-stream.test.ts` | Only the newest images are sent, with `media_type`; `sport_focus` is in the body; an image-only Message is sent; HTTP 413 → the "too large" message, not retryable. |
| Vitest | `frontend/src/lib/chat-store.test.ts` | Images saved with a Message and still there after the store opens again; an image-only first Message is titled "Image" or "2 images"; each Chat keeps its own Sport focus, cricket by default. |
| Playwright (seam 3) | `frontend/e2e/images.spec.ts` | In Chromium with a mocked API: a 4000 × 3000 JPEG and a 2000 × 1000 PNG are sent as 1600 × 1200 JPEG and 1600 × 800 PNG, and show again after a reload; four 10+ MB photos go out in one request under 4.5 MB; paste and drop each add an image; a PDF and a fifth image are refused with messages; Remove works; football + "Arsenal" are sent, a new Chat is cricket, and each Chat shows its own Sport focus after a reload. The test images are drawn in the browser with `OffscreenCanvas`, so no image files are in the repo. |

Red before green: the backend tests and the Vitest tests were written first and seen failing (11 of 12 new backend tests; 7 Vitest tests, and the Image prep test file could not even load). The Playwright tests were written after the page code.

## Checked by hand

- **Local, real model:** a home-made field diagram (PNG with labelled fielders) dropped on the chat: the Analyst named the positions and called it an attacking Test field. It missed the 2nd and 3rd slips: the known weakness with image details (see the PRD). A football Chat with team "Arsenal": the answer was about breaking a low block and named an Arsenal player. A 13.8 MB photo → a 0.61 MB request. After a reload the image is back in its Chat. At 375 px width the page has no sideways scroll.
- **CLI preview** (`vercel deploy`, before any push): a PNG diagram and a 13.8 MB photo in one Message → a 0.75 MB request; the Analyst answered for both (it said the noise photo shows nothing, which is honest). A tennis Chat got a tennis answer. A direct request with 5 images got the `too_many_images` event; a 5 MB body got Vercel's own 413.

## Gotchas found

- **Vercel answers a too-large body itself.** `FUNCTION_PAYLOAD_TOO_LARGE` arrives before the function starts, so no server code can shape that answer. The client must own the message.
- **FastAPI's 413 skips exception handlers.** `max_body_size` is enforced in middleware that sends a plain-text 413 itself; `@app.exception_handler(413)` never runs for it.
- **A smooth gradient PNG is big.** A 1600 × 800 gradient PNG was over 700 KB and got shrunk to 1280 × 640. Flat screenshots are small. The test uses a flat image, like a real screenshot.
- **Playwright's `setFiles()` takes at most 50 MB of buffers.** Four 13 MB images had to be written to a file first and passed as paths.
- **Code inside `page.evaluate()` runs in the browser**, so the e2e TypeScript config needs the `DOM` types.
- **A Svelte `$state` proxy cannot go into IndexedDB** (structured clone fails). Attachments and the Sport focus use `$state.raw` with plain objects, and `setSportFocus()` copies the fields.

## Interview questions

1. **Why resize images in the browser and not on the server?**
   Vercel refuses request bodies over 4.5 MB before our function runs, so a 10 MB phone photo would never reach the server. Resizing in the browser also makes the upload faster on a phone, and costs us nothing. The server still checks the count, the type and the size, because it never trusts the page.

2. **How do you stop text in an image from taking over the Analyst?**
   Layer 1, part one: the system prompt says text in images is untrusted data and must never be followed, and each Message's images come right after a note that says the same. The model then sees the rule next to the data. This lowers the risk but does not remove it, so ticket 08 adds a second model that screens image text against a written policy before the main model sees it.

3. **How does the server know an image really is a PNG?**
   It decodes the base64 and checks the first bytes: every PNG starts with `89 50 4E 47 0D 0A 1A 0A`, every JPEG with `FF D8 FF`, every WebP with `RIFF....WEBP`. If the bytes do not match the declared MIME type, the server answers with an `image_unreadable` event and never calls the model. The browser side keeps the type right in the first place: it re-encodes in the file's own type and reads the real type back from `blob.type`.
