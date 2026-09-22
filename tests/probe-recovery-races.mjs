import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [repoRoot, backlogBin] = process.argv.slice(2);
assert.ok(repoRoot && backlogBin);
const claimScript = path.join(repoRoot, "scripts", "claim-ticket.mjs");
const recoverScript = path.join(repoRoot, "scripts", "recover-ticket.mjs");
const children = new Set();

function invoke(projectRoot, args) {
  const result = spawnSync(backlogBin, args, {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_CWD: projectRoot },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}${result.stderr}`);
  return result;
}

function run(script, projectRoot, args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, projectRoot, ...args], {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_BIN: backlogBin, ...extraEnv },
    encoding: "utf8",
  });
}

function spawnScript(script, projectRoot, args, extraEnv) {
  const child = spawn(process.execPath, [script, projectRoot, ...args], {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_BIN: backlogBin, ...extraEnv },
  });
  children.add(child);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => {
      children.delete(child);
      resolve({ status, stdout, stderr });
    });
  });
  return { child, done };
}

async function waitForMarkers(dir, stage, count) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const matches = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.startsWith(`${stage}.`)) : [];
    if (matches.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${count} ${stage} barrier markers`);
}

function release(dir, stage) {
  fs.writeFileSync(path.join(dir, `release-${stage}`), "release\n");
}

function create(projectRoot, title, role) {
  const result = invoke(projectRoot, [
    "task", "create", title, "--labels", `choreography:${role}-ready`,
    ...(role === "reviewer" ? ["--status", "In Progress"] : []), "--plain",
  ]);
  return result.stdout.match(/Task (TASK-\d+) -/)[1];
}

function view(projectRoot, ticketId) {
  return JSON.parse(invoke(projectRoot, ["task", "view", ticketId, "--json"]).stdout).task;
}

function recoveryArgs(ticketId, role, workerId) {
  return [ticketId, role, workerId, "--owner-authorized-by", "owner"];
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi backlog recovery races "));
try {
  invoke(tempRoot, [
    "init", "Recovery race probe", "--defaults", "--integration-mode", "none", "--no-git",
    "--check-branches", "false", "--include-remote", "false",
    "--bypass-git-hooks", "false", "--auto-open-browser", "false",
  ]);

  const staleTicket = create(tempRoot, "Stale-lock takeover", "reviewer");
  const crashed = run(claimScript, tempRoot, [staleTicket, "reviewer", "@dead-reviewer"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-edit",
  });
  assert.equal(crashed.signal, "SIGKILL");
  const staleBarriers = path.join(tempRoot, "stale-barriers");
  fs.mkdirSync(staleBarriers);
  const winner = spawnScript(
    recoverScript,
    tempRoot,
    recoveryArgs(staleTicket, "reviewer", "@dead-reviewer"),
    { PI_BACKLOG_RECOVERY_TEST_BARRIER_DIR: staleBarriers, PI_BACKLOG_RECOVERY_TEST_BARRIERS: "after-takeover,after-edit,before-release" },
  );
  await waitForMarkers(staleBarriers, "after-takeover", 1);

  const competingRecovery = run(recoverScript, tempRoot, recoveryArgs(staleTicket, "reviewer", "@dead-reviewer"));
  assert.equal(competingRecovery.status, 4, `${competingRecovery.stdout}${competingRecovery.stderr}`);
  const competingClaim = run(claimScript, tempRoot, [staleTicket, "reviewer", "@new-reviewer"]);
  assert.equal(competingClaim.status, 3, `${competingClaim.stdout}${competingClaim.stderr}`);
  assert.equal(view(tempRoot, staleTicket).implementationNotes, null, "losing recovery mutated before takeover release");

  release(staleBarriers, "after-takeover");
  await waitForMarkers(staleBarriers, "after-edit", 1);
  const edited = view(tempRoot, staleTicket);
  assert.equal((edited.implementationNotes.match(/Owner-authorized recovery/g) ?? []).length, 1);
  assert.equal(run(claimScript, tempRoot, [staleTicket, "reviewer", "@new-reviewer"]).status, 3);

  release(staleBarriers, "after-edit");
  await waitForMarkers(staleBarriers, "before-release", 1);
  assert.equal(run(claimScript, tempRoot, [staleTicket, "reviewer", "@new-reviewer"]).status, 3);
  release(staleBarriers, "before-release");
  const winnerResult = await winner.done;
  assert.equal(winnerResult.status, 0, `${winnerResult.stdout}${winnerResult.stderr}`);

  const activeTicket = create(tempRoot, "Recovery contention", "developer");
  assert.equal(run(claimScript, tempRoot, [activeTicket, "developer", "@dead-developer"]).status, 0);
  const contentionBarriers = path.join(tempRoot, "contention-barriers");
  fs.mkdirSync(contentionBarriers);
  const recoveryEnv = {
    PI_BACKLOG_RECOVERY_TEST_BARRIER_DIR: contentionBarriers,
    PI_BACKLOG_RECOVERY_TEST_BARRIERS: "before-takeover,after-takeover",
  };
  const first = spawnScript(recoverScript, tempRoot, recoveryArgs(activeTicket, "developer", "@dead-developer"), recoveryEnv);
  const second = spawnScript(recoverScript, tempRoot, recoveryArgs(activeTicket, "developer", "@dead-developer"), recoveryEnv);
  await waitForMarkers(contentionBarriers, "before-takeover", 2);
  release(contentionBarriers, "before-takeover");
  await waitForMarkers(contentionBarriers, "after-takeover", 1);
  const loserResult = await Promise.race([first.done, second.done]);
  assert.equal(loserResult.status, 4, `${loserResult.stdout}${loserResult.stderr}`);
  release(contentionBarriers, "after-takeover");
  const outcomes = await Promise.all([first.done, second.done]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [0, 4]);
  const finalTask = view(tempRoot, activeTicket);
  assert.equal((finalTask.implementationNotes.match(/Owner-authorized recovery/g) ?? []).length, 1);

  const claimWinsTicket = create(tempRoot, "New claim wins recovery race", "developer");
  const staleBeforeClaim = run(claimScript, tempRoot, [claimWinsTicket, "developer", "@dead-before-claim"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-lock",
  });
  assert.equal(staleBeforeClaim.signal, "SIGKILL");
  const recoveryLosesBarriers = path.join(tempRoot, "recovery-loses-barriers");
  const claimWinsBarriers = path.join(tempRoot, "claim-wins-barriers");
  fs.mkdirSync(recoveryLosesBarriers);
  fs.mkdirSync(claimWinsBarriers);
  const losingRecovery = spawnScript(
    recoverScript,
    tempRoot,
    recoveryArgs(claimWinsTicket, "developer", "@dead-before-claim"),
    { PI_BACKLOG_RECOVERY_TEST_BARRIER_DIR: recoveryLosesBarriers, PI_BACKLOG_RECOVERY_TEST_BARRIERS: "before-takeover" },
  );
  await waitForMarkers(recoveryLosesBarriers, "before-takeover", 1);
  const winningClaim = spawnScript(
    claimScript,
    tempRoot,
    [claimWinsTicket, "developer", "@new-developer"],
    { PI_BACKLOG_CLAIM_TEST_BARRIER_DIR: claimWinsBarriers, PI_BACKLOG_CLAIM_TEST_BARRIERS: "after-lock" },
  );
  await waitForMarkers(claimWinsBarriers, "after-lock", 1);
  release(recoveryLosesBarriers, "before-takeover");
  const losingRecoveryResult = await losingRecovery.done;
  assert.equal(losingRecoveryResult.status, 4, `${losingRecoveryResult.stdout}${losingRecoveryResult.stderr}`);
  const liveLockPath = path.join(tempRoot, "backlog", ".choreography-claims", `${claimWinsTicket}.lock`);
  assert.equal(JSON.parse(fs.readFileSync(liveLockPath, "utf8")).workerId, "@new-developer");
  assert.equal(view(tempRoot, claimWinsTicket).implementationNotes, null);
  release(claimWinsBarriers, "after-lock");
  const winningClaimResult = await winningClaim.done;
  assert.equal(winningClaimResult.status, 0, `${winningClaimResult.stdout}${winningClaimResult.stderr}`);
  assert.deepEqual(view(tempRoot, claimWinsTicket).assignees, ["@new-developer"]);

  const claimRoot = path.join(tempRoot, "backlog", ".choreography-claims");
  assert.equal(fs.existsSync(claimRoot), false, "claim root or candidate residue remained after races");
  console.log("PASS: exclusive recovery takeover and recovery/claim race barriers");
} finally {
  for (const child of children) child.kill("SIGKILL");
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
