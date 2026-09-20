import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [repoRoot] = process.argv.slice(2);
assert.ok(repoRoot, "repository root argument is required");

const requiredFiles = [
  "SKILL.md",
  "README.md",
  "references/cli-workflows.md",
  "references/safe-text.md",
  "references/concurrency.md",
  "scripts/preflight.sh",
];
const contents = new Map();
for (const relativePath of requiredFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolutePath), `required file is missing: ${relativePath}`);
  contents.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
}

const skill = contents.get("SKILL.md");
const workflows = contents.get("references/cli-workflows.md");
const safeText = contents.get("references/safe-text.md");
const concurrency = contents.get("references/concurrency.md");
const readme = contents.get("README.md");
const publicText = [...contents.values()].join("\n");

for (const token of [
  "--integration-mode none",
  "--no-git",
  "--check-branches false",
  "--include-remote false",
  "--bypass-git-hooks false",
  "--auto-open-browser false",
  "task create",
  "task list --json",
  "search",
  "task view",
  "task edit",
  "--assignee",
  "--priority",
  "--status",
  "--depends-on",
  "--clear-deps",
  "--final-summary",
  "task complete",
  "task archive",
]) {
  assert.ok(workflows.includes(token), `workflow reference is missing: ${token}`);
}

assert.match(skill, /only when the user explicitly asks/);
assert.match(skill, /active session state already names a Backlog\.md ticket/);
assert.match(skill, /only the active ticket ID, its project path, and transient execution state/);
assert.match(skill, /Never load all open tickets at session start/);
assert.match(safeText, /Never use `eval`/);
assert.match(safeText, /literal backticks/);
assert.match(concurrency, /being modified by another process/);
assert.match(concurrency, /does not publish a general multi-writer transaction guarantee/);

for (const heading of ["# pi-backlog", "## Installation", "## Usage", "## Limitations", "## Verification"]) {
  assert.ok(readme.includes(heading), `README is missing heading: ${heading}`);
}

const forbiddenCommandPatterns = [
  new RegExp(["backlog", "browser"].join("\\s+"), "i"),
  new RegExp(["backlog", "mcp"].join("\\s+"), "i"),
  new RegExp(["backlog", "agents"].join("\\s+"), "i"),
  new RegExp(["backlog", "instructions", "overview"].join("\\s+"), "i"),
  /--integration-mode\s+(?:cli|mcp)/i,
  /--auto-open-browser\s+true/i,
  /--check-branches\s+true/i,
  /--include-remote\s+true/i,
  /sl\s+push[^\n]*\bmain\b/i,
];
for (const pattern of forbiddenCommandPatterns) {
  assert.doesNotMatch(publicText, pattern, `forbidden instruction matched ${pattern}`);
}

for (const forbiddenPath of ["extensions", ".pi/extensions", ".pi/hooks", "server", "daemon"]) {
  assert.equal(fs.existsSync(path.join(repoRoot, forbiddenPath)), false, `forbidden implementation path exists: ${forbiddenPath}`);
}

console.log("PASS: documentation covers required flows and excludes prohibited surfaces");
