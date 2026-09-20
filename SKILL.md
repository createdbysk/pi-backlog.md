---
name: pi-backlog
description: Manage durable project tickets through the Backlog.md CLI only when the user explicitly asks to initialize Backlog.md or create, find, view, edit, assign, prioritize, link, complete, or archive tickets, or when active session state already names a Backlog.md ticket. Do not use for general planning, ordinary coding, session startup, or automatic project context.
---

# Pi Backlog

Use Backlog.md as a pull-only, project-local ticket store. Load only the ticket data needed for the current request.

## Activation gate

Activate this skill only when:

- the user explicitly asks for Backlog.md initialization or ticket work; or
- active session state already points to one Backlog.md ticket.

Otherwise, do not inspect the backlog. Never load all open tickets at session start, and never run Backlog.md's generated workflow overview automatically.

## Boundaries

- Use the installed `backlog` CLI as the only ticket backend. Do not edit ticket Markdown by hand.
- Resolve the project directory from an explicit user path or trusted active project state. Never guess a global ticket store.
- Set `BACKLOG_CWD` to that exact directory for every CLI call.
- Keep durable scope, acceptance criteria, dependencies, status, comments, and final summaries in Backlog.md.
- Let `session-discipline` retain only the active ticket ID, its project path, and transient execution state. Do not copy ticket bodies into live notes.
- Do not install integrations or start auxiliary services. This skill requires no UI, server, automatic context source, or alternate protocol.

## Preflight

Before ticket reads or writes, run `scripts/preflight.sh <exact-project-directory>` from this skill directory or perform the same checks directly:

1. Resolve `backlog` from `BACKLOG_BIN` or `PATH`. If absent, stop and report the missing CLI. Do not install it.
2. Confirm the exact project directory exists.
3. Confirm that directory contains `backlog.config.yml`, `backlog/config.yml`, or `.backlog/config.yml`.
4. If no config exists, stop. Initialize only after an explicit user request.

After preflight, invoke the CLI with `BACKLOG_CWD` set to the reported project directory. Prefer `--json` for reads and `--plain` for noninteractive writes.

## Operation routing

After the activation gate passes:

- Read [CLI workflows](references/cli-workflows.md) for initialization and ticket commands.
- Read [safe text handling](references/safe-text.md) before a command carries user-authored ticket text.
- Read [concurrency and recovery](references/concurrency.md) when several agents or processes may write the project.

View the named ticket before any update, make the smallest requested change, then view it again to verify the result. Treat cleanup and archive operations as destructive moves that require explicit user intent.
