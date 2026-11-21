# Product

Product truth for design work. Source: the approved PRD (`docs/PRD.md`, issue #1) and `GLOSSARY.md`. Domain words (Visitor, Analyst, Chat, Message, Sport focus, Board) follow the glossary.

## Platform

web

## Stack

Svelte 5 + Vite + TypeScript single-page app in `frontend/`; FastAPI API in `backend/`; one Vercel project. Plain scoped CSS in Svelte components, no CSS framework.

## Users

- Visitors: cricket fans who want a tactical answer about a match, a situation, a field or a screenshot. Often on a phone, often during or right after a match. No account.
- Recruiters: open the live link once, on a phone or laptop, and judge the project in about a minute.

## Product Purpose

A cricket-first sports analyst in a chat. The Visitor asks in plain words, attaches match screenshots, and gets streamed, formatted answers. Later slices add the Board: an interactive cricket Ground where the Analyst shows a Field placement or a Wagon wheel that the Visitor can change.

## Positioning

Not a general chatbot with a sports skin. It talks like an analyst on a broadcast, cricket comes first, and its answers end up on a real, drawn Ground.

## Operating Context

Operate mode: the Visitor completes a task (ask, read the answer, follow up). Screens: Chat list, Chat (Messages, streaming state, errors, image previews), Sport focus picker, input area with images and voice. The Board panel arrives in later slices and needs room beside or below the Chat.

## Capabilities and Constraints

- Replies stream as Markdown (tables, lists, bold).
- Up to 4 images per Message; images resized in the browser.
- Voice input with the browser's Web Speech API; mic hidden where not supported.
- Chats live only in the browser (IndexedDB).
- Rate limit: 20 chat requests per IP per 10 minutes.
- Must work at 375 px width with touch.

## Brand Commitments

None yet. The owner chooses theme, colours, typography, layout and motion in slice 04.

## Evidence on Hand

No photography or brand assets. The cricket Ground geometry (circle, 30-yard circle, pitch) from the PRD is the main drawn material.

## Product Principles

- Honest: the Analyst says when it is not sure.
- The answer is the hero; chrome stays out of its way.
- Cricket first, other sports still useful.

## Accessibility & Inclusion

Labels on every control, visible focus states, keyboard use, screen-reader basics, reduced-motion support, no horizontal scroll at 375 px.
