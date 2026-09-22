import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [repoRoot, backlogBin, requestedRoot, expectedFsType] = process.argv.slice(2);
assert.ok(repoRoot && backlogBin);
const fixtureParent = path.resolve(requestedRoot ?? os.tmpdir());
const statResult = spawnSync("stat", ["-f", "-c", "%T", fixtureParent], { encoding: "utf8" });
assert.equal(statResult.status, 0, statResult.stderr);
const filesystemType = statResult.stdout.trim();
const statfs = fs.statfsSync(fixtureParent);
if (expectedFsType) assert.equal(filesystemType, expectedFsType, "fixture root is not on the required filesystem");
if (expectedFsType === "fuseblk") assert.equal(statfs.type, 0x65735546, "statfs does not report Linux FUSE magic");

const claimScript = path.join(repoRoot, "scripts", "claim-ticket.mjs");
const recoverScript = path.join(repoRoot, "scripts", "recover-ticket.mjs");
const fixture = fs.mkdtempSync(path.join(fixtureParent, ".pi-backlog-filesystem-e2e-"));
const children = new Set();

function run(bin, args, extraEnv = {}) {
  return spawnSync(bin, args, {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_CWD: fixture, BACKLOG_BIN: backlogBin, ...extraEnv },
    encoding: "utf8",
  });
}

function spawnScript(script, args, extraEnv) {
  const child = spawn(process.execPath, [script, fixture, ...args], {
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

async function waitForMarker(directory, stage, pid) {
  const marker = path.join(directory, `${stage}.${pid}`);
  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(marker)) {
    if (Date.now() >= deadline) assert.fail(`timed out waiting for ${stage} barrier`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function create(title, role) {
  const result = run(backlogBin, [
    "task", "create", title, "--labels", `choreography:${role}-ready`,
    ...(role === "reviewer" ? ["--status", "In Progress"] : []), "--plain",
  ]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.match(/Task (TASK-\d+) -/)[1];
}

try {
  const initialized = run(backlogBin, [
    "init", "Filesystem choreography probe", "--defaults", "--integration-mode", "none", "--no-git",
    "--check-branches", "false", "--include-remote", "false",
    "--bypass-git-hooks", "false", "--auto-open-browser", "false",
  ]);
  assert.equal(initialized.status, 0, initialized.stderr);

  const claimTicket = create("Filesystem claim", "developer");
  const barrierRoot = path.join(fixture, "claim-barriers");
  fs.mkdirSync(barrierRoot);
  const winner = spawnScript(claimScript, [claimTicket, "developer", "@winner"], {
    PI_BACKLOG_CLAIM_TEST_BARRIER_DIR: barrierRoot,
    PI_BACKLOG_CLAIM_TEST_BARRIERS: "after-lock",
  });
  await waitForMarker(barrierRoot, "after-lock", winner.child.pid);
  const loser = run(process.execPath, [claimScript, fixture, claimTicket, "developer", "@loser"]);
  assert.equal(loser.status, 3, `${loser.stdout}${loser.stderr}`);
  assert.match(loser.stderr, /CLAIM_BUSY/);
  assert.doesNotMatch(`${loser.stdout}${loser.stderr}`, /EPERM/);
  fs.writeFileSync(path.join(barrierRoot, "release-after-lock"), "release\n");
  const winnerResult = await winner.done;
  assert.equal(winnerResult.status, 0, `${winnerResult.stdout}${winnerResult.stderr}`);

  const recoveryTicket = create("Filesystem recovery", "reviewer");
  const crashed = run(process.execPath, [claimScript, fixture, recoveryTicket, "reviewer", "@dead-reviewer"], {
    PI_BACKLOG_CLAIM_TEST_CRASH: "after-edit",
  });
  assert.equal(crashed.signal, "SIGKILL");
  const recovered = run(process.execPath, [
    recoverScript, fixture, recoveryTicket, "reviewer", "@dead-reviewer",
    "--owner-authorized-by", "filesystem-probe",
  ]);
  assert.equal(recovered.status, 0, `${recovered.stdout}${recovered.stderr}`);
  assert.doesNotMatch(`${recovered.stdout}${recovered.stderr}`, /EPERM/);

  const claimRoot = path.join(fixture, "backlog", ".choreography-claims");
  assert.equal(fs.existsSync(claimRoot), false, "temporary claim state remained");
  console.log(JSON.stringify({
    result: "PASS",
    fixtureParent,
    filesystemType,
    statfsType: `0x${statfs.type.toString(16)}`,
    claimWinner: "@winner",
    contender: "CLAIM_BUSY",
    recovery: "RECOVERED",
    eperm: false,
  }));
} finally {
  for (const child of children) child.kill("SIGKILL");
  fs.rmSync(fixture, { recursive: true, force: true });
}
