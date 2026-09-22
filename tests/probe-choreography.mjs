import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [repoRoot, backlogBin] = process.argv.slice(2);
assert.ok(repoRoot && backlogBin);
const claimScript = path.join(repoRoot, "scripts", "claim-ticket.mjs");

function invoke(projectRoot, args, expectedStatus = 0) {
  const result = spawnSync(backlogBin, args, {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_CWD: projectRoot },
    encoding: "utf8",
  });
  assert.equal(result.status, expectedStatus, `${args.join(" ")}\n${result.stdout}${result.stderr}`);
  return result;
}

function claim(projectRoot, ticketId, role, workerId) {
  return spawnSync(process.execPath, [claimScript, projectRoot, ticketId, role, workerId], {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_BIN: backlogBin },
    encoding: "utf8",
  });
}

function claimAsync(projectRoot, ticketId, role, workerId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [claimScript, projectRoot, ticketId, role, workerId], {
      cwd: repoRoot,
      env: { ...process.env, BACKLOG_BIN: backlogBin },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function taskIdFromCreate(result) {
  const match = result.stdout.match(/Task (TASK-\d+) -/);
  assert.ok(match, `could not parse task ID from ${result.stdout}`);
  return match[1];
}

function view(projectRoot, ticketId) {
  return JSON.parse(invoke(projectRoot, ["task", "view", ticketId, "--json"]).stdout).task;
}

async function competingClaim(projectRoot, ticketId, role, workers) {
  const outcomes = await Promise.all(workers.map((worker) => claimAsync(projectRoot, ticketId, role, worker)));
  const winnerIndexes = outcomes.flatMap((outcome, index) => outcome.status === 0 ? [index] : []);
  assert.equal(winnerIndexes.length, 1, JSON.stringify(outcomes));
  for (const outcome of outcomes.filter((item) => item.status !== 0)) {
    assert.match(`${outcome.stdout}${outcome.stderr}`, /CLAIM_BUSY|CLAIM_REJECTED/);
  }
  const lockRoot = path.join(projectRoot, "backlog", ".choreography-claims");
  assert.equal(fs.existsSync(lockRoot), false, "claim contention left a candidate or empty lock root");
  return workers[winnerIndexes[0]];
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi backlog choreography "));
try {
  invoke(tempRoot, [
    "init", "Choreography probe", "--defaults", "--integration-mode", "none", "--no-git",
    "--check-branches", "false", "--include-remote", "false",
    "--bypass-git-hooks", "false", "--auto-open-browser", "false",
  ]);

  const created = invoke(tempRoot, [
    "task", "create", "Manual choreography",
    "--labels", "choreography:developer-ready",
    "--ac", "Independent review passes",
    "--plain",
  ]);
  const ticketId = taskIdFromCreate(created);
  const eligible = JSON.parse(invoke(tempRoot, [
    "task", "list", "--ready", "--unassigned", "--labels", "choreography:developer-ready", "--json",
  ]).stdout).tasks;
  assert.deepEqual(eligible.map((task) => task.id), [ticketId], "workers must pull from the eligible role queue");

  const developer = await competingClaim(tempRoot, ticketId, "developer", ["@developer-a", "@developer-b"]);
  let task = view(tempRoot, ticketId);
  assert.deepEqual({ status: task.status, assignees: task.assignees, labels: task.labels }, {
    status: "In Progress",
    assignees: [developer],
    labels: ["choreography:developer-active"],
  });

  const duplicateClaim = claim(tempRoot, ticketId, "developer", developer);
  assert.equal(duplicateClaim.status, 0, duplicateClaim.stderr);
  assert.match(duplicateClaim.stdout, /^ALREADY_CLAIMED /);

  invoke(tempRoot, [
    "task", "edit", ticketId,
    "--assignee", "",
    "--label", "choreography:reviewer-ready",
    "--append-notes", "Developer verification complete.",
    "--plain",
  ]);
  const reviewer = await competingClaim(tempRoot, ticketId, "reviewer", ["@reviewer-a", "@reviewer-b"]);
  task = view(tempRoot, ticketId);
  assert.deepEqual({ status: task.status, assignees: task.assignees, labels: task.labels }, {
    status: "In Progress",
    assignees: [reviewer],
    labels: ["choreography:reviewer-active"],
  });

  invoke(tempRoot, [
    "task", "edit", ticketId,
    "--assignee", "",
    "--clear-labels",
    "--check-ac", "1",
    "--status", "Done",
    "--final-summary", "Independent choreography probe passed.",
    "--plain",
  ]);
  task = view(tempRoot, ticketId);
  assert.deepEqual({ status: task.status, assignees: task.assignees, labels: task.labels }, {
    status: "Done",
    assignees: [],
    labels: [],
  });

  for (const inheritedRole of ["toString", "__proto__"]) {
    const invalid = claim(tempRoot, ticketId, inheritedRole, "@invalid-role");
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /role must be developer or reviewer/);
  }

  const contradictoryId = taskIdFromCreate(invoke(tempRoot, [
    "task", "create", "Contradictory labels",
    "--labels", "choreography:developer-ready,choreography:reviewer-ready",
    "--plain",
  ]));
  const contradictory = claim(tempRoot, contradictoryId, "developer", "@developer-c");
  assert.equal(contradictory.status, 4);
  assert.match(contradictory.stderr, /CLAIM_REJECTED/);
  const unchanged = view(tempRoot, contradictoryId);
  assert.deepEqual(unchanged.assignees, []);
  assert.deepEqual(unchanged.labels.sort(), ["choreography:developer-ready", "choreography:reviewer-ready"]);

  console.log("PASS: pull selection, competing claims, strict state validation, handoff, and terminal policy");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
