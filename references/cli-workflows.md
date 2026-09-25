# Backlog.md CLI workflows

Use these commands only after the `pi-backlog` activation gate passes. The examples match Backlog.md 1.52.0. Inspect `backlog --version` and the relevant `--help` output before relying on them with another version.

## Command setup

Resolve the CLI and project root. Unqualified personal-backlog requests use the universal Unix default:

```bash
project_root=${explicit_project_root:-"$HOME/.pi-backlog"}
backlog_bin=$(command -v backlog)
```

Set `BACKLOG_CWD` on every command, even when the shell already sits in the project. This prevents a parent project or unrelated working directory from receiving the request.

For free-form text, follow [safe text handling](safe-text.md) instead of inserting user text into a shell command.

## Initialize the personal backlog

Initialize only when the user explicitly asks. Run the package bootstrap with no location prompt:

```bash
scripts/bootstrap.sh
```

The bootstrap:

1. creates `$HOME/.pi-backlog`;
2. initializes a filesystem-only Backlog.md project there when needed;
3. adds `.pi-backlog` to the active DotSync path set when absent; and
4. runs `dotsync2 sync`.

It is safe to rerun and never reinitializes an existing board. Backlog.md 1.52.0 rejects `--integration-mode none` when the same command also passes agent-instruction or agent-install flags. The bootstrap passes no such flags and saves:

- `filesystemOnly: true`
- `checkActiveBranches: false`
- `remoteOperations: false`
- `autoCommit: false`

It also keeps browser auto-open and Git-hook bypass off. Verify the result:

```bash
scripts/preflight.sh
BACKLOG_CWD="$HOME/.pi-backlog" "$backlog_bin" config list
```


## Create a ticket

Prepare title, description, acceptance criteria, and other free-form fields through the safe-text procedure. Then pass each value as one quoted argument:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task create "$ticket_title" \
  --description "$ticket_description" \
  --status "$todo_status" \
  --priority "$priority" \
  --assignee "$assignee" \
  --ac "$acceptance_criterion" \
  --plain
```

Use repeated `--ac` flags for several criteria. `--plan` and `--notes` work at creation time only when the ticket starts in an active status. Omit fields the user did not request rather than invent values.

## List and search

Pull only the narrow data that the request needs:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task list --json
BACKLOG_CWD="$project_root" "$backlog_bin" task list --status "$status" --json
BACKLOG_CWD="$project_root" "$backlog_bin" task list --ready --json
BACKLOG_CWD="$project_root" "$backlog_bin" search "$query" --type task --json
```

Prefer filters such as status, assignee, priority, labels, type, `--ready`, and `--limit`. Do not list every open ticket merely to orient a session.

## View one ticket

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task view "$ticket_id" --json
```

Use this before and after each write. Preserve the schema version in any code that consumes JSON.

## Edit fields

One edit can update related fields and reduce stale read/write windows:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" \
  --title "$ticket_title" \
  --description "$ticket_description" \
  --plain
```

Use only the requested flags. Important field operations include:

```bash
# Replace assignment; an empty value clears all assignees.
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --assignee "$assignee" --plain
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --assignee '' --plain

# Set priority or status to an exact configured value.
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --priority "$priority" --plain
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --status "$status" --plain

# Replace or append durable execution fields.
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --plan "$plan" --plain
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --append-notes "$note" --plain
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --comment "$comment" --comment-author "$author" --plain
```

Read `backlog config list` when status or priority names remain unclear. Do not assume every project uses the default values.

## Replace or clear dependencies

`--depends-on` replaces the complete dependency list. View the ticket first, compute the full intended list, and pass all IDs together:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" \
  --depends-on "$dependency_ids" \
  --plain
```

Clear all dependencies only on an explicit request:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" --clear-deps --plain
```

Use `task list --ready --json` to find tickets whose dependencies have reached terminal status.

## Complete work

A status transition marks work done; the cleanup command moves the file out of the active board. Keep those actions separate.

1. View the ticket and verify acceptance evidence.
2. Check each proven criterion with `--check-ac <index>`.
3. Set the configured terminal status and a concise final summary.
4. View the ticket again and verify the status, criteria, and summary.

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task edit "$ticket_id" \
  --check-ac "$criterion_index" \
  --status "$terminal_status" \
  --final-summary "$final_summary" \
  --plain
```

Run cleanup only when the user asks to remove the terminal ticket from the active board:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task complete "$ticket_id"
```

Backlog.md 1.52.0 requires terminal status before this move.

## Archive unfinished or cancelled work

Archive only when the user explicitly asks to remove a ticket without completing it:

```bash
BACKLOG_CWD="$project_root" "$backlog_bin" task archive "$ticket_id"
```

View the ticket first, report that archive removes it from the active board, and verify the resulting file location.

## Failure behavior

- Missing CLI: stop, report how the caller can supply or install `backlog`, and do not install it.
- Missing project config: stop with the exact directory. Do not initialize unless the user asked.
- Unknown ticket or invalid field value: report the CLI error. Do not edit Markdown to bypass validation.
- Concurrent modification: follow [concurrency and recovery](concurrency.md).
