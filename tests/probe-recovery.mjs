import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [repoRoot, backlogBin] = process.argv.slice(2);
assert.ok(repoRoot && backlogBin);
const claimScript = path.join(repoRoot, "scripts", "claim-ticket.mjs");
const recoverScript = path.join(repoRoot, "scripts", "recover-ticket.mjs");

function invoke(projectRoot, args, expectedStatus = 0) {
  const result = spawnSync(backlogBin, args, {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_CWD: projectRoot },
    encoding: "utf8",
  });
  assert.equal(result.status, expectedStatus, `${args.join(" ")}\n${result.stdout}${result.stderr}`);
  return result;
}

function runScript(script, projectRoot, args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, projectRoot, ...args], {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_BIN: backlogBin, ...extraEnv },
    encoding: "utf8",
  });
}

function create(projectRoot, title, role) {
  const result = invoke(projectRoot, [
    "task", "create", title,
    "--labels", `choreography:${role}-ready`,
    ...(role === "reviewer" ? ["--status", "In Progress"] : []),
    "--plain",
  ]);
  return result.stdout.match(/Task (TASK-\d+) -/)[1];
}

function view(projectRoot, ticketId) {
  return JSON.parse(invoke(projectRoot, ["task", "view", ticketId, "--json"]).stdout).task;
}

function recover(projectRoot, ticketId, role, workerId) {
  return runScript(recoverScript, projectRoot, [ticketId, role, workerId, "--owner-authorized-by", "owner"]);
}

function currentProcessStart() {
  const stat = fs.readFileSync(`/proc/${process.pid}/stat`, "utf8");
  return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
}

function writeLock(projectRoot, ticketId, record) {
  const lockPath = path.join(projectRoot, "backlog", ".choreography-claims", `${ticketId}.lock`);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(record)}\n`);
  return lockPath;
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi backlog recovery "));
try {
  invoke(tempRoot, [
    "init", "Recovery probe", "--defaults", "--integration-mode", "none", "--no-git",
    "--check-branches", "false", "--include-remote", "false",
    "--bypass-git-hooks", "false", "--auto-open-browser", "false",
  ]);

  const partialOwner = create(tempRoot, "Crash during owner publication", "developer");
  const partialCrash = runScript(claimScript, tempRoot, [partialOwner, "developer", "@partial-owner"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-create-before-owner",
  });
  assert.equal(partialCrash.signal, "SIGKILL");
  const partialLock = path.join(tempRoot, "backlog", ".choreography-claims", `${partialOwner}.lock`);
  assert.equal(fs.readFileSync(partialLock, "utf8"), "");
  const partialBefore = view(tempRoot, partialOwner);
  const partialRecovery = recover(tempRoot, partialOwner, "developer", "@partial-owner");
  assert.equal(partialRecovery.status, 4);
  assert.match(partialRecovery.stderr, /valid owner record/);
  assert.deepEqual(view(tempRoot, partialOwner), partialBefore);
  assert.ok(fs.existsSync(partialLock), "partial owner evidence must remain fail-closed");

  const beforeEdit = create(tempRoot, "Crash before edit", "developer");
  const killedBefore = runScript(claimScript, tempRoot, [beforeEdit, "developer", "@dead-before"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-lock",
  });
  assert.equal(killedBefore.signal, "SIGKILL");
  assert.ok(fs.existsSync(path.join(tempRoot, "backlog", ".choreography-claims", `${beforeEdit}.lock`)));
  const recoveredBefore = recover(tempRoot, beforeEdit, "developer", "@dead-before");
  assert.equal(recoveredBefore.status, 0, recoveredBefore.stderr);
  assert.match(recoveredBefore.stdout, /^RECOVERED /);
  assert.deepEqual(view(tempRoot, beforeEdit).labels, ["choreography:developer-ready"]);
  assert.equal(
    fs.existsSync(path.join(tempRoot, "backlog", ".choreography-claims", `${beforeEdit}.lock`)),
    false,
    "successful recovery restored the stale canonical lock",
  );

  const restoreTicket = create(tempRoot, "Restore on pre-mutation failure", "developer");
  const restoreCrash = runScript(claimScript, tempRoot, [restoreTicket, "developer", "@restore-owner"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-lock",
  });
  assert.equal(restoreCrash.signal, "SIGKILL");
  const restoreLock = path.join(tempRoot, "backlog", ".choreography-claims", `${restoreTicket}.lock`);
  const staleEvidence = fs.readFileSync(restoreLock, "utf8");
  const failedRecovery = runScript(
    recoverScript,
    tempRoot,
    [restoreTicket, "developer", "@restore-owner", "--owner-authorized-by", "owner"],
    { PI_BACKLOG_RECOVERY_TEST_FAIL: "after-takeover" },
  );
  assert.equal(failedRecovery.status, 1, `${failedRecovery.stdout}${failedRecovery.stderr}`);
  assert.equal(fs.readFileSync(restoreLock, "utf8"), staleEvidence);
  assert.deepEqual(view(tempRoot, restoreTicket).labels, ["choreography:developer-ready"]);

  const afterEdit = create(tempRoot, "Crash after edit", "reviewer");
  const killedAfter = runScript(claimScript, tempRoot, [afterEdit, "reviewer", "@dead-after"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-edit",
  });
  assert.equal(killedAfter.signal, "SIGKILL");
  let task = view(tempRoot, afterEdit);
  assert.deepEqual({ status: task.status, assignees: task.assignees, labels: task.labels }, {
    status: "In Progress",
    assignees: ["@dead-after"],
    labels: ["choreography:reviewer-active"],
  });
  const recoveredAfter = recover(tempRoot, afterEdit, "reviewer", "@dead-after");
  assert.equal(recoveredAfter.status, 0, recoveredAfter.stderr);
  task = view(tempRoot, afterEdit);
  assert.deepEqual({ status: task.status, assignees: task.assignees, labels: task.labels }, {
    status: "In Progress",
    assignees: [],
    labels: ["choreography:reviewer-ready"],
  });
  assert.match(task.implementationNotes, /Owner-authorized recovery/);

  const active = create(tempRoot, "Dead active owner", "developer");
  const claimed = runScript(claimScript, tempRoot, [active, "developer", "@dead-active"]);
  assert.equal(claimed.status, 0, claimed.stderr);
  const unauthorized = runScript(recoverScript, tempRoot, [active, "developer", "@dead-active"]);
  assert.equal(unauthorized.status, 2);
  const recoveredActive = recover(tempRoot, active, "developer", "@dead-active");
  assert.equal(recoveredActive.status, 0, recoveredActive.stderr);
  assert.deepEqual(view(tempRoot, active).assignees, []);

  const liveLockTicket = create(tempRoot, "Live lock", "developer");
  const lockPath = path.join(tempRoot, "backlog", ".choreography-claims", `${liveLockTicket}.lock`);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const stat = fs.readFileSync(`/proc/${process.pid}/stat`, "utf8");
  const start = stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
  fs.writeFileSync(lockPath, JSON.stringify({
    schemaVersion: 1,
    ticketId: liveLockTicket,
    role: "developer",
    workerId: "@live-worker",
    pid: process.pid,
    processStart: start,
    hostname: os.hostname(),
    createdAt: new Date().toISOString(),
  }));
  const liveRejected = recover(tempRoot, liveLockTicket, "developer", "@live-worker");
  assert.equal(liveRejected.status, 4);
  assert.match(liveRejected.stderr, /still live/);
  assert.ok(fs.existsSync(lockPath), "live lock must not be removed");

  const validIdentity = {
    schemaVersion: 1,
    ticketId: "",
    role: "developer",
    workerId: "@malformed",
    pid: process.pid,
    processStart: currentProcessStart(),
    hostname: os.hostname(),
    createdAt: new Date().toISOString(),
  };
  const malformedCases = [
    ["schemaVersion missing", { schemaVersion: undefined }],
    ["schemaVersion unsupported", { schemaVersion: 2 }],
    ["ticketId missing", { ticketId: undefined }],
    ["ticketId mismatch", { ticketId: "TASK-999999" }],
    ["role missing", { role: undefined }],
    ["role mismatch", { role: "reviewer" }],
    ["workerId missing", { workerId: undefined }],
    ["workerId mismatch", { workerId: "@other" }],
    ["hostname missing", { hostname: undefined }],
    ["hostname invalid", { hostname: "" }],
    ["pid missing", { pid: undefined }],
    ["pid zero", { pid: 0 }],
    ["pid wrong type", { pid: "1" }],
    ["pid unsafe", { pid: Number.MAX_SAFE_INTEGER + 1 }],
    ["processStart missing", { processStart: undefined }],
    ["processStart empty", { processStart: "" }],
    ["processStart wrong type", { processStart: 1 }],
    ["processStart altered", { processStart: `${currentProcessStart()}-altered` }],
    ["createdAt missing", { createdAt: undefined }],
    ["createdAt invalid", { createdAt: "not-a-date" }],
  ];
  for (const [name, override] of malformedCases) {
    const malformedId = create(tempRoot, `Malformed lock ${name}`, "developer");
    const malformedRecord = { ...validIdentity, ticketId: malformedId, ...override };
    if (override.processStart === undefined) delete malformedRecord.processStart;
    const malformedPath = writeLock(tempRoot, malformedId, malformedRecord);
    const before = view(tempRoot, malformedId);
    const malformed = recover(tempRoot, malformedId, "developer", "@malformed");
    assert.equal(malformed.status, 4, `${name}: ${malformed.stdout}${malformed.stderr}`);
    assert.match(malformed.stderr, /valid owner record|identity does not match/);
    assert.deepEqual(view(tempRoot, malformedId), before, `${name}: ticket changed`);
    assert.ok(fs.existsSync(malformedPath), `${name}: lock changed`);
  }

  const configPath = path.join(tempRoot, "backlog", "config.yml");
  const config = fs.readFileSync(configPath, "utf8");
  fs.writeFileSync(configPath, config.replace(
    'statuses: ["To Do", "In Progress", "Done"]',
    'statuses: ["To Do", "In Progress", "Done", "Closed"]',
  ));
  const terminalId = create(tempRoot, "Configured terminal state", "developer");
  invoke(tempRoot, ["task", "edit", terminalId, "--status", "Closed", "--plain"]);
  const terminalLock = writeLock(tempRoot, terminalId, {
    ...validIdentity,
    ticketId: terminalId,
    pid: 2_147_483_647,
    processStart: "dead-process-token",
  });
  const terminalBefore = view(tempRoot, terminalId);
  assert.equal(terminalBefore.readiness.isReady, false);
  const terminalRecovery = recover(tempRoot, terminalId, "developer", "@malformed");
  assert.equal(terminalRecovery.status, 4, `${terminalRecovery.stdout}${terminalRecovery.stderr}`);
  assert.deepEqual(view(tempRoot, terminalId), terminalBefore, "terminal ticket changed");
  assert.ok(fs.existsSync(terminalLock), "terminal lock changed");

  const quarantineRoot = path.join(tempRoot, "backlog", ".choreography-quarantine");
  assert.ok(fs.readdirSync(quarantineRoot).length >= 2, "stale lock evidence must be quarantined");
  console.log("PASS: owner-authorized stale lock, dead active owner, and claim-process death recovery");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
