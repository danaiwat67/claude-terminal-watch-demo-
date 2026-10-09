import { test, expect } from 'claude-code/testing'

const PROPS = {
  title: 'Terminal',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { bodyRows: 30, offset: 0 },
  view: {},
} as never

test('the bar hides and comes back, and commands still show while hidden', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'test00' }) as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)

  const ui = await $.ui.mount({
    plugin: 'terminal-watch',
    surface: 'desktop',
    component: 'Pane',
    props: PROPS,
    requestId: 'terminal-watch',
  })

  expect(await ui.find({ key: 'add' })).toBeDefined()

  await ui.press({ key: 'toggle-bar' })
  expect(await ui.find({ key: 'add' })).toBeUndefined()
  expect(await ui.find({ key: 'tab-main' })).toBeUndefined()
  expect(await ui.find({ key: 'toggle-bar' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /> ls$/ })).toBeDefined()

  await ui.press({ key: 'toggle-bar' })
  expect(await ui.find({ key: 'add' })).toBeDefined()

  await ui.unmount()
})
