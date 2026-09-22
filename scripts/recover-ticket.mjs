#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  getRoleState,
  isActiveOwner,
  isReadyForRole,
  isValidClaimOwnerRecord,
  labelsForState,
} from "../lib/claim-state.mjs";
import { acquireExclusiveLock, removeExclusiveLock } from "../lib/exclusive-lock.mjs";

const [projectRoot, ticketId, role, workerId, authorizationFlag, authorizedBy] = process.argv.slice(2);

function processStart(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
  } catch {
    return null;
  }
}

function invoke(backlogBin, args) {
  const result = spawnSync(backlogBin, args, {
    cwd: projectRoot,
    env: { ...process.env, BACKLOG_CWD: projectRoot },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`backlog ${args.join(" ")} failed (${result.status})\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

function waitAtBarrier(stage) {
  const directory = process.env.PI_BACKLOG_RECOVERY_TEST_BARRIER_DIR;
  const stages = new Set((process.env.PI_BACKLOG_RECOVERY_TEST_BARRIERS ?? "").split(",").filter(Boolean));
  if (!directory || !stages.has(stage)) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${stage}.${process.pid}`), "waiting\n", { flag: "wx" });
  const releasePath = path.join(directory, `release-${stage}`);
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(releasePath)) {
    if (Date.now() >= deadline) throw new Error(`timed out at recovery test barrier ${stage}`);
    Atomics.wait(sleeper, 0, 0, 10);
  }
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
  if (authorizationFlag !== "--owner-authorized-by" || !authorizedBy) {
    console.error("manual recovery requires --owner-authorized-by <owner-id>");
    return 2;
  }

  const backlogBin = process.env.BACKLOG_BIN || "backlog";
  const initialTask = JSON.parse(invoke(backlogBin, ["task", "view", ticketId, "--json"])).task;
  const initiallyActive = isActiveOwner(initialTask, roleState, workerId);
  const initiallyReady = isReadyForRole(initialTask, roleState);
  if (!initiallyActive && !initiallyReady) {
    console.error(`RECOVERY_REJECTED ticket state does not match ${role} owner ${workerId}`);
    return 4;
  }

  const lockRoot = path.join(projectRoot, "backlog", ".choreography-claims");
  const lockPath = path.join(lockRoot, `${ticketId}.lock`);
  const staleLockExists = fs.existsSync(lockPath);
  let quarantinePath = null;
  if (staleLockExists) {
    let lockOwner;
    try {
      lockOwner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch {
      console.error("RECOVERY_REJECTED claim lock has no valid owner record");
      return 4;
    }
    if (!isValidClaimOwnerRecord(lockOwner, { ticketId, role, workerId, hostname: os.hostname() })) {
      console.error("RECOVERY_REJECTED claim lock has no valid owner record");
      return 4;
    }
    const liveStart = processStart(lockOwner.pid);
    if (liveStart !== null) {
      const reason = liveStart === lockOwner.processStart ? "is still live" : "identity does not match the live process";
      console.error(`RECOVERY_REJECTED claim owner process ${reason}`);
      return 4;
    }

    const quarantineRoot = path.join(projectRoot, "backlog", ".choreography-quarantine");
    fs.mkdirSync(quarantineRoot, { recursive: true });
    quarantinePath = path.join(quarantineRoot, `${ticketId}.${randomUUID()}.lock`);
    try {
      fs.renameSync(lockPath, quarantinePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        console.error("RECOVERY_REJECTED stale lock was already taken over");
        return 4;
      }
      throw error;
    }
  } else if (initiallyReady) {
    console.error("RECOVERY_REJECTED ready ticket has no stale claim lock");
    return 4;
  }

  waitAtBarrier("before-takeover");
  const recoveryRecord = {
    schemaVersion: 1,
    kind: "owner-authorized-recovery",
    ticketId,
    role,
    workerId,
    pid: process.pid,
    processStart: processStart(process.pid),
    hostname: os.hostname(),
    authorizedBy,
    createdAt: new Date().toISOString(),
  };
  const acquired = acquireExclusiveLock(lockPath, recoveryRecord, () => {});
  if (!acquired) {
    console.error("RECOVERY_REJECTED claim state changed during recovery");
    return 4;
  }

  let mutationStarted = false;
  let completed = false;
  try {
    waitAtBarrier("after-takeover");
    if (process.env.PI_BACKLOG_RECOVERY_TEST_FAIL === "after-takeover") {
      throw new Error("injected recovery failure after takeover");
    }
    const currentTask = JSON.parse(invoke(backlogBin, ["task", "view", ticketId, "--json"])).task;
    const activeState = isActiveOwner(currentTask, roleState, workerId);
    const readyState = isReadyForRole(currentTask, roleState);
    if (!activeState && !(staleLockExists && readyState)) {
      console.error("RECOVERY_REJECTED ticket state changed during recovery");
      return 4;
    }

    if (activeState) {
      mutationStarted = true;
      const editArgs = [
        "task", "edit", ticketId,
        "--status", "In Progress",
        "--assignee", "",
        "--append-notes", `Owner-authorized recovery by ${authorizedBy}: returned stale ${role} owner ${workerId} to its ready queue.`,
      ];
      for (const label of labelsForState(currentTask, roleState.readyLabel)) editArgs.push("--label", label);
      editArgs.push("--plain");
      invoke(backlogBin, editArgs);
    }

    waitAtBarrier("after-edit");
    const verified = JSON.parse(invoke(backlogBin, ["task", "view", ticketId, "--json"])).task;
    if (!isReadyForRole(verified, roleState) || (activeState && verified.status !== "In Progress")) {
      throw new Error(`recovery verification failed for ${ticketId}`);
    }

    if (quarantinePath) {
      fs.writeFileSync(`${quarantinePath}.recovery.json`, `${JSON.stringify({
        schemaVersion: 1,
        authorizedBy,
        recoveredAt: new Date().toISOString(),
      }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    }
    waitAtBarrier("before-release");
    completed = true;
    console.log(`RECOVERED ${ticketId} ${role} ${workerId}${quarantinePath ? ` ${quarantinePath}` : ""}`);
    return 0;
  } finally {
    let restoredStaleEvidence = false;
    if (quarantinePath && !completed && !mutationStarted && fs.existsSync(quarantinePath)) {
      fs.renameSync(quarantinePath, lockPath);
      restoredStaleEvidence = true;
    }
    if (!restoredStaleEvidence) removeExclusiveLock(lockPath);
  }
}

process.exitCode = main();
