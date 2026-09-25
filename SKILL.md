---
name: pi-backlog
description: Manage durable project tickets through the Backlog.md CLI only when the user explicitly asks to initialize Backlog.md or create, find, view, edit, assign, prioritize, link, complete, or archive tickets, or when active session state already names a Backlog.md ticket. Unqualified personal requests such as “my backlog” use $HOME/.pi-backlog. Do not use for general planning, ordinary coding, session startup, or automatic project context.
---

# Pi Backlog

Use Backlog.md as a pull-only ticket store. The default personal board lives at `$HOME/.pi-backlog`. Load only the ticket data needed for the current request.

## Activation gate

Activate this skill only when:

- the user explicitly asks for Backlog.md initialization or ticket work; or
- active session state already points to one Backlog.md ticket.

Otherwise, do not inspect the backlog. Never load all open tickets at session start, and never run Backlog.md's generated workflow overview automatically.

## Boundaries

- Use the installed `backlog` CLI as the only ticket backend. Do not edit ticket Markdown by hand.
- Resolve an explicit project path first. Otherwise, use trusted active project state and then the universal personal default `$HOME/.pi-backlog`.
- Treat “my backlog” and equivalent unqualified personal-backlog requests as `$HOME/.pi-backlog`.
- Set `BACKLOG_CWD` to the resolved directory for every CLI call.
- Keep durable scope, acceptance criteria, dependencies, status, comments, and final summaries in Backlog.md.
- Let `session-discipline` retain only the active ticket ID, its project path, and transient execution state. Do not copy ticket bodies into live notes.
- Do not install a UI, server, background service, automatic context source, or alternate agent protocol. On an explicit request to initialize the personal backlog, the bootstrap may register `.pi-backlog` with DotSync.

## Preflight

Before ticket reads or writes, run `scripts/preflight.sh [exact-project-directory]` from this skill directory or perform the same checks directly. With no argument, preflight resolves `$HOME/.pi-backlog`.

1. Resolve `backlog` from `BACKLOG_BIN` or `PATH`. If absent, stop and report the missing CLI. Do not install it.
2. Resolve the explicit project directory, or `$HOME/.pi-backlog` when the request names no project.
3. Confirm that directory exists and contains `backlog.config.yml`, `backlog/config.yml`, or `.backlog/config.yml`.
4. If the default personal board is absent, stop. Run `scripts/bootstrap.sh` only after an explicit request to initialize it.

After preflight, invoke the CLI with `BACKLOG_CWD` set to the reported project directory. Prefer `--json` for reads and `--plain` for noninteractive writes.

## Operation routing

After the activation gate passes:

- Read [CLI workflows](references/cli-workflows.md) for initialization and ticket commands.
- Read [safe text handling](references/safe-text.md) before a command carries user-authored ticket text.
- Read [concurrency and recovery](references/concurrency.md) when several agents or processes may write the project.

View the named ticket before any update, make the smallest requested change, then view it again to verify the result. Treat cleanup and archive operations as destructive moves that require explicit user intent.
