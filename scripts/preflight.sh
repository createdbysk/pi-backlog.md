#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -gt 1 ]]; then
  printf 'Usage: %s [exact-project-directory]\n' "${0##*/}" >&2
  exit 2
fi

backlog_bin=${BACKLOG_BIN:-}
if [[ -z "$backlog_bin" ]]; then
  backlog_bin=$(command -v backlog || true)
fi
if [[ -z "$backlog_bin" || ! -x "$backlog_bin" ]]; then
  printf 'Backlog.md CLI not found; install it outside this skill, then retry.\n' >&2
  exit 127
fi

if [[ "$#" -eq 1 ]]; then
  project_input=$1
else
  if [[ -z "${HOME:-}" ]]; then
    printf 'HOME is required to resolve the default Backlog.md project.\n' >&2
    exit 2
  fi
  project_input="$HOME/.pi-backlog"
fi
if [[ ! -d "$project_input" ]]; then
  printf 'Project directory not found: %s\n' "$project_input" >&2
  exit 2
fi
project_root=$(cd -- "$project_input" && pwd -P)

config_file=''
for candidate in backlog.config.yml backlog/config.yml .backlog/config.yml; do
  if [[ -f "$project_root/$candidate" ]]; then
    config_file=$candidate
    break
  fi
done
if [[ -z "$config_file" ]]; then
  printf 'Backlog.md project not initialized: %s\n' "$project_root" >&2
  printf 'Ask for explicit initialization authority before running backlog init.\n' >&2
  exit 3
fi

printf 'BACKLOG_BIN=%s\n' "$backlog_bin"
printf 'PROJECT_ROOT=%s\n' "$project_root"
printf 'CONFIG_FILE=%s\n' "$config_file"
