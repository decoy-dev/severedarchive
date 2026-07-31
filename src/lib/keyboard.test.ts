// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { isInteractiveTarget } from './keyboard'

const on = (el: EventTarget) => {
  const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
  let seen = false
  const handler = (ev: Event) => { seen = isInteractiveTarget(ev) }
  window.addEventListener('keydown', handler)
  el.dispatchEvent(e)
  window.removeEventListener('keydown', handler)
  return seen
}

beforeEach(() => { document.body.innerHTML = '' })

const mount = <T extends HTMLElement>(el: T): T => { document.body.appendChild(el); return el }

describe('isInteractiveTarget', () => {
  it('shields the volume slider', () => {
    const input = mount(document.createElement('input'))
    input.type = 'range'
    expect(on(input)).toBe(true)
  })

  it('shields text entry and select controls', () => {
    expect(on(mount(document.createElement('textarea')))).toBe(true)
    expect(on(mount(document.createElement('select')))).toBe(true)
    const input = mount(document.createElement('input'))
    input.type = 'text'
    expect(on(input)).toBe(true)
  })

  it('shields anything inside a slider wrapper via role', () => {
    const wrap = mount(document.createElement('div'))
    wrap.setAttribute('role', 'slider')
    const inner = wrap.appendChild(document.createElement('span'))
    expect(on(inner)).toBe(true)
  })

  it('shields contenteditable regions', () => {
    const div = mount(document.createElement('div'))
    div.setAttribute('contenteditable', 'true')
    expect(on(div)).toBe(true)
  })

  it('lets the global keys through everywhere else', () => {
    expect(on(mount(document.createElement('div')))).toBe(false)
    expect(on(mount(document.createElement('button')))).toBe(false)
    expect(on(document.body)).toBe(false)
  })

  it('tolerates a non-Element target', () => {
    expect(isInteractiveTarget(new KeyboardEvent('keydown'))).toBe(false)
  })
})
