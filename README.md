# terminal-watch

A Claude Code mod that shows the shell commands Claude runs (Bash and PowerShell) in a live, terminal-style pane — in the terminal and in the desktop app's Code tab.

```
[Terminal 1] [Terminal 2] [+] [x]  Agent: [- choose (5) - v]  [Hide]
[Hide]  ▲  12 earlier / 0 newer lines
C:\projects\app> npm test
  PASS  src/app.test.ts
C:\projects\app> cat missing.txt  [failed, 0s]
cat: missing.txt: No such file or directory
C:\projects\app> █
```

## Features

- Each command shows the folder it ran in (`path>` for Bash, `PS path>` for PowerShell), then its output. Failed commands are red.
- A running command shows `... running 3s`.
- **Several terminals.** Click `+` to add one, `x` to remove the one you are viewing. Ask Claude to "run `<command>` in terminal 2" and it lands there.
- **Each subagent's commands** can be viewed on their own. Pick the agent from the `Agent:` dropdown; a running agent is marked `*`.
- `clear`, `cls` or `Clear-Host` empties the current terminal.
- `▲` / `▼` page through older output. `Hide` hides the button bar (`☰` brings it back); the `Hide` next to the agent dropdown hides only the dropdown.
- History, the terminals you made and what is hidden are kept across sessions.
- `/terminal-watch` reopens the pane if you closed it.

The pane only watches. You can't type into it, and it does not change or block any command.

## Install

Type this at the prompt of `claude` in a terminal (the desktop Code tab cannot run `/plugin install`):

```
/plugin install terminal-watch --marketplace danaiwat67/claude-terminal-watch
```

Answer `y` to add the marketplace, then press Enter to install at the user scope. It then also loads in the desktop app's Code tab for new sessions.

### Telling Claude which terminal to use

Claude routes a command to terminal N when the Bash/PowerShell call's `description` starts with `[TN]`, for example `[T2] start dev server`. Asking "run `npm run dev` in terminal 2" is usually enough. You can also add a line like this to your `CLAUDE.md`:

```
When I ask to run a command in terminal N, start the Bash/PowerShell description with [TN].
```

## Uninstall

```
/plugin uninstall terminal-watch
```

To wipe the saved history first, run `clear` in each terminal and agent view.

## Notes

- The saved history (last 300 commands, up to 40 output lines each) is stored on your machine and covers every project you use Claude Code in. If a command prints a secret, that output is kept too. Clear it with `clear`.
- This uses Claude Code's plugin hooks API, which is in early access. A Claude Code update can break the mod until it is updated.
- The mobile app has no dropdown, so the agent picker is not shown there.

## Development

```
claude plugin validate .
claude plugin test .
```
