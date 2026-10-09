import { test, expect } from 'claude-code/testing'

const PROPS = {
  title: 'Terminal',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { bodyRows: 30, offset: 0 },
  view: {},
} as never

test('a spawned agent gets its own button before it runs any command', async ($, on) => {
  on('agent.spawn', () => ({ model: 'test-model', agentId: 'agent123xyz' }) as never)
  on('tool.call', () => ({ result: {}, text: 'C:/repo' }) as never)

  await $.agent.spawn({
    prompt: 'look around',
    description: 'find config files',
    subagentType: 'Explore',
  } as never)

  const ui = await $.ui.mount({
    plugin: 'terminal-watch',
    surface: 'desktop',
    component: 'Pane',
    props: PROPS,
    requestId: 'terminal-watch',
  })

  expect(await ui.find({ key: 'agent-select' })).toBeDefined()
  await ui.select({ key: 'agent-select', value: 'agent-agent123xyz' })
  expect(await ui.find({ type: 'Text', text: /not run any shell command/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', command: 'pwd', agentId: 'agent123xyz' } as never)
  expect(await ui.find({ type: 'Text', text: /> pwd$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^C:\/repo$/ })).toBeDefined()

  await ui.press({ key: 'tab-main' })
  expect(await ui.find({ type: 'Text', text: /> pwd$/ })).toBeUndefined()

  await ui.press({ key: 'toggle-agents' })
  expect(await ui.find({ key: 'agent-select' })).toBeUndefined()
  expect(await ui.find({ key: 'add' })).toBeDefined()
  await ui.press({ key: 'toggle-agents' })
  expect(await ui.find({ key: 'agent-select' })).toBeDefined()

  await ui.unmount()
})
