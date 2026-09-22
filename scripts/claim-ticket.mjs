#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getRoleState, isActiveOwner, isClaimable, labelsForState } from "../lib/claim-state.mjs";
import { acquireExclusiveLock, removeExclusiveLock } from "../lib/exclusive-lock.mjs";

const [projectRoot, ticketId, role, workerId] = process.argv.slice(2);

function processStart(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
  } catch {
    return null;
  }
}

function waitAtBarrier(stage) {
  const directory = process.env.PI_BACKLOG_CLAIM_TEST_BARRIER_DIR;
  const stages = new Set((process.env.PI_BACKLOG_CLAIM_TEST_BARRIERS ?? "").split(",").filter(Boolean));
  if (!directory || !stages.has(stage)) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${stage}.${process.pid}`), "waiting\n", { flag: "wx" });
  const releasePath = path.join(directory, `release-${stage}`);
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(releasePath)) {
    if (Date.now() >= deadline) throw new Error(`timed out at claim test barrier ${stage}`);
    Atomics.wait(sleeper, 0, 0, 10);
  }
}

function invoke(backlogBin, args) {
  const result = spawnSync(backlogBin, args, {
    cwd: projectRoot,
    env: { ...process.env, BACKLOG_CWD: projectRoot },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`backlog ${args.join(" ")} failed (${result.status})\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function main() {
  const roleState = getRoleState(role);
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    console.error("project must be an absolute path");
    return 2;
  }
  if (!/^TASK-\d+$/.test(ticketId ?? "")) {
    console.error("ticket must match TASK-<number>");
    return 2;
  }
  if (!roleState) {
    console.error("role must be developer or reviewer");
    return 2;
  }
  if (!/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(workerId ?? "")) {
    console.error("worker must be an @-prefixed identifier");
    return 2;
  }

  const backlogBin = process.env.BACKLOG_BIN || "backlog";
  const configPaths = [
    path.join(projectRoot, "backlog.config.yml"),
    path.join(projectRoot, "backlog", "config.yml"),
    path.join(projectRoot, ".backlog", "config.yml"),
  ];
  if (!fs.existsSync(projectRoot) || !configPaths.some((candidate) => fs.existsSync(candidate))) {
    console.error(`Backlog.md project not initialized: ${projectRoot}`);
    return 3;
  }

  const lockPath = path.join(projectRoot, "backlog", ".choreography-claims", `${ticketId}.lock`);
  const ownerRecord = {
    schemaVersion: 1,
    ticketId,
    role,
    workerId,
    pid: process.pid,
    processStart: processStart(process.pid),
    hostname: os.hostname(),
    createdAt: new Date().toISOString(),
  };
  const acquired = acquireExclusiveLock(lockPath, ownerRecord, () => {
    if (process.env.PI_BACKLOG_CLAIM_TEST_CRASH === "after-create-before-owner") {
      process.kill(process.pid, "SIGKILL");
    }
  });
  if (!acquired) {
    console.error(`CLAIM_BUSY ${ticketId}`);
    return 3;
  }

  try {
    waitAtBarrier("after-lock");
    if (process.env.PI_BACKLOG_CLAIM_TEST_CRASH === "after-lock") process.kill(process.pid, "SIGKILL");

    const task = JSON.parse(invoke(backlogBin, ["task", "view", ticketId, "--json"])).task;
    if (isActiveOwner(task, roleState, workerId)) {
      console.log(`ALREADY_CLAIMED ${ticketId} ${workerId}`);
      return 0;
    }
    if (!isClaimable(task, roleState)) {
      console.error(`CLAIM_REJECTED ${ticketId}`);
      return 4;
    }

    const editArgs = ["task", "edit", ticketId, "--status", "In Progress", "--assignee", workerId];
    for (const label of labelsForState(task, roleState.activeLabel)) editArgs.push("--label", label);
    editArgs.push("--plain");
    invoke(backlogBin, editArgs);

    if (process.env.PI_BACKLOG_CLAIM_TEST_CRASH === "after-edit") process.kill(process.pid, "SIGKILL");

    const verified = JSON.parse(invoke(backlogBin, ["task", "view", ticketId, "--json"])).task;
    if (!isActiveOwner(verified, roleState, workerId)) {
      throw new Error(`claim verification failed for ${ticketId}`);
    }
    console.log(`CLAIMED ${ticketId} ${workerId}`);
    return 0;
  } finally {
    removeExclusiveLock(lockPath);
  }
}

process.exitCode = main();
