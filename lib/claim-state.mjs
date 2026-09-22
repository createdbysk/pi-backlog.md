export const ROLE_STATES = Object.freeze({
  developer: Object.freeze({
    readyLabel: "choreography:developer-ready",
    activeLabel: "choreography:developer-active",
  }),
  reviewer: Object.freeze({
    readyLabel: "choreography:reviewer-ready",
    activeLabel: "choreography:reviewer-active",
  }),
});

export const CHOREOGRAPHY_LABELS = Object.freeze(
  Object.values(ROLE_STATES).flatMap(({ readyLabel, activeLabel }) => [readyLabel, activeLabel]),
);

export function getRoleState(role) {
  return Object.hasOwn(ROLE_STATES, role) ? ROLE_STATES[role] : null;
}

export function choreographyLabels(labels) {
  return labels.filter((label) => CHOREOGRAPHY_LABELS.includes(label));
}

export function isClaimable(task, roleState) {
  return task.readiness?.isReady === true
    && task.status !== "Done"
    && (task.assignees ?? []).length === 0
    && choreographyLabels(task.labels ?? []).length === 1
    && task.labels.includes(roleState.readyLabel);
}

export function isActiveOwner(task, roleState, workerId) {
  return task.status === "In Progress"
    && (task.assignees ?? []).length === 1
    && task.assignees[0] === workerId
    && choreographyLabels(task.labels ?? []).length === 1
    && task.labels.includes(roleState.activeLabel);
}

export function isReadyForRole(task, roleState) {
  return task.readiness?.isReady === true
    && (task.assignees ?? []).length === 0
    && choreographyLabels(task.labels ?? []).length === 1
    && task.labels.includes(roleState.readyLabel);
}

export function isValidClaimOwnerRecord(value, expected) {
  return value !== null
    && typeof value === "object"
    && value.schemaVersion === 1
    && value.ticketId === expected.ticketId
    && value.role === expected.role
    && value.workerId === expected.workerId
    && value.hostname === expected.hostname
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && typeof value.processStart === "string"
    && value.processStart.length > 0
    && typeof value.createdAt === "string"
    && value.createdAt.length > 0
    && Number.isFinite(Date.parse(value.createdAt));
}

export function labelsForState(task, label) {
  return [...(task.labels ?? []).filter((candidate) => !CHOREOGRAPHY_LABELS.includes(candidate)), label];
}
