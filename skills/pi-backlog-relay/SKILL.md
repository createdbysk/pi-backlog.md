---
name: pi-backlog-relay
description: Relay durable pi-backlog work-available events to registered developer and reviewer sessions. Use when manually operating or reconciling the choreography relay; never use it to select workers or assign tickets.
---

# Pi Backlog Relay

Operate the notification layer around `pi-backlog`. Backlog.md is authoritative, Fabric mesh events are durable availability notices, and Intercom delivery is only a wakeup transport.

## Boundaries

- Never choose a worker, reserve work for one, claim a ticket, assign an assignee, or change implementation state. Eligible workers pull from their role queue and one atomic claim chooses the winner.
- Never rewrite this active skill from observations. Record an observation or proposed improvement as a durable Backlog.md ticket for later review.
- Do not start a service, scheduler, worker, or reviewer. This skill defines the manual prototype protocol only.

## Registration and fan-out

1. Accept only the canonical registration `WORKER_READY <developer|reviewer> <worker-id> intercom`.
2. Persist the explicit role, Intercom target, registration time, last successful delivery, and health state before acknowledging registration.
3. Keep a separate durable Fabric mesh consumer cursor for each role queue. Resume after the last accepted event; do not reset a cursor to latest.
4. For developer availability, fan out only to healthy registered developers. For reviewer availability, fan out only to healthy registered reviewers.
5. Use the application transition ID plus recipient ID as the stable logical delivery identity. Accept duplicate publications at later Fabric sequences without resetting delivery history. Order due recipients by never-attempted then least-recently-attempted so bounded passes remain fair; keep retry generations under the same identity with capped exponential backoff.
6. Record Intercom transport delivery separately from `WORKER_QUEUE_ACK <developer|reviewer> <worker-id> <transition-id>`, which means the worker inspected durable queue state.
7. Mark a session stale after failed delivery or failed health verification. Keep its durable registration for diagnosis, exclude it from normal fan-out, and require fresh registration to reactivate it.

Read [the shared choreography protocol](../../references/choreography-protocol.md) before operating the relay.

## Reconciliation wakeup

On every scheduled manual relay wakeup:

1. Resume both durable mesh cursors and process missed events.
2. Query Backlog.md for ready queue tickets and active tickets owned by stale workers.
3. For each unassigned ready ticket, retry every eligible recipient lacking a durable queue-inspection acknowledgement, even when an earlier Intercom send succeeded. Stop only for that acknowledgement or a durable ticket transition.
4. Reconcile stale registrations and failed deliveries under the original logical identity and bounded backoff.
5. Surface active stale owners for explicit owner-authorized recovery; never delete a lock or reassign by age.
6. Record delivery state before advancing the corresponding durable cursor with versioned compare-and-swap.

Complete relay-process death between scheduled wakeups remains an accepted prototype limitation. The next successful wakeup reconciles durable state; this package does not create or supervise that schedule.
