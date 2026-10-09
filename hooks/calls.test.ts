import { test, expect } from 'claude-code/testing'

const PROPS = {
  title: 'Terminal',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { bodyRows: 30, offset: 0 },
  view: {},
} as never

test('tabs switch terminals, + adds one, x removes it, clear empties only its own', async ($, on) => {
  on('tool.call', ($, e) =>
    ({ result: {}, text: String((e as { command?: string }).command) === 'ls' ? 'file-a\nfile-b' : '' }) as never,
  )

  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: '[T2] start dev server' } as never)
  await $.tool.call({ tool: 'Bash', command: 'pwd', agentId: 'abcdef123456' } as never)

  const ui = await $.ui.mount({
    plugin: 'terminal-watch',
    surface: 'desktop',
    component: 'Pane',
    props: PROPS,
    requestId: 'terminal-watch',
  })

  expect(await ui.find({ type: 'Text', text: /> ls$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /npm run dev/ })).toBeUndefined()
  expect(await ui.find({ key: 'tab-t2' })).toBeDefined()
  expect(await ui.find({ key: 'agent-select' })).toBeDefined()

  await ui.press({ key: 'tab-t2' })
  expect(await ui.find({ type: 'Text', text: /> npm run dev$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /> ls$/ })).toBeUndefined()

  await ui.select({ key: 'agent-select', value: 'agent-abcdef123456' })
  expect(await ui.find({ type: 'Text', text: /> pwd$/ })).toBeDefined()

  await ui.press({ key: 'add' })
  expect(await ui.find({ key: 'tab-t3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /terminal 3/ })).toBeDefined()

  await ui.press({ key: 'remove' })
  expect(await ui.find({ key: 'tab-t3' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /> ls$/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', command: 'clear' } as never)
  expect(await ui.find({ type: 'Text', text: /> ls$/ })).toBeUndefined()
  await ui.press({ key: 'tab-t2' })
  expect(await ui.find({ type: 'Text', text: /> npm run dev$/ })).toBeDefined()

  await ui.unmount()
})
