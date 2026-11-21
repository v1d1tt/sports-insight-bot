import { expect, test } from 'vitest'
import { renderMarkdown } from './markdown'

function render(markdown: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderMarkdown(markdown)
  return container
}

test('renders bold text, lists and tables', () => {
  const html = render(
    '**Bumrah** at the death:\n\n- yorkers\n- slower balls\n\n| Over | Bowler |\n| --- | --- |\n| 19 | Bumrah |',
  )

  expect(html.querySelector('strong')?.textContent).toBe('Bumrah')
  expect([...html.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'yorkers',
    'slower balls',
  ])
  expect(html.querySelector('table td')?.textContent).toBe('19')
})

test('shows raw HTML as text instead of running it', () => {
  const html = render('Nice shot <img src=x onerror="alert(1)"> <script>alert(2)</script>')

  expect(html.querySelector('img')).toBeNull()
  expect(html.querySelector('script')).toBeNull()
  expect(html.textContent).toContain('<img src=x onerror="alert(1)">')
})

test('drops javascript: links but keeps safe links, opening them in a new tab', () => {
  const html = render('[bad](javascript:alert(1)) and [ICC](https://www.icc-cricket.com)')

  const links = [...html.querySelectorAll('a')]
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://www.icc-cricket.com'])
  expect(links[0].getAttribute('target')).toBe('_blank')
  expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
})
