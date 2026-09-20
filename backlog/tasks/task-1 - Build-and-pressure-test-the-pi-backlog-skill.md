---
id: TASK-1
title: Build and pressure-test the pi-backlog skill
status: Done
assignee:
  - '@pi-backlog-builder'
created_date: '2026-09-20 11:58'
updated_date: '2026-09-20 18:16'
labels:
  - pi-skill
  - headless
  - project-tickets
dependencies: []
references:
  - /usr/local/bin/pi_cli/docs/skills.md
  - >-
    /data/users/satishvk/fbsource/fbcode/scripts/satishvk/scratch/skills/WORKING_NOTES.md
priority: high
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a reusable Pi skill that gives agents a project-level ticket workflow through the Backlog.md CLI. Ticket data must remain pull-only so ordinary turns and session startup add no task contents to model context. The skill must compose with session-discipline rather than duplicate live session notes. Use the installed `backlog` command, preserve filesystem-only operation for Sapling workspaces, and keep all UI or browser features opt-in and unused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pi discovers the skill under the name pi-backlog with valid Agent Skills frontmatter.
- [x] #2 The skill uses the Backlog.md CLI on demand for project initialization plus ticket create, read, list, update, dependency, and completion workflows.
- [x] #3 The skill never installs a widget, starts a daemon or browser, registers a startup or context hook, injects ticket data automatically, or requires MCP.
- [x] #4 The skill initializes Backlog.md with Git integration, branch checks, remote operations, browser auto-open, and AI integration disabled.
- [x] #5 The skill defines a clear boundary with session-discipline: tickets hold durable project work while session notes retain only the active ticket pointer and live execution state.
- [x] #6 Tests or executable probes validate behavior in isolated temporary projects, including paths and ticket text with spaces and punctuation.
- [x] #7 Independent pressure tests cover trigger precision, no-ticket startup behavior, failure handling, missing CLI behavior, project isolation, and concurrent-agent safety guidance.
- [x] #8 The repository documents installation, usage, limitations, and verification commands.
- [x] #9 Checkpoint commits reach only the selected feature branch on GitHub; no command or refspec targets main.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Probe Backlog.md 1.52.0, define executable acceptance checks, build the root skill and focused references, validate isolated real-CLI workflows and Pi discovery, then checkpoint only feature/pi-backlog-skill.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation started from remote feature checkpoint f3ff9116cc8d. The current commit matches origin/feature/pi-backlog-skill; no local bookmark persists while it equals the remote name.

Tested skeleton now includes valid pi-backlog metadata, an explicit activation gate, project-local preflight, missing CLI and missing project errors, and a model-free Pi SDK discovery probe. Verification: ./tests/test-skeleton.sh.

Checkpoint transport blocked: the approved owner tmux target pi-backlog-push:push does not exist. The tmux wrapper lists only pi-backlog-skill and d117933016-review, neither an authorized owner push shell. The tested skeleton checkpoint remains local.

Complete implementation now has root SKILL.md, three focused references, README usage and limits, preflight, static checks, Pi SDK discovery, and isolated Backlog.md 1.52.0 probes. ./tests/run.sh passed. shellcheck scripts/preflight.sh tests/test-skeleton.sh tests/run.sh passed. pi-node --check passed for all three MJS probes. Concurrent same-ticket edits preserved successful writes and rejected overlap with the documented retry-if-appropriate error. Arc lint and formatter do not apply here: this repository has no lint engine, and this Arc installation has no f command.

Final rerun after the pushed implementation checkpoint: ./tests/run.sh passed all discovery, static, real-CLI, isolation, exact-text, dependency, transition, completion, archive, missing-environment, and concurrency probes. shellcheck and pi-node syntax checks also passed.

Independent coordinator pressure review passed on 2026-09-20. Evidence: ./tests/run.sh; shellcheck scripts/preflight.sh tests/test-skeleton.sh tests/run.sh; pi-node syntax checks for all MJS probes; a model-free Pi startup-prompt probe proving only pi-backlog metadata is present and neither the SKILL body nor ticket text is injected; missing CLI, nonexistent project, and uninitialized project probes that made no files; nested-working-directory isolation with exact BACKLOG_CWD; exact multiline and command-shaped argv text; 24-way same-ticket edit contention; 20-way create contention; dependency-replacement contention; and a completion/archive race. All checks passed. Same-ticket failures used the documented reread-before-retry error, and destructive races left exactly one task copy.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: coordinator
created: 2026-09-20 17:16
---
Owner requires regular remote checkpoints because local Git work has no cloud backup. The worker may create commits but must send every push through a tmux command that runs as the owner. Push only to the selected feature branch and never to main. Launch watchdog cadence: 2 minutes for startup and 5 minutes for execution.
---

author: pi-backlog-builder-1
created: 2026-09-20 17:56
---
Builder started implementation after reading TASK-1, README.md, the Pi skill contract, and the project decisions.
---

author: pi-backlog-builder-1
created: 2026-09-20 18:02
---
Skeleton probe passed against the installed Pi loader. Preparing the first feature-branch checkpoint.
---

author: pi-backlog-builder-1
created: 2026-09-20 18:03
---
Blocked before the first remote checkpoint because pi-backlog-push:push is missing. No direct push was attempted.
---

author: pi-backlog-builder-1
created: 2026-09-20 18:09
---
Complete implementation suite passed. Preparing the second feature-only checkpoint; .pi/fabric/mesh/state.json remains untracked runtime state.
---

author: pi-backlog-builder-1
created: 2026-09-20 18:10
---
Acceptance criteria 1-6, 8, and 9 now have direct evidence. Criterion 7 remains unchecked until the coordinator completes the separate adversarial review, so TASK-1 remains In Progress.
---

author: coordinator
created: 2026-09-20 18:16
---
Independent pressure testing completed with no product defects. Trigger scope, metadata-only startup context, failure behavior, project isolation, safe text, and concurrent-writer guidance all matched the documented contract.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and independently pressure-tested the reusable pi-backlog skill. Pi discovers it by valid metadata while startup context contains no ticket or skill body. Headless Backlog.md workflows, safe initialization, project isolation, exact text handling, missing-environment failures, completion/archive behavior, and conservative concurrent-agent guidance all passed. The work remains on feature/pi-backlog-skill and is not merged to main.
<!-- SECTION:FINAL_SUMMARY:END -->
