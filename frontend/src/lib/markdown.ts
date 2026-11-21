import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

// Layer 1: markdown-it with html: false shows raw HTML as text, and its
// validateLink drops javascript:, vbscript:, file: and most data: links.
const markdown = new MarkdownIt({ html: false, linkify: true })

// Layer 2: DOMPurify cleans the HTML that markdown-it produced, in case a
// future option or plugin lets something unsafe through. The hook makes every
// link open in a new tab without access to this page (rel=noopener).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Turn the Analyst's Markdown into safe HTML. */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(markdown.render(text), { USE_PROFILES: { html: true } })
}
