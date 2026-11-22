// One tooltip for every icon button on the page. A button gets it when it has
// no words of its own: its `data-tip` text, or else its `aria-label`, shows
// above it shortly after the pointer rests on it, and at once on keyboard
// focus. Escape or leaving hides it. Buttons with visible words get none,
// since the tooltip would only repeat them. The tooltip is hidden from
// screen readers: they already read the button's `aria-label`.

export const TOOLTIP_DELAY_MS = 300

const GAP = 6

const tipText = (button: HTMLElement) => button.dataset.tip || button.getAttribute('aria-label') || ''

function buttonFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const button = target.closest<HTMLElement>('button, [role="button"]')
  return button && tipText(button) ? button : null
}

export function installTooltips(doc: Document = document): () => void {
  const tip = doc.createElement('div')
  tip.className = 'tooltip'
  tip.setAttribute('aria-hidden', 'true')
  tip.hidden = true
  doc.body.append(tip)

  let owner: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(button: HTMLElement) {
    owner = button
    tip.textContent = tipText(button)
    tip.hidden = false
    const box = button.getBoundingClientRect()
    const width = tip.offsetWidth
    const height = tip.offsetHeight
    const viewport = doc.documentElement.clientWidth || window.innerWidth
    const left = Math.min(Math.max(GAP, box.left + box.width / 2 - width / 2), viewport - width - GAP)
    const above = box.top - height - GAP
    tip.style.left = `${left}px`
    tip.style.top = `${above >= GAP ? above : box.bottom + GAP}px`
  }

  function hide() {
    clearTimeout(timer)
    owner = null
    tip.hidden = true
  }

  const onPointerOver = (event: Event) => {
    const button = buttonFrom(event.target)
    if (!button || button === owner) return
    hide()
    timer = setTimeout(() => show(button), TOOLTIP_DELAY_MS)
  }
  const onPointerOut = (event: Event) => {
    const next = (event as PointerEvent).relatedTarget
    if (next instanceof Node && owner?.contains(next)) return
    if (buttonFrom(event.target)) hide()
  }
  const onFocusIn = (event: Event) => {
    const button = buttonFrom(event.target)
    if (button) {
      clearTimeout(timer)
      show(button)
    } else hide()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide()
  }

  doc.addEventListener('pointerover', onPointerOver)
  doc.addEventListener('pointerout', onPointerOut)
  doc.addEventListener('focusin', onFocusIn)
  doc.addEventListener('focusout', hide)
  doc.addEventListener('pointerdown', hide)
  doc.addEventListener('keydown', onKeyDown)
  doc.addEventListener('scroll', hide, true)

  return () => {
    hide()
    doc.removeEventListener('pointerover', onPointerOver)
    doc.removeEventListener('pointerout', onPointerOut)
    doc.removeEventListener('focusin', onFocusIn)
    doc.removeEventListener('focusout', hide)
    doc.removeEventListener('pointerdown', hide)
    doc.removeEventListener('keydown', onKeyDown)
    doc.removeEventListener('scroll', hide, true)
    tip.remove()
  }
}
