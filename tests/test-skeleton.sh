#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
skill_file="$repo_root/SKILL.md"
preflight="$repo_root/scripts/preflight.sh"
claim_helper="$repo_root/scripts/claim-ticket.mjs"
recovery_helper="$repo_root/scripts/recover-ticket.mjs"
temp_paths=()

cleanup() {
  for item in "${temp_paths[@]}"; do rm -rf -- "$item"; done
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[[ -f "$skill_file" ]] || fail "SKILL.md is missing"
[[ -x "$preflight" ]] || fail "scripts/preflight.sh is missing or not executable"
[[ -x "$claim_helper" ]] || fail "scripts/claim-ticket.mjs is missing or not executable"
[[ -x "$recovery_helper" ]] || fail "scripts/recover-ticket.mjs is missing or not executable"
[[ -f "$repo_root/package.json" ]] || fail "package.json is missing"
[[ ! -e "$repo_root/backlog" ]] || fail "product source contains a live backlog board"
if git -C "$repo_root" rev-parse --git-dir >/dev/null 2>&1; then
  [[ -z "$(git -C "$repo_root" ls-files -- backlog .pi)" ]] || fail "product checkpoint tracks operational state"
fi
grep -Fx -- '/backlog/' "$repo_root/.gitignore" >/dev/null || fail "backlog ignore guard is missing"
grep -Fx -- '/.pi/' "$repo_root/.gitignore" >/dev/null || fail "Pi runtime ignore guard is missing"
for role in relay developer reviewer; do
  [[ -f "$repo_root/skills/pi-backlog-$role/SKILL.md" ]] || fail "pi-backlog-$role skill is missing"
done

grep -Fx -- 'name: pi-backlog' "$skill_file" >/dev/null || fail "frontmatter name is not pi-backlog"
grep -F -- 'only when the user explicitly asks' "$skill_file" >/dev/null || fail "trigger gate is missing"
grep -F -- 'active session state already names a Backlog.md ticket' "$skill_file" >/dev/null || fail "active-ticket trigger is missing"

if grep -E -- '^[[:space:]]*(backlog (browser|mcp|agents)|sl push .*main)' "$skill_file"; then
  fail "forbidden command found in SKILL.md"
fi

missing_cli_output=$(mktemp)
temp_paths+=("$missing_cli_output")
if BACKLOG_BIN='/definitely/missing/backlog' /bin/bash "$preflight" "$repo_root" >"$missing_cli_output" 2>&1; then
  fail "preflight accepted a missing CLI"
else
  missing_cli_rc=$?
fi
[[ "$missing_cli_rc" -eq 127 ]] || fail "missing CLI returned $missing_cli_rc instead of 127"
grep -F -- 'Backlog.md CLI not found; install it outside this skill, then retry.' "$missing_cli_output" >/dev/null || fail "missing CLI guidance changed"

backlog_bin=${BACKLOG_BIN:-$(command -v backlog || true)}
[[ -n "$backlog_bin" ]] || fail "backlog is required for the skeleton probe"
uninitialized=$(mktemp -d '/tmp/pi backlog missing project.XXXXXX')
temp_paths+=("$uninitialized")
missing_project_output=$(mktemp)
temp_paths+=("$missing_project_output")
if BACKLOG_BIN="$backlog_bin" /bin/bash "$preflight" "$uninitialized" >"$missing_project_output" 2>&1; then
  fail "preflight accepted an uninitialized project"
else
  missing_project_rc=$?
fi
[[ "$missing_project_rc" -eq 3 ]] || fail "missing project returned $missing_project_rc instead of 3"
grep -F -- 'Backlog.md project not initialized:' "$missing_project_output" >/dev/null || fail "missing project guidance changed"

initialized=$(mktemp -d '/tmp/pi backlog initialized project.XXXXXX')
temp_paths+=("$initialized")
BACKLOG_CWD="$initialized" "$backlog_bin" init 'Skeleton probe' --defaults --integration-mode none --no-git \
  --check-branches false --include-remote false --bypass-git-hooks false --auto-open-browser false >/dev/null
BACKLOG_BIN="$backlog_bin" /bin/bash "$preflight" "$initialized" >/dev/null

pi_node=${PI_NODE_BIN:-$(command -v pi-node || command -v node || true)}
[[ -n "$pi_node" ]] || fail "Node runtime not found"
sdk_entry=${PI_SDK_ENTRY:-"${HOME}/.pi/agent/npm/node_modules/@earendil-works/pi-coding-agent/dist/index.js"}
[[ -f "$sdk_entry" ]] || fail "Pi SDK entry not found: $sdk_entry"
agent_dir=$(mktemp -d '/tmp/pi backlog agent dir.XXXXXX')
temp_paths+=("$agent_dir")
"$pi_node" "$repo_root/tests/probe-pi-discovery.mjs" "$repo_root" "$sdk_entry" "$agent_dir"

printf 'PASS: tested pi-backlog skill skeleton and source-state guards\n'
