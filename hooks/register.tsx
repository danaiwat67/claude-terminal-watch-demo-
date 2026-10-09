import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { ShellCall, TerminalTab, TerminalView } from '../types'

const MAIN = 'main'
const NO_AGENT = 'none'
const PANE = 'terminal-watch'
const CALLS_KEY = 'calls'
const VIEW_KEY = 'view'
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const MAX_CALLS = 300
const MAX_OUTPUT_LINES = 40
const CLEAR = /^\s*(clear|cls|clear-host)\s*$/i
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const TERMINAL_TAG = /^\s*\[T(\d{1,2})\]\s*/i
const EMPTY_VIEW: TerminalView = { selected: MAIN, created: [] }
const calls = atom({ plugin: 'terminal-watch', key: 'calls' } as const, [])
const now = atom({ plugin: 'terminal-watch', key: 'now' } as const, 0)
const view = atom({ plugin: 'terminal-watch', key: 'view' } as const, EMPTY_VIEW)
const agents = atom({ plugin: 'terminal-watch', key: 'agents' } as const, [])

const agentKey = (agentId: string): string => `agent-${agentId}`

const agentLabel = (type: string, description: string): string =>
  `${type}: ${description.length > 20 ? `${description.slice(0, 20)}...` : description}`

const clip = (text: string): string => {
  const lines = text.replace(/\s+$/, '').split('\n')
  return lines.length > MAX_OUTPUT_LINES
    ? [...lines.slice(0, MAX_OUTPUT_LINES), `... (${lines.length - MAX_OUTPUT_LINES} more lines)`].join('\n')
    : lines.join('\n')
}

const seconds = (ms: number): string => `${Math.max(0, Math.round(ms / 1000))}s`

const terminalOf = (call: ShellCall): string => call.terminal ?? MAIN

const numberOf = (key: string): number => (key === MAIN ? 1 : /^t(\d+)$/.test(key) ? Number(key.slice(1)) : 0)

function tabsOf(
  list: readonly ShellCall[],
  current: TerminalView,
  knownAgents: readonly TerminalTab[] = [],
): TerminalTab[] {
  const tabs = new Map<string, string>([[MAIN, 'Terminal 1']])
  for (const tab of current.created) tabs.set(tab.key, tab.title)
  for (const tab of knownAgents) tabs.set(tab.key, tab.title)
  for (const call of list) {
    const key = terminalOf(call)
    if (!tabs.has(key)) tabs.set(key, key === MAIN ? 'Terminal 1' : (call.title ?? key))
  }
  const all = [...tabs].map(([key, title]) => ({ key, title }))
  const numbered = all.filter(tab => numberOf(tab.key) > 0).sort((a, b) => numberOf(a.key) - numberOf(b.key))
  const agents = all.filter(tab => numberOf(tab.key) === 0)
  return [...numbered, ...agents]
}

async function persist($: Engine): Promise<void> {
  try {
    await $.store.set(CALLS_KEY, await read($, calls))
    await $.store.set(VIEW_KEY, await read($, view))
  } catch {
    // history is a convenience; a failed save must not break the call
  }
}

function followEnd($: Engine): void {
  $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

async function changeCalls($: Engine, fn: (list: ShellCall[]) => ShellCall[]): Promise<void> {
  await update($, calls, list => fn(list ?? []))
  followEnd($)
  await persist($)
}

async function changeView($: Engine, fn: (current: TerminalView) => TerminalView): Promise<void> {
  await update($, view, current => fn(current ?? EMPTY_VIEW))
  followEnd($)
  await persist($)
}

async function agentTitle($: Engine, agentId: string): Promise<string> {
  try {
    const known = (await read($, agents)).find(one => one.key === agentKey(agentId))
    if (known !== undefined) return known.title
    const agent = (await $.agent.list()).find(one => one.id === agentId)
    if (agent !== undefined) return agentLabel(agent.type, agent.description)
  } catch {
    // fall back to the id
  }
  return `Agent ${agentId.slice(0, 6)}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'terminal-watch',
      description: 'Show the shell commands Claude and its agents run, one terminal each',
    })

    if ((await read($, calls)).length === 0) {
      const saved = await $.store.get(CALLS_KEY)
      if (Array.isArray(saved) && saved.length > 0) {
        const restored = (saved as ShellCall[]).map(one =>
          one.isDone ? one : { ...one, isDone: true, isError: true, output: one.output || '(interrupted)' },
        )
        await update($, calls, () => restored.slice(-MAX_CALLS))
      }
      const savedView = await $.store.get(VIEW_KEY)
      if (savedView !== null && typeof savedView === 'object' && Array.isArray((savedView as TerminalView).created)) {
        await update($, view, () => savedView as TerminalView)
      }
    }

    void $.ui.open({ id: PANE, title: 'Terminal' })

    return next(e)
  })

  on('command.run', { command: 'terminal-watch' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Terminal' })
    followEnd($)

    return { text: 'Terminal pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny === undefined && spawned.agentId !== undefined) {
      const tab = { key: agentKey(spawned.agentId), title: agentLabel(e.subagentType, e.description) }
      await update($, agents, list => [...(list ?? []).filter(one => one.key !== tab.key), tab])
    }
    return spawned
  })

  on('tool.call', async ($, e, next) => {
    if (!SHELL_TOOLS.has(e.tool)) return next(e)

    const description = String((e as { description?: string }).description ?? '')
    const tag = TERMINAL_TAG.exec(description)
    let terminal = MAIN
    let title = 'Terminal 1'
    if (e.agentId !== undefined) {
      terminal = agentKey(e.agentId)
      title = await agentTitle($, e.agentId)
    } else if (tag !== null && Number(tag[1]) > 1) {
      terminal = `t${Number(tag[1])}`
      title = `Terminal ${Number(tag[1])}`
    }

    let cwd = ''
    try {
      cwd = await $.session.cwd()
    } catch {
      cwd = ''
    }
    const startedAt = Date.now()
    const call: ShellCall = {
      id: e.tool_use_id,
      tool: e.tool,
      command: String((e as { command?: string }).command ?? ''),
      cwd,
      output: '',
      isDone: false,
      isError: false,
      startedAt,
      terminal,
      title,
      ...(e.agentId !== undefined ? { agentId: e.agentId } : {}),
    }
    await update($, now, () => startedAt)
    await changeCalls($, list => [...list, call].slice(-MAX_CALLS))
    await update($, view, v => ({ ...(v ?? EMPTY_VIEW), back: 0 }))

    const tick = $.clock.every(1000, () => {
      void update($, now, () => Date.now())
    })
    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } finally {
      tick.cancel()
    }

    if (CLEAR.test(call.command) && ran.deny === undefined && ran.isError !== true) {
      await changeCalls($, list => list.filter(one => terminalOf(one) !== terminal))
      return ran
    }

    const isError = ran.deny !== undefined || ran.isError === true
    const output = (ran.deny !== undefined ? ran.deny : String(ran.text ?? '')).replace(ANSI, '')
    const endedAt = Date.now()
    await changeCalls($, list =>
      list.map(one =>
        one.id === call.id ? { ...one, isDone: true, isError, output: clip(output), endedAt } : one,
      ),
    )

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Select = 'Select' in elements ? elements.Select : undefined
    const all = await read($, calls)
    const current = await read($, view)
    const tickNow = await read($, now)
    const spawned = await read($, agents)
    const liveRunning = new Set<string>()
    const known: TerminalTab[] = [...spawned]
    try {
      for (const agent of await $.agent.list()) {
        const key = agentKey(agent.id)
        if (agent.status === 'running') liveRunning.add(key)
        if (!known.some(tab => tab.key === key)) known.push({ key, title: agentLabel(agent.type, agent.description) })
      }
    } catch {
      // the spawn hook's record is enough
    }
    const tabs = tabsOf(all, current, known)
    const terminalTabs = tabs.filter(tab => !tab.key.startsWith('agent-'))
    const agentTabs = tabs.filter(tab => tab.key.startsWith('agent-'))
    const selected = tabs.some(tab => tab.key === current.selected) ? current.selected : MAIN
    const list = all.filter(call => terminalOf(call) === selected)
    const isAgent = selected.startsWith('agent-')
    const promptColor = isAgent ? 'cyan' : 'green'
    const isRunning = (key: string): boolean =>
      liveRunning.has(key) || all.some(call => terminalOf(call) === key && !call.isDone)

    const select = (key: string) => () => {
      void changeView($, v => ({ ...v, selected: key, back: 0 }))
    }
    const addTerminal = () => {
      void changeView($, v => {
        const used = tabsOf(all, v).map(tab => numberOf(tab.key))
        const n = Math.max(1, ...used) + 1
        const key = `t${n}`
        return { selected: key, created: [...v.created, { key, title: `Terminal ${n}` }], back: 0 }
      })
    }
    const removeTerminal = () => {
      if (selected === MAIN) return
      void update($, calls, list => (list ?? []).filter(call => terminalOf(call) !== selected)).then(() =>
        changeView($, v => ({ selected: MAIN, created: v.created.filter(tab => tab.key !== selected), back: 0 })),
      )
    }

    const rows: { text: string; color?: string; bold?: boolean; dim?: boolean }[] = []
    for (const call of list) {
      const cwd = call.cwd ?? ''
      const output = call.output ?? ''
      const prompt = call.tool === 'PowerShell' ? `PS ${cwd}>` : `${cwd}>`
      const status = call.isDone
        ? call.isError && call.endedAt !== undefined
          ? `  [failed, ${seconds(call.endedAt - call.startedAt)}]`
          : ''
        : `  ... running ${seconds(Math.max(tickNow, call.startedAt) - call.startedAt)}`
      rows.push({ text: `${prompt} ${call.command ?? ''}${status}`, color: promptColor, bold: true })
      if (output !== '') {
        for (const line of output.split('\n')) {
          if (line.startsWith('Shell cwd was reset to')) continue
          rows.push({ text: line === '' ? ' ' : line, color: call.isError ? 'red' : undefined })
        }
      }
    }
    if (list.length === 0 && selected !== MAIN && !isAgent) {
      rows.push({ text: `Tell Claude: "run <command> in terminal ${numberOf(selected)}"`, dim: true })
    }
    if (list.length === 0 && isAgent) {
      rows.push({ text: 'This agent has not run any shell command yet.', dim: true })
    }

    const last = list[list.length - 1]
    let idleCwd = last?.cwd ?? ''
    if (!isAgent) {
      try {
        idleCwd = await $.session.cwd()
      } catch {
        // keep the last command's folder
      }
    }
    const idlePrompt = last?.tool === 'PowerShell' ? `PS ${idleCwd}> █` : `${idleCwd}> █`
    rows.push({ text: idlePrompt, color: promptColor, bold: true })

    const columns = Math.max(10, e.props.bodyColumns ?? 40)
    const bodyRows = Math.max(6, e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30)
    const barHidden = current.barHidden === true
    const headerRows = barHidden ? 1 : 4
    const room = Math.max(3, bodyRows - headerRows - 1)
    const cost = (text: string): number => Math.max(1, Math.ceil(text.length / columns))
    const back = Math.min(Math.max(0, current.back ?? 0), Math.max(0, rows.length - 1))
    const end = rows.length - back
    let start = end
    let used = 0
    while (start > 0 && used + cost(rows[start - 1].text) <= room) {
      used += cost(rows[start - 1].text)
      start -= 1
    }
    if (start === end && end > 0) start = end - 1
    const shown = rows.slice(start, end)
    const page = Math.max(1, end - start - 1)
    const olderHidden = start
    const newerHidden = rows.length - end

    const scrollUp = () => {
      void changeView($, v => ({ ...v, back: Math.min(rows.length - 1, (v.back ?? 0) + page) }))
    }
    const scrollDown = () => {
      void changeView($, v => ({ ...v, back: Math.max(0, (v.back ?? 0) - page) }))
    }
    const scrollToEnd = () => {
      void changeView($, v => ({ ...v, back: 0 }))
    }
    const toggleBar = () => {
      void changeView($, v => ({ ...v, barHidden: v.barHidden !== true }))
    }
    const toggleAgents = () => {
      void changeView($, v => ({ ...v, agentsHidden: v.agentsHidden !== true }))
    }
    const agentsHidden = current.agentsHidden === true

    const bar = (
        <Box key="bar" flexDirection="row" flexWrap="wrap" columnGap={1}>
          {terminalTabs.map(tab => (
            <Button
              key={`tab-${tab.key}`}
              label={`${tab.title}${isRunning(tab.key) ? ' *' : ''}`}
              variant={tab.key === selected ? 'primary' : 'secondary'}
              dimColor={tab.key !== selected}
              onPress={select(tab.key)}
            />
          ))}
          <Button key="add" label="+" onPress={addTerminal} />
          {(selected === MAIN || isAgent ? [] : [<Button key="remove" label="x" dimColor onPress={removeTerminal} />])}
          {(agentTabs.length === 0 || Select === undefined
            ? []
            : agentsHidden
              ? [<Button key="toggle-agents" label="Agents" onPress={toggleAgents} />]
              : [
                <Select
                  key="agent-select"
                  label="Agent:"
                  value={isAgent ? selected : NO_AGENT}
                  options={[
                    { value: NO_AGENT, label: `- choose (${agentTabs.length}) -` },
                    ...agentTabs.map(tab => ({
                      value: tab.key,
                      label: `${tab.title}${isRunning(tab.key) ? ' *' : ''}`,
                    })),
                  ]}
                  onSelect={value => {
                    if (value !== NO_AGENT) select(value)()
                  }}
                />,
                <Button key="toggle-agents" label="Hide" onPress={toggleAgents} />,
              ])}
        </Box>
    )

    return (
      <Box flexDirection="column">
        {(barHidden ? [] : [bar])}
        <Box flexDirection="row" columnGap={1}>
          <Button
            key="toggle-bar"
            label={barHidden ? '☰' : 'Hide'}
            onPress={toggleBar}
          />
          {(olderHidden > 0 ? [<Button key="up" label="▲" plain onPress={scrollUp} />] : [])}
          {(newerHidden > 0
            ? [
                <Button key="down" label="▼" plain onPress={scrollDown} />,
                <Button key="latest" label="latest" plain dimColor onPress={scrollToEnd} />,
              ]
            : [])}
          <Text dimColor>
            {olderHidden > 0 || newerHidden > 0
              ? `${olderHidden} earlier / ${newerHidden} newer lines`
              : ' '}
          </Text>
        </Box>
        {shown.map(row => (
          <Text color={row.color} bold={row.bold} dimColor={row.dim}>{row.text}</Text>
        ))}
      </Box>
    )
  })
}
