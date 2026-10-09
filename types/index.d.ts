export type ShellCall = {
  id: string
  tool: string
  command: string
  cwd: string
  output: string
  isDone: boolean
  isError: boolean
  startedAt: number
  endedAt?: number
  agentId?: string
  terminal?: string
  title?: string
}

export type TerminalTab = { key: string; title: string }

export type TerminalView = { selected: string; created: TerminalTab[]; back?: number; barHidden?: boolean; agentsHidden?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'terminal-watch': { calls: ShellCall[]; now: number; view: TerminalView; agents: TerminalTab[] }
  }
}
