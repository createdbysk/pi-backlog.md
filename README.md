# pi-backlog

`pi-backlog` is one Pi package containing the pull-only Backlog.md ticket skill plus manual relay, developer, and reviewer choreography skills. Backlog.md remains the durable source of truth, while Fabric mesh events advertise available work and Intercom provides wakeups.

## Installation

No global configuration change is required. Try the complete local package for one Pi session:

```bash
pi -e /absolute/path/to/pi-backlog.md
```

The package manifest exposes four flat skills: `pi-backlog`, `pi-backlog-relay`, `pi-backlog-developer`, and `pi-backlog-reviewer`. To load only the core ticket skill, use:

```bash
pi --skill /absolute/path/to/pi-backlog.md/SKILL.md
```

Install Backlog.md separately and ensure `backlog` appears on `PATH`. The skill reports a missing CLI but never installs one.

## Usage

Ask for an explicit ticket action and name the project when the current directory does not establish it:

- “Initialize Backlog.md in `/path/to/project` without repository integration.”
- “Create a ticket for the parser fix with these acceptance criteria.”
- “Show `TASK-12`.”
- “Assign `TASK-12` to `@alex`, set high priority, and mark it in progress.”
- “Make `TASK-12` depend on `TASK-9`.”
- “Mark `TASK-12` done with this final summary.”
- “Archive `TASK-8`.”

The skill also activates when trusted live session state already points to one Backlog.md ticket. It reads that ticket only when current work needs it.

## Design

- Root `SKILL.md` provides strict trigger and project-isolation rules.
- `references/cli-workflows.md` holds command details for initialization and ticket operations.
- `references/safe-text.md` prevents shell interpretation of user-authored text.
- `references/concurrency.md` records observed lock behavior and conservative multi-agent rules.
- `scripts/preflight.sh` checks the CLI and exact project without reading ticket bodies.
- `skills/` contains the relay, developer, and reviewer role contracts.
- `references/choreography-protocol.md` defines durable ordering, explicit-role registration, queue labels, acknowledgements, retries, and reconciliation.
- `lib/relay-state.mjs` provides deterministic, replay-safe, fair state transitions for durable relay adapters.
- `lib/exclusive-lock.mjs` provides the portable no-replace lock primitive used on ordinary filesystems and EdenFS.
- `scripts/claim-ticket.mjs` performs one bounded project-local atomic claim attempt and retains partial lock evidence fail-closed.
- `scripts/recover-ticket.mjs` performs explicit owner-authorized, exclusively serialized recovery after a claimant dies.
- `tests/` runs static checks, real isolated CLI workflows, package-manifest discovery, behavioral relay probes, and manual choreography/recovery probes.

The core skill uses Backlog.md for durable ticket state. `session-discipline` keeps only the active ticket ID, project path, and transient execution state. Eligible workers pull from their role queues and compete through atomic claims; the relay never selects or assigns them. Ticket state is persisted before notification, registration is persisted before queue inspection, and transport delivery remains distinct from durable inspection acknowledgement.

The product repository intentionally contains no live `backlog/` board and no `.pi/` runtime state. Root `.gitignore` guards prevent those project-local operational paths from entering product commits; tests use isolated temporary Backlog.md projects instead.

## Limitations

- The probes target Backlog.md 1.52.0. Check installed help before use with another version.
- Backlog.md exposes no general transaction contract across several tickets or files. Keep one writer per ticket and serialize ticket creation.
- A completion status and completion cleanup differ. Cleanup removes a terminal ticket from the active board.
- Backlog.md 1.52.0 does not escape embedded double quotes in the initialized YAML project name. Use a project name without double quotes.
- The skills never launch a web surface, start a background process, inject ticket context, or configure an alternate agent integration.
- Recovery requires an explicit owner authorization and exact durable-state checks; lock age alone never authorizes reassignment.
- Complete relay-process death between scheduled wakeups is an accepted manual-prototype limitation. The package documents reconciliation but does not install a scheduler.

## Verification

Run the complete suite from the repository root:

```bash
./tests/run.sh
```

For explicit mount coverage, run the isolated end-to-end fixture beneath the target filesystem and name its expected `stat -f` type:

```bash
pi-node tests/probe-filesystem-choreography.mjs . "$(command -v backlog)" /absolute/test-root fuseblk
```

The fixture creates and removes its own Backlog project under the supplied root. The suite finds `backlog`, `pi-node`, and the installed Pi SDK by default. Override paths when needed:

```bash
BACKLOG_BIN=/path/to/backlog \
PI_NODE_BIN=/path/to/pi-node \
PI_SDK_ENTRY=/path/to/pi-coding-agent/dist/index.js \
./tests/run.sh
```

The suite validates package-manifest discovery, trigger scope, source-state guards, missing CLI and project errors, safe initialization, project isolation, exact ticket text, dependencies, status changes, completion, concurrent edits, relay delivery/acknowledgement behavior, strict claims, owner-authorized crash recovery, and isolated filesystem-specific contention/recovery. All CLI writes occur under temporary directories or an explicitly supplied isolated test root.
