#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 0 ]]; then
  printf 'Usage: %s\n' "${0##*/}" >&2
  exit 2
fi
if [[ -z "${HOME:-}" ]]; then
  printf 'HOME is required to resolve ~/.pi-backlog.\n' >&2
  exit 2
fi

backlog_bin=${BACKLOG_BIN:-$(command -v backlog || true)}
if [[ -z "$backlog_bin" || ! -x "$backlog_bin" ]]; then
  printf 'Backlog.md CLI not found; install it outside this skill, then retry.\n' >&2
  exit 127
fi

dotsync_bin=${DOTSYNC_BIN:-$(command -v dotsync2 || true)}
if [[ -z "$dotsync_bin" || ! -x "$dotsync_bin" ]]; then
  printf 'DotSync CLI not found; install or configure dotsync2, then retry.\n' >&2
  exit 127
fi

project_root="$HOME/.pi-backlog"
mkdir -p "$project_root"

config_file=''
for candidate in backlog.config.yml backlog/config.yml .backlog/config.yml; do
  if [[ -f "$project_root/$candidate" ]]; then
    config_file=$candidate
    break
  fi
done
if [[ -z "$config_file" ]]; then
  BACKLOG_CWD="$project_root" "$backlog_bin" init 'Personal Backlog' \
    --defaults \
    --integration-mode none \
    --no-git \
    --check-branches false \
    --include-remote false \
    --bypass-git-hooks false \
    --auto-open-browser false
fi

if ! "$dotsync_bin" paths list | grep -Eq '^[[:space:]]*-[[:space:]]+"?\.pi-backlog/?"?([[:space:]]|$)'; then
  "$dotsync_bin" paths add .pi-backlog
fi
"$dotsync_bin" sync

printf 'PROJECT_ROOT=%s\n' "$project_root"
