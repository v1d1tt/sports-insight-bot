import { render, screen } from '@testing-library/svelte'
import { expect, test, vi } from 'vitest'
import AnalystStatus from './AnalystStatus.svelte'

test('shows the Analyst online with the model ID when the API is healthy', async () => {
  const fetch = vi.fn(async () =>
    Response.json({ status: 'ok', model: 'google/gemma-4-26b-a4b-it' }),
  )
  vi.stubGlobal('fetch', fetch)

  render(AnalystStatus)

  expect(await screen.findByText('Analyst online')).toBeInTheDocument()
  expect(screen.getByText('google/gemma-4-26b-a4b-it')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith('/api/health')
})

test('shows a clear offline message when the API answers with an error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ detail: 'Internal Server Error' }, { status: 500 })),
  )

  render(AnalystStatus)

  expect(await screen.findByText('Analyst offline')).toBeInTheDocument()
  expect(screen.queryByText('Analyst online')).not.toBeInTheDocument()
})
