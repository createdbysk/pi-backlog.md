import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [repoRoot] = process.argv.slice(2);
assert.ok(repoRoot, "repository root argument is required");

const requiredFiles = [
  ".gitignore",
  "SKILL.md",
  "README.md",
  "package.json",
  "lib/claim-state.mjs",
  "lib/exclusive-lock.mjs",
  "lib/relay-state.mjs",
  "references/cli-workflows.md",
  "references/safe-text.md",
  "references/concurrency.md",
  "references/choreography-protocol.md",
  "scripts/preflight.sh",
  "scripts/bootstrap.sh",
  "scripts/claim-ticket.mjs",
  "scripts/recover-ticket.mjs",
  "skills/pi-backlog-relay/SKILL.md",
  "skills/pi-backlog-developer/SKILL.md",
  "skills/pi-backlog-reviewer/SKILL.md",
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
const protocol = contents.get("references/choreography-protocol.md");
const relay = contents.get("skills/pi-backlog-relay/SKILL.md");
const developer = contents.get("skills/pi-backlog-developer/SKILL.md");
const reviewer = contents.get("skills/pi-backlog-reviewer/SKILL.md");
const claimState = contents.get("lib/claim-state.mjs");
const exclusiveLock = contents.get("lib/exclusive-lock.mjs");
const bootstrap = contents.get("scripts/bootstrap.sh");
const preflight = contents.get("scripts/preflight.sh");
const claim = contents.get("scripts/claim-ticket.mjs");
const recovery = contents.get("scripts/recover-ticket.mjs");
const manifest = JSON.parse(contents.get("package.json"));
const publicText = [...contents.values()].join("\n");

for (const token of [
  "--integration-mode none", "--no-git", "--check-branches false", "--include-remote false",
  "--bypass-git-hooks false", "--auto-open-browser false",
]) {
  assert.ok(`${workflows}\n${bootstrap}`.includes(token), `bootstrap contract is missing: ${token}`);
}
for (const token of [
  "task create", "task list --json", "search", "task view", "task edit", "--assignee", "--priority",
  "--status", "--depends-on", "--clear-deps", "--final-summary", "task complete", "task archive",
]) {
  assert.ok(workflows.includes(token), `workflow reference is missing: ${token}`);
}

assert.match(skill, /only when the user explicitly asks/);
assert.match(skill, /active session state already names a Backlog\.md ticket/);
assert.match(skill, /only the active ticket ID, its project path, and transient execution state/);
assert.match(skill, /Never load all open tickets at session start/);
assert.match(skill, /universal personal default `\$HOME\/.pi-backlog`/);
assert.match(skill, /Treat “my backlog”/);
assert.match(preflight, /project_input="\$HOME\/.pi-backlog"/);
assert.match(bootstrap, /project_root="\$HOME\/.pi-backlog"/);
assert.match(bootstrap, /paths add \.pi-backlog/);
assert.match(bootstrap, /"\$dotsync_bin" sync/);
assert.match(safeText, /Never use `eval`/);
assert.match(safeText, /literal backticks/);
assert.match(concurrency, /being modified by another process/);
assert.match(concurrency, /does not publish a general multi-writer transaction guarantee/);

assert.equal(manifest.name, "pi-backlog");
assert.equal(manifest.version, "0.3.0");
assert.ok(manifest.keywords.includes("pi-package"));
assert.deepEqual(manifest.pi.skills, ["./SKILL.md", "./skills"]);
assert.match(relay, /Never choose a worker/);
assert.match(relay, /durable Fabric mesh consumer cursor/);
assert.match(relay, /transport delivery separately/);
assert.match(relay, /active tickets owned by stale workers/);
assert.match(developer, /Select an eligible ticket/);
assert.match(developer, /atomic claim attempt/);
assert.match(reviewer, /Independent verification/);
assert.ok(reviewer.includes("**Pass:**"));
assert.ok(reviewer.includes("**Defect:**"));
assert.match(reviewer, /clear the reviewer assignee/);
assert.match(claimState, /Object\.hasOwn/);
assert.match(exclusiveLock, /openSync\(lockPath, "wx"/);
assert.doesNotMatch(`${claim}
${recovery}`, /linkSync|process\.exit\(/);
assert.match(recovery, /owner-authorized-by/);
assert.match(recovery, /still live/);

for (const phrase of [
  "WORKER_READY <developer|reviewer> <worker-id> intercom",
  "WORKER_QUEUE_ACK <developer|reviewer> <worker-id> <transition-id>",
  "successful Intercom send without acknowledgement remains retryable",
  "mutually exclusive",
  "Neither the relay nor a coordinator chooses or assigns a ticket",
  "Never infer death or authority from lock age",
  "Scheduled relay reconciliation",
  "accepted prototype limitation",
]) {
  assert.ok(protocol.includes(phrase), `choreography protocol is missing: ${phrase}`);
}

for (const heading of ["# pi-backlog", "## Installation", "## Usage", "## Limitations", "## Verification"]) {
  assert.ok(readme.includes(heading), `README is missing heading: ${heading}`);
}
assert.deepEqual(contents.get(".gitignore").trim().split("\n"), ["/backlog/", "/.pi/"]);
assert.equal(fs.existsSync(path.join(repoRoot, "backlog")), false, "product source contains a live backlog board");
assert.doesNotMatch(publicText, /coordinator (?:names|selects|assigns) (?:the |a )?ticket/i);

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
for (const forbiddenPath of ["extensions", "backlog", "server", "daemon"]) {
  assert.equal(fs.existsSync(path.join(repoRoot, forbiddenPath)), false, `forbidden implementation path exists: ${forbiddenPath}`);
}

console.log("PASS: documentation, state guards, and correction contracts are complete");
