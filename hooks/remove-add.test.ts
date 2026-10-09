import { test, expect } from 'claude-code/testing'

const PROPS = {
  title: 'Terminal',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { bodyRows: 30, offset: 0 },
  view: {},
} as never

test('after x removes a terminal, + still adds one', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'test00' }) as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', description: '[T2] list' } as never)

  const ui = await $.ui.mount({
    plugin: 'terminal-watch',
    surface: 'desktop',
    component: 'Pane',
    props: PROPS,
    requestId: 'terminal-watch',
  })

  await ui.press({ key: 'tab-t2' })
  await ui.press({ key: 'remove' })
  expect(await ui.find({ key: 'tab-t2' })).toBeUndefined()

  await ui.press({ key: 'add' })
  expect(await ui.find({ key: 'tab-t2' })).toBeDefined()

  await ui.press({ key: 'add' })
  expect(await ui.find({ key: 'tab-t3' })).toBeDefined()

  await ui.unmount()
})
