import fs from "node:fs";
import path from "node:path";

export function removeEmptyLockRoot(lockPath) {
  try {
    fs.rmdirSync(path.dirname(lockPath));
  } catch (error) {
    if (error?.code !== "ENOTEMPTY" && error?.code !== "ENOENT") throw error;
  }
}

export function acquireExclusiveLock(lockPath, ownerRecord, afterCreate) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      removeEmptyLockRoot(lockPath);
      return false;
    }
    throw error;
  }

  try {
    afterCreate();
    fs.writeFileSync(descriptor, `${JSON.stringify(ownerRecord, null, 2)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return true;
}

export function removeExclusiveLock(lockPath) {
  fs.rmSync(lockPath, { force: true });
  removeEmptyLockRoot(lockPath);
}
