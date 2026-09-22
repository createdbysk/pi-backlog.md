# Manual choreography protocol

This protocol layers manual developer/reviewer choreography around `pi-backlog`. It does not create live workers, schedulers, services, or external integrations.

## Authority and durable order

Backlog.md is the source of truth for ticket status, dependencies, queue label, assignee, acceptance criteria, notes, and final summary. Fabric mesh carries durable work-available events. Intercom wakes registered sessions. Neither notification channel grants assignment authority.

Every producer follows this order:

1. Write and verify the new Backlog.md ticket state.
2. Derive an application transition ID from project identity, ticket ID, target role, and durable transition revision.
3. Publish the role-specific mesh event with that transition ID in event data.
4. Fan out an Intercom wakeup to registered workers of that role.

A worker registers before its first queue inspection. A missed or early wakeup cannot strand ready work because reconciliation retries until durable inspection acknowledgement or ticket transition.

## Canonical wire messages

- Registration: `WORKER_READY <developer|reviewer> <worker-id> intercom`
- Queue inspection acknowledgement: `WORKER_QUEUE_ACK <developer|reviewer> <worker-id> <transition-id>`

The role is always explicit. Worker IDs do not imply roles. The relay persists registration before confirming readiness. An Intercom `send` success records transport delivery only; it does not imply that the worker inspected the queue. The acknowledgement is persisted only after queue inspection and an attempted or deliberately declined eligible claim.

## Pull-based ticket state machine

| State | Exclusive choreography label | Assignee | Status |
|---|---|---|---|
| Awaiting developer | `choreography:developer-ready` | none | nonterminal |
| Developer active | `choreography:developer-active` | claiming developer | `In Progress` |
| Awaiting reviewer | `choreography:reviewer-ready` | none | `In Progress` |
| Reviewer active | `choreography:reviewer-active` | claiming reviewer | `In Progress` |
| Passed | none | none | configured terminal status |
| Defect returned | `choreography:developer-ready` | none | `In Progress` |

The four choreography labels are mutually exclusive. Other project labels are preserved. Each producer combines related status, label, assignee, and note changes in one Backlog.md edit and verifies the complete state.

Eligible workers inspect their role queue and select work themselves. Neither the relay nor a coordinator chooses or assigns a ticket. Contenders race only through the atomic claim helper; exactly one verified claim wins.

```bash
BACKLOG_CWD="$project" backlog task list --ready --unassigned --labels choreography:developer-ready --json
BACKLOG_CWD="$project" backlog task list --ready --unassigned --labels choreography:reviewer-ready --json
node scripts/claim-ticket.mjs "$project" TASK-123 developer @developer-id
node scripts/claim-ticket.mjs "$project" TASK-123 reviewer @reviewer-id
```

The helper rejects inherited role names, contradictory choreography labels, blocked or assigned work, and malformed state. It uses portable exclusive file creation (`open` with create-and-exclude semantics), writes and syncs lock-owner process identity, re-reads the ticket, applies one Backlog.md edit, and verifies `In Progress`, the sole assignee, the exclusive active-role label, and removal of the ready label. A crash between exclusive creation and complete owner publication leaves canonical evidence that recovery rejects as malformed; it is never guessed stale. Same-worker retries return `ALREADY_CLAIMED`; competing workers receive `CLAIM_BUSY` or `CLAIM_REJECTED` without candidate residue.

## Durable relay state and retries

Use versioned compare-and-swap for application keys under `pi-backlog/relay/v1/`:

- `registrations/<worker-id>`: explicit role, Intercom target, health, registration time, and last successful transport delivery;
- `cursors/<role>`: last accepted Fabric sequence for that role stream;
- `transitions/<transition-id>`: ticket, role, durable revision, resolution state, and per-recipient delivery records.

The stable delivery key is `<transition-id>:<worker-id>`. A send attempt records its retry generation, transport outcome, error, and next eligible retry time beneath that key. Each reconciliation pass caps both sends and exponential backoff. Due recipients are ordered by fewest attempts, then least recent attempt, then worker ID, so every healthy recipient receives a first attempt before any recipient monopolizes retries. Retry generations continue under the same logical identity until the recipient's durable inspection acknowledgement or a durable ticket transition resolves the event. A successful Intercom send without acknowledgement remains retryable.

Durable cursor advancement records event acceptance, not completion of worker processing. Restart loads the saved cursor and transition records. A duplicate publication may carry the same application transition ID in a later Fabric envelope: matching ticket/role identity preserves delivery history, records the latest sequence, advances the role cursor, and permits subsequent events. Only an actual identity conflict is rejected.

## Registration, fan-out, and stale sessions

The relay persists canonical registration before acknowledging it. Fan-out includes only healthy registrations whose explicit role matches the transition. Failed health verification marks a registration stale; stale registrations remain visible for diagnosis but receive no normal fan-out until a fresh registration restores health.

Reconciliation also finds active tickets owned by stale registrations. It reports them for manual recovery and never reassigns them automatically.

## Owner-authorized recovery

Worker, reviewer, and claim-process death are recoverable only through an explicit owner decision. Never infer death or authority from lock age.

```bash
node scripts/recover-ticket.mjs "$project" TASK-123 developer @dead-worker --owner-authorized-by owner-id
node scripts/recover-ticket.mjs "$project" TASK-456 reviewer @dead-reviewer --owner-authorized-by owner-id
```

Before changing anything, the operator verifies the durable registration is stale. The command then:

1. reads the exact ticket and accepts only an authoritative ready state or matching `In Progress` active-owner state;
2. validates the complete lock-owner schema before liveness checks: schema version, exact ticket/role/worker/local host, positive safe PID, nonempty process-start token, and valid creation time;
3. rejects malformed/partial records, a matching live process, a live PID with a different start token, and an unverifiable remote owner;
4. atomically moves stale evidence into `backlog/.choreography-quarantine/`, then wins and holds the canonical recovery lock before any ticket mutation;
5. re-reads ticket state after takeover, returns only a still-matching active ticket to its role-ready state with no assignee and a durable recovery note, and verifies the complete recovered state;
6. releases the recovery lock only after verification, leaving stale evidence quarantined. A loser never edits the ticket or moves the winner's lock.

Malformed, contradictory, terminal, differently owned, or live-lock states fail closed. A pre-mutation failure restores stale evidence when exclusive restoration remains safe.

## Scheduled relay reconciliation

A scheduled manual relay wakeup performs a bounded pass:

1. Resume missed events from both durable cursors.
2. Find unassigned ready tickets carrying either queue label and active tickets whose registered owner is stale.
3. For ready tickets, retry eligible unacknowledged recipients under stable delivery identities, including prior transport-success cases.
4. Stop retries for a recipient only after durable queue-inspection acknowledgement or stop the transition after durable ticket state changes.
5. Surface stale active ownership for explicit owner-authorized recovery; never delete or reassign by age.
6. Record outcomes with versioned compare-and-swap.

Complete relay-process death remains an accepted prototype limitation. The package documents the wakeup but does not install a scheduler or run a background process.

## Relay improvement loop

Operational observations and proposed protocol improvements become durable Backlog.md work items. The relay does not rewrite its loaded skill or silently change the active protocol.
