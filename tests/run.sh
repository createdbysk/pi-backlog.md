#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
backlog_bin=${BACKLOG_BIN:-$(command -v backlog || true)}
pi_node=${PI_NODE_BIN:-$(command -v pi-node || command -v node || true)}
sdk_entry=${PI_SDK_ENTRY:-"${HOME}/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/index.js"}

[[ -n "$backlog_bin" ]] || { printf 'Backlog.md CLI not found. Set BACKLOG_BIN.\n' >&2; exit 127; }
[[ -x "$backlog_bin" ]] || { printf 'Backlog.md CLI is not executable: %s\n' "$backlog_bin" >&2; exit 127; }
[[ -n "$pi_node" ]] || { printf 'Node runtime not found. Set PI_NODE_BIN.\n' >&2; exit 127; }
[[ -f "$sdk_entry" ]] || { printf 'Pi SDK entry not found: %s\n' "$sdk_entry" >&2; exit 2; }

BACKLOG_BIN="$backlog_bin" PI_NODE_BIN="$pi_node" PI_SDK_ENTRY="$sdk_entry" "$repo_root/tests/test-skeleton.sh"
"$pi_node" "$repo_root/tests/check-content.mjs" "$repo_root"
"$pi_node" "$repo_root/tests/probe-backlog.mjs" "$repo_root" "$backlog_bin"

printf 'PASS: complete pi-backlog verification suite\n'
