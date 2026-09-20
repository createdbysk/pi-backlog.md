# pi-backlog

`pi-backlog` gives Pi an on-demand project ticket workflow through the installed Backlog.md CLI. The skill keeps ticket data out of ordinary startup context and leaves live execution notes to `session-discipline`.

## Installation

No global configuration change is required. Load the repository directly for one Pi session:

```bash
pi --skill /absolute/path/to/pi-backlog.md/SKILL.md
```

For trusted project-local discovery, copy the skill files into the project:

```bash
mkdir -p .pi/skills/pi-backlog
cp /absolute/path/to/pi-backlog.md/SKILL.md .pi/skills/pi-backlog/
cp -R /absolute/path/to/pi-backlog.md/references .pi/skills/pi-backlog/
cp -R /absolute/path/to/pi-backlog.md/scripts .pi/skills/pi-backlog/
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
- `tests/` runs static checks, real isolated CLI workflows, and Pi SDK discovery.

The skill uses Backlog.md for durable ticket state. `session-discipline` keeps only the active ticket ID, project path, and transient execution state.

## Limitations

- The probes target Backlog.md 1.52.0. Check installed help before use with another version.
- Backlog.md exposes no general transaction contract across several tickets or files. Keep one writer per ticket and serialize ticket creation.
- A completion status and completion cleanup differ. Cleanup removes a terminal ticket from the active board.
- Backlog.md 1.52.0 does not escape embedded double quotes in the initialized YAML project name. Use a project name without double quotes.
- The skill never launches a web surface, starts a background process, injects ticket context, or configures an alternate agent integration.

## Verification

Run the complete suite from the repository root:

```bash
./tests/run.sh
```

The suite finds `backlog`, `pi-node`, and the installed Pi SDK by default. Override paths when needed:

```bash
BACKLOG_BIN=/path/to/backlog \
PI_NODE_BIN=/path/to/pi-node \
PI_SDK_ENTRY=/path/to/pi-coding-agent/dist/index.js \
./tests/run.sh
```

The suite validates metadata discovery, trigger scope, prohibited surfaces, missing CLI and project errors, safe initialization, project isolation, exact ticket text, dependencies, status changes, completion, archive behavior, and concurrent edits. All CLI writes occur under temporary directories.
