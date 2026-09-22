---
name: pi-backlog-reviewer
description: Pull, claim, and independently verify ready reviewer-queue tickets in the manual pi-backlog choreography. Use only after an explicit work-available wakeup names the exact project and grants reviewer queue authority.
---

# Pi Backlog Reviewer

Use `pi-backlog` for every ticket read and write. Review independently from developer assertions and treat notifications only as hints to inspect durable ticket state.

## Readiness, selection, and claim

1. Receive an exact project directory and reviewer worker ID.
2. Run the `pi-backlog` preflight for that directory.
3. Send `WORKER_READY reviewer <worker-id> intercom` and wait until the relay confirms durable registration **before the first queue inspection**.
4. List only ready, unassigned tickets labeled `choreography:reviewer-ready`.
5. Select an eligible ticket from that role queue within the granted project scope. The relay never selects or assigns work.
6. Make the atomic claim attempt with `scripts/claim-ticket.mjs <project> <ticket> reviewer @<worker-id>`.
7. Persist `WORKER_QUEUE_ACK reviewer <worker-id> <transition-id>` only after inspecting durable queue state and attempting or deliberately declining eligible work.
8. On contention, re-read once and continue only for a complete idempotent claim already owned by this reviewer; otherwise pull another eligible ticket.

## Independent verification and output

- Read the full acceptance contract and inspect the actual diff, implementation, and tests.
- Re-run ticket-required checks and add focused probes for uncovered behavior. Do not accept developer notes as proof.
- **Pass:** record evidence, check only proven criteria, clear the reviewer assignee and choreography labels, set the configured terminal status and final summary in one edit, then verify the terminal state.
- **Defect:** append a precise defect note, keep `In Progress`, clear the reviewer assignee, and use exactly `choreography:developer-ready`. Persist that state before emitting a developer-available event.
- Notify only after the Backlog.md state is durable.

## Owner-authorized recovery

If a reviewer dies while claiming or reviewing, stop automatic reassignment. An owner may authorize `scripts/recover-ticket.mjs <project> <ticket> reviewer @<dead-worker> --owner-authorized-by <owner-id>` only after verifying the registration is stale. Never recover by age alone.

Read [the shared choreography protocol](../../references/choreography-protocol.md) for the complete state machine and failure recovery.
