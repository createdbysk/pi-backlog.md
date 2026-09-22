import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireExclusiveLock, removeExclusiveLock } from "../lib/exclusive-lock.mjs";

const [requestedRoot] = process.argv.slice(2);
const parentRoot = requestedRoot ? path.resolve(requestedRoot) : os.tmpdir();
const probeRoot = fs.mkdtempSync(path.join(parentRoot, ".pi-backlog-lock-probe-"));
try {
  const lockRoot = path.join(probeRoot, "claims");
  const lockPath = path.join(lockRoot, "TASK-1.lock");
  const ownerRecord = { schemaVersion: 1, owner: "worker" };
  const first = acquireExclusiveLock(lockPath, ownerRecord, () => {});
  const second = acquireExclusiveLock(lockPath, { schemaVersion: 1, owner: "other" }, () => {});
  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(lockPath, "utf8")), ownerRecord);
  assert.deepEqual(fs.readdirSync(lockRoot), ["TASK-1.lock"]);
  removeExclusiveLock(lockPath);
  assert.equal(fs.existsSync(lockRoot), false);
  console.log(`PASS: portable exclusive lock on ${parentRoot}`);
} finally {
  fs.rmSync(probeRoot, { recursive: true, force: true });
}
