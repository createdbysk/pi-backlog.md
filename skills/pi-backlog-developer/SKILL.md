---
name: pi-backlog-developer
description: Pull, claim, and execute ready developer-queue tickets in the manual pi-backlog choreography. Use only after an explicit work-available wakeup names the exact project and grants developer queue authority.
---

# Pi Backlog Developer

Use `pi-backlog` for every ticket read and write. The ticket is the execution contract; a mesh event or Intercom message is only a wakeup.

## Readiness, selection, and claim

1. Receive an exact project directory and worker ID.
2. Run the `pi-backlog` preflight for that directory.
3. Send `WORKER_READY developer <worker-id> intercom` and wait until the relay confirms durable registration **before the first queue inspection**.
4. List only ready, unassigned tickets labeled `choreography:developer-ready`.
5. Select an eligible ticket from that role queue within the granted project scope. Neither the relay nor an unnamed coordinator selects or assigns it.
6. Make the atomic claim attempt with `scripts/claim-ticket.mjs <project> <ticket> developer @<worker-id>`. The exclusive project-local lock, one Backlog.md edit, and complete post-write verification select the sole winner.
7. Persist `WORKER_QUEUE_ACK developer <worker-id> <transition-id>` only after inspecting the durable queue and attempting or deliberately declining its eligible work. Transport delivery alone is not this acknowledgement.
8. On `CLAIM_BUSY` or `CLAIM_REJECTED`, re-read once. Continue only if the same worker already owns a complete idempotent claim; otherwise pull another eligible ticket or stop when none remain.

## Execution and handoff

- After a successful claim, own implementation, tests, and ticket notes only within the ticket's authority.
- Re-read acceptance criteria before substantial edits and before reporting completion.
- Persist reviewer-ready state first: keep `In Progress`, clear the developer assignee, use exactly `choreography:reviewer-ready`, and record verification through the Backlog.md CLI.
- Only after that write verifies should a reviewer-available mesh event and Intercom wakeup be emitted.
- Leave final completion to the reviewer protocol when independent review is required.

## Owner-authorized recovery

If a developer dies while claiming or executing, stop automatic assignment. An owner may authorize `scripts/recover-ticket.mjs <project> <ticket> developer @<dead-worker> --owner-authorized-by <owner-id>` only after verifying the worker registration is stale. The command verifies exact ticket and lock-owner state, rejects a live lock owner, quarantines stale lock evidence, and returns only a matching active ticket to the developer-ready queue. Never recover by age alone.

Read [the shared choreography protocol](../../references/choreography-protocol.md) for labels, acknowledgements, retries, and recovery invariants.
