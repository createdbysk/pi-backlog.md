#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
skill_file="$repo_root/SKILL.md"
preflight="$repo_root/scripts/preflight.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[[ -f "$skill_file" ]] || fail "SKILL.md is missing"
[[ -x "$preflight" ]] || fail "scripts/preflight.sh is missing or not executable"

grep -Fx -- 'name: pi-backlog' "$skill_file" >/dev/null || fail "frontmatter name is not pi-backlog"
grep -F -- 'only when the user explicitly asks' "$skill_file" >/dev/null || fail "trigger gate is missing"
grep -F -- 'active session state already names a Backlog.md ticket' "$skill_file" >/dev/null || fail "active-ticket trigger is missing"

if grep -E -- '^[[:space:]]*(backlog (browser|mcp|agents)|sl push .*main)' "$skill_file"; then
  fail "forbidden command found in SKILL.md"
fi

missing_cli_output=$(mktemp)
if BACKLOG_BIN='/definitely/missing/backlog' /bin/bash "$preflight" "$repo_root" >"$missing_cli_output" 2>&1; then
  fail "preflight accepted a missing CLI"
else
  missing_cli_rc=$?
fi
[[ "$missing_cli_rc" -eq 127 ]] || fail "missing CLI returned $missing_cli_rc instead of 127"
grep -F -- 'Backlog.md CLI not found; install it outside this skill, then retry.' "$missing_cli_output" >/dev/null || fail "missing CLI guidance changed"
rm -f -- "$missing_cli_output"

backlog_bin=${BACKLOG_BIN:-$(command -v backlog || true)}
[[ -n "$backlog_bin" ]] || fail "backlog is required for the skeleton probe"
uninitialized=$(mktemp -d '/tmp/pi backlog missing project.XXXXXX')
missing_project_output=$(mktemp)
if BACKLOG_BIN="$backlog_bin" /bin/bash "$preflight" "$uninitialized" >"$missing_project_output" 2>&1; then
  fail "preflight accepted an uninitialized project"
else
  missing_project_rc=$?
fi
[[ "$missing_project_rc" -eq 3 ]] || fail "missing project returned $missing_project_rc instead of 3"
grep -F -- 'Backlog.md project not initialized:' "$missing_project_output" >/dev/null || fail "missing project guidance changed"
rm -rf -- "$uninitialized"
rm -f -- "$missing_project_output"

BACKLOG_BIN="$backlog_bin" /bin/bash "$preflight" "$repo_root" >/dev/null

pi_node=${PI_NODE_BIN:-$(command -v pi-node || command -v node || true)}
[[ -n "$pi_node" ]] || fail "Node runtime not found"
sdk_entry=${PI_SDK_ENTRY:-"${HOME}/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/index.js"}
[[ -f "$sdk_entry" ]] || fail "Pi SDK entry not found: $sdk_entry"
agent_dir=$(mktemp -d '/tmp/pi backlog agent dir.XXXXXX')
"$pi_node" "$repo_root/tests/probe-pi-discovery.mjs" "$skill_file" "$sdk_entry" "$agent_dir"
rm -rf -- "$agent_dir"

printf 'PASS: tested pi-backlog skill skeleton\n'
