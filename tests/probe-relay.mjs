import assert from "node:assert/strict";
import {
  acknowledgeInspection,
  createRelayState,
  markWorkerStale,
  parseInspectionAcknowledgement,
  parseRegistration,
  reconcileEvent,
  registerWorker,
  transitionIdentity,
} from "../lib/relay-state.mjs";

const state = createRelayState();
assert.throws(() => parseRegistration("WORKER_READY worker-1 intercom"), /developer\|reviewer/);
assert.deepEqual(parseRegistration("WORKER_READY developer dev-1 intercom"), {
  role: "developer",
  workerId: "dev-1",
  transport: "intercom",
});
assert.throws(() => parseInspectionAcknowledgement("WORKER_QUEUE_ACK dev-1 transition"), /developer\|reviewer/);
registerWorker(state, "WORKER_READY developer dev-1 intercom", 10);
registerWorker(state, "WORKER_READY developer dev-2 intercom", 10);
registerWorker(state, "WORKER_READY reviewer rev-1 intercom", 10);

const developerEvent = {
  sequence: 7,
  logicalId: transitionIdentity({ projectId: "project-a", ticketId: "TASK-1", role: "developer", revision: "r1" }),
  ticketId: "TASK-1",
  role: "developer",
};
const sends = [];
let failDev2 = true;
const send = async (request) => {
  sends.push(request);
  if (request.target === "dev-2" && failDev2) return { delivered: false, reason: "offline" };
  return { delivered: true };
};

await reconcileEvent(state, developerEvent, {
  ticketStillReady: true,
  now: 1_000,
  baseRetryMs: 100,
  maxRetryMs: 500,
  maxSendsPerRun: 2,
  send,
});
assert.deepEqual(sends.map((item) => item.target), ["dev-1", "dev-2"]);
assert.ok(sends.every((item) => item.role === "developer"));
assert.equal(state.events[developerEvent.logicalId].deliveries["dev-1"].transportDelivered, true);
assert.equal(state.events[developerEvent.logicalId].deliveries["dev-1"].inspectionAcknowledged, false);
assert.equal(state.events[developerEvent.logicalId].deliveries["dev-2"].transportDelivered, false);

// Restart from durable JSON, replay the same event, and retry under the same logical delivery identity.
const restarted = JSON.parse(JSON.stringify(state));
failDev2 = false;
await reconcileEvent(restarted, developerEvent, {
  ticketStillReady: true,
  now: 1_100,
  baseRetryMs: 100,
  maxRetryMs: 500,
  maxSendsPerRun: 2,
  send,
});
assert.equal(restarted.cursors.developer, 7);
const dev1Sends = sends.filter((item) => item.target === "dev-1");
const dev2Sends = sends.filter((item) => item.target === "dev-2");
assert.equal(dev1Sends.length, 2, "transport success without processing acknowledgement must retry");
assert.equal(dev2Sends.length, 2, "failed transport must retry");
assert.equal(new Set(dev1Sends.map((item) => item.deliveryKey)).size, 1);
assert.equal(new Set(dev2Sends.map((item) => item.deliveryKey)).size, 1);
assert.deepEqual(dev1Sends.map((item) => item.generation), [1, 2]);

const acknowledgement = parseInspectionAcknowledgement(
  `WORKER_QUEUE_ACK developer dev-1 ${developerEvent.logicalId}`,
);
acknowledgeInspection(restarted, {
  ...acknowledgement,
  ticketId: "TASK-1",
  now: 1_101,
});
await reconcileEvent(restarted, developerEvent, {
  ticketStillReady: true,
  now: 1_300,
  baseRetryMs: 100,
  maxRetryMs: 500,
  maxSendsPerRun: 1,
  send,
});
assert.equal(sends.filter((item) => item.target === "dev-1").length, 2, "acknowledged delivery must stop retrying");
assert.equal(sends.filter((item) => item.target === "dev-2").length, 3);

markWorkerStale(restarted, "dev-2");
await reconcileEvent(restarted, developerEvent, {
  ticketStillReady: true,
  now: 2_000,
  send,
});
assert.equal(sends.filter((item) => item.target === "dev-2").length, 3, "stale workers must not receive fan-out");

const reviewerEvent = {
  sequence: 3,
  logicalId: transitionIdentity({ projectId: "project-a", ticketId: "TASK-1", role: "reviewer", revision: "r2" }),
  ticketId: "TASK-1",
  role: "reviewer",
};
await reconcileEvent(restarted, reviewerEvent, {
  ticketStillReady: true,
  now: 2_000,
  send,
});
assert.equal(sends.at(-1).target, "rev-1", "reviewer event must fan out only to reviewer registrations");
assert.equal(restarted.cursors.reviewer, 3);

const beforeResolution = sends.length;
await reconcileEvent(restarted, reviewerEvent, {
  ticketStillReady: false,
  now: 3_000,
  send,
});
assert.equal(sends.length, beforeResolution, "durable ticket transition must stop retries");
assert.equal(restarted.events[reviewerEvent.logicalId].resolved, true);

const replayed = createRelayState();
registerWorker(replayed, "WORKER_READY developer replay-worker intercom", 1);
const replayEvent = {
  sequence: 1,
  logicalId: transitionIdentity({ projectId: "project-replay", ticketId: "TASK-3", role: "developer", revision: "r1" }),
  ticketId: "TASK-3",
  role: "developer",
};
await reconcileEvent(replayed, replayEvent, {
  ticketStillReady: true,
  now: 1,
  send: async () => ({ delivered: true }),
});
const deliveryBeforeReplay = structuredClone(replayed.events[replayEvent.logicalId].deliveries);
await reconcileEvent(replayed, { ...replayEvent, sequence: 2 }, {
  ticketStillReady: true,
  now: 2,
  send: async () => ({ delivered: true }),
});
assert.equal(replayed.cursors.developer, 2);
assert.equal(replayed.events[replayEvent.logicalId].sequence, 1);
assert.equal(replayed.events[replayEvent.logicalId].latestSequence, 2);
assert.deepEqual(replayed.events[replayEvent.logicalId].deliveries, deliveryBeforeReplay);
await assert.rejects(
  reconcileEvent(replayed, { ...replayEvent, sequence: 3, ticketId: "TASK-conflict" }, {
    ticketStillReady: true,
    now: 3,
    send: async () => ({ delivered: true }),
  }),
  /conflicting event identity/,
);
const laterEvent = {
  sequence: 3,
  logicalId: transitionIdentity({ projectId: "project-replay", ticketId: "TASK-4", role: "developer", revision: "r1" }),
  ticketId: "TASK-4",
  role: "developer",
};
await reconcileEvent(replayed, laterEvent, {
  ticketStillReady: false,
  now: 3,
  send: async () => ({ delivered: true }),
});
assert.equal(replayed.cursors.developer, 3);
assert.ok(replayed.events[laterEvent.logicalId]);

const bounded = createRelayState();
registerWorker(bounded, "WORKER_READY developer dev-a intercom", 1);
registerWorker(bounded, "WORKER_READY developer dev-b intercom", 1);
const boundedSends = [];
const boundedEvent = {
  sequence: 1,
  logicalId: transitionIdentity({ projectId: "project-b", ticketId: "TASK-2", role: "developer", revision: "r1" }),
  ticketId: "TASK-2",
  role: "developer",
};
for (let now = 1; now <= 4; now += 1) {
  await reconcileEvent(bounded, boundedEvent, {
    ticketStillReady: true,
    now,
    baseRetryMs: 1,
    maxRetryMs: 1,
    maxSendsPerRun: 1,
    send: async (request) => { boundedSends.push(request); return { delivered: true }; },
  });
}
assert.deepEqual(
  boundedSends.map((request) => request.target),
  ["dev-a", "dev-b", "dev-a", "dev-b"],
  "bounded passes must attempt every recipient before fair retries",
);

console.log("PASS: relay duplicate delivery, bounded failure retry, acknowledgement, cursor restart, and role fan-out");
