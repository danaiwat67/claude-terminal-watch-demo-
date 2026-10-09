import { test, expect } from 'claude-code/testing'

const PROPS = {
  title: 'Terminal',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { bodyRows: 30, top: 0 },
  view: {},
} as never

test('pane draws on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'terminal-watch',
      surface,
      component: 'Pane',
      props: PROPS,
      requestId: 'terminal-watch',
    })
    expect(await ui.find({ type: 'Text', text: /█/ })).toBeDefined()
    await ui.unmount()
  }
})
