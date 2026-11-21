import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Page } from '@playwright/test'

/** One server-sent event, sent after an optional pause. */
export type SseStep = { event: string; data: unknown; delayMs?: number }

export const ok = (text: string): SseStep[] => [
  { event: 'text', data: { text } },
  { event: 'done', data: {} },
]

/** The SSE body of a whole reply, for route.fulfill (which cannot stream). */
export function sseBody(steps: SseStep[]): string {
  return steps.map((step) => `event: ${step.event}\ndata: ${JSON.stringify(step.data)}\n\n`).join('')
}

/**
 * Mock the API for one page: /api/health answers "ok", /api/chat answers with
 * the next reply in `replies`. Any other /api request fails the test, so no
 * test can reach a real server or the real model.
 */
export async function mockApi(page: Page, replies: SseStep[][] = []) {
  const chatRequests: unknown[] = []
  // Playwright runs the most recently added matching route first.
  await page.route('**/api/**', (route) => route.abort())
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', model: 'google/gemma-4-26b-a4b-it' } }),
  )
  await page.route('**/api/chat', (route) => {
    chatRequests.push(route.request().postDataJSON())
    const reply = replies.shift() ?? ok('(no reply scripted)')
    return route.fulfill({ contentType: 'text/event-stream', body: sseBody(reply) })
  })
  return { chatRequests, replies }
}

/**
 * A real local SSE server that sends the steps with pauses, so the page sees
 * a true stream (route.fulfill delivers the whole body at once).
 * Route /api/chat to it with: route.continue({ url: server.url }).
 */
export async function startSseServer(steps: SseStep[]) {
  const server = createServer(async (request, response) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors).end()
      return
    }
    for await (const _chunk of request); // read the request body
    response.writeHead(200, { ...cors, 'content-type': 'text/event-stream' })
    response.flushHeaders()
    for (const step of steps) {
      if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs))
      if (response.destroyed) return // the page stopped the request
      response.write(sseBody([step]))
    }
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/api/chat`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
