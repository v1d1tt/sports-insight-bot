import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { installTooltips } from './lib/tooltips'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// A fast tooltip on every icon button (hover and keyboard focus).
installTooltips()

// sv-agentation: a dev-only tool to leave notes on the page for the coding agent.
// Vite replaces import.meta.env.DEV with false in production builds, so this
// block and the sv-agentation package are left out of the build.
if (import.meta.env.DEV) {
  const { Agentation } = await import('sv-agentation')
  mount(Agentation, { target: document.body })
}

export default app
