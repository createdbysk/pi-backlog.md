# Safe ticket text

Ticket text can contain shell syntax. Preserve it as data so spaces, quotes, punctuation, dollar signs, and literal backticks never become commands.

## Preferred method

Use a process API that accepts an argument array. Put each title, description, criterion, plan, note, comment, and summary in one array element. Do not join the array into a shell string.

The repository probe uses this method with Node's `spawnSync` and the installed Backlog.md CLI.

## Shell-only method

When only a shell command tool exists:

1. Create temporary files with restrictive permissions.
2. Write user-authored values with the tool's file-write API, not with an interpolated shell command.
3. Read each file into a variable.
4. Expand every variable inside double quotes.
5. Remove the temporary files after the CLI returns.

```bash
umask 077
title_file=$(mktemp)
description_file=$(mktemp)
# Use the agent file-write tool to place exact text in these files.
ticket_title=$(<"$title_file")
ticket_description=$(<"$description_file")
BACKLOG_CWD="$project_root" "$backlog_bin" task create \
  "$ticket_title" \
  --description "$ticket_description" \
  --plain
rm -f -- "$title_file" "$description_file"
```

Quoted variable expansion does not re-evaluate backticks or other shell operators stored in the variable.

Never use `eval`, construct `sh -c` text, use an unquoted here-document, or paste ticket text directly into a command string. Redact secrets before any ticket write because Backlog.md stores tickets as project files.
