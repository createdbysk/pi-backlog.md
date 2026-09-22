const VALID_ROLES = new Set(["developer", "reviewer"]);
const REGISTRATION = /^WORKER_READY (developer|reviewer) ([A-Za-z0-9][A-Za-z0-9._-]*) intercom$/;
const INSPECTION_ACK = /^WORKER_QUEUE_ACK (developer|reviewer) ([A-Za-z0-9][A-Za-z0-9._-]*) (\S+)$/;

function assertRole(role) {
  if (!VALID_ROLES.has(role)) throw new Error(`invalid role: ${role}`);
}

function deliveryKey(logicalId, workerId) {
  return `${logicalId}:${workerId}`;
}

export function createRelayState() {
  return {
    schemaVersion: 1,
    cursors: { developer: 0, reviewer: 0 },
    registrations: {},
    events: {},
  };
}

export function parseRegistration(message) {
  const match = REGISTRATION.exec(message);
  if (!match) throw new Error("registration must match WORKER_READY <developer|reviewer> <worker-id> intercom");
  return { role: match[1], workerId: match[2], transport: "intercom" };
}

export function parseInspectionAcknowledgement(message) {
  const match = INSPECTION_ACK.exec(message);
  if (!match) throw new Error("acknowledgement must match WORKER_QUEUE_ACK <developer|reviewer> <worker-id> <transition-id>");
  return { role: match[1], workerId: match[2], logicalId: match[3] };
}

export function registerWorker(state, message, now) {
  const registration = parseRegistration(message);
  state.registrations[registration.workerId] = {
    ...registration,
    target: registration.workerId,
    registeredAt: now,
    health: "healthy",
    lastSuccessfulDeliveryAt: null,
  };
  return state.registrations[registration.workerId];
}

export function markWorkerStale(state, workerId) {
  const registration = state.registrations[workerId];
  if (!registration) throw new Error(`unknown worker: ${workerId}`);
  registration.health = "stale";
}

export function transitionIdentity({ projectId, ticketId, role, revision }) {
  assertRole(role);
  if (!projectId || !ticketId || !revision) throw new Error("projectId, ticketId, and revision are required");
  return `${projectId}:${ticketId}:${role}:${revision}`;
}

function acceptEvent(state, event) {
  assertRole(event.role);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) throw new Error("event sequence must be positive");
  if (!event.logicalId || !event.ticketId) throw new Error("logicalId and ticketId are required");

  const existing = state.events[event.logicalId];
  if (existing) {
    if (existing.role !== event.role || existing.ticketId !== event.ticketId) {
      throw new Error(`conflicting event identity: ${event.logicalId}`);
    }
    existing.latestSequence = Math.max(existing.latestSequence ?? existing.sequence, event.sequence);
    state.cursors[event.role] = Math.max(state.cursors[event.role], event.sequence);
    return existing;
  }
  if (event.sequence <= state.cursors[event.role]) {
    throw new Error(`event ${event.sequence} is behind the ${event.role} cursor`);
  }

  const accepted = {
    logicalId: event.logicalId,
    sequence: event.sequence,
    latestSequence: event.sequence,
    ticketId: event.ticketId,
    role: event.role,
    resolved: false,
    deliveries: {},
  };
  state.events[event.logicalId] = accepted;
  state.cursors[event.role] = event.sequence;
  return accepted;
}

export async function reconcileEvent(state, event, options) {
  const accepted = acceptEvent(state, event);
  if (!options.ticketStillReady) {
    accepted.resolved = true;
    return { sent: 0, resolved: true };
  }

  const now = options.now;
  const baseRetryMs = options.baseRetryMs ?? 1_000;
  const maxRetryMs = options.maxRetryMs ?? 60_000;
  const maxSendsPerRun = options.maxSendsPerRun ?? 20;
  let sent = 0;

  const candidates = Object.values(state.registrations)
    .filter((registration) => registration.role === accepted.role && registration.health === "healthy")
    .map((registration) => {
      const prior = accepted.deliveries[registration.workerId] ?? {
        deliveryKey: deliveryKey(accepted.logicalId, registration.workerId),
        attempts: 0,
        transportDelivered: false,
        inspectionAcknowledged: false,
        nextAttemptAt: 0,
        lastError: null,
      };
      accepted.deliveries[registration.workerId] = prior;
      return { registration, prior };
    })
    .filter(({ prior }) => !prior.inspectionAcknowledged && now >= prior.nextAttemptAt)
    .sort((left, right) => left.prior.attempts - right.prior.attempts
      || (left.prior.lastAttemptAt ?? -1) - (right.prior.lastAttemptAt ?? -1)
      || left.registration.workerId.localeCompare(right.registration.workerId));

  for (const { registration, prior } of candidates.slice(0, maxSendsPerRun)) {
    const key = prior.deliveryKey;
    const generation = prior.attempts + 1;
    try {
      const outcome = await options.send({
        deliveryKey: key,
        generation,
        logicalId: accepted.logicalId,
        role: accepted.role,
        ticketId: accepted.ticketId,
        target: registration.target,
      });
      prior.transportDelivered = outcome?.delivered === true;
      prior.lastError = outcome?.delivered === true ? null : (outcome?.reason ?? "delivery failed");
      if (outcome?.delivered === true) registration.lastSuccessfulDeliveryAt = now;
    } catch (error) {
      prior.transportDelivered = false;
      prior.lastError = error instanceof Error ? error.message : String(error);
    }
    prior.attempts = generation;
    prior.lastAttemptAt = now;
    prior.nextAttemptAt = now + Math.min(baseRetryMs * (2 ** (generation - 1)), maxRetryMs);
    sent += 1;
  }

  return { sent, resolved: false };
}

export function acknowledgeInspection(state, { logicalId, workerId, ticketId, role, now }) {
  const event = state.events[logicalId];
  if (!event || event.ticketId !== ticketId || event.role !== role) {
    throw new Error("acknowledgement does not match a durable event");
  }
  const registration = state.registrations[workerId];
  if (!registration || registration.role !== role) {
    throw new Error("acknowledgement does not match a registered worker role");
  }
  const delivery = event.deliveries[workerId];
  if (!delivery) throw new Error("acknowledgement has no delivery attempt");
  delivery.inspectionAcknowledged = true;
  delivery.acknowledgedAt = now;
  return delivery;
}
