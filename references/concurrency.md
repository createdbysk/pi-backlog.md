# Concurrency and recovery

Backlog.md stores tickets as project-local Markdown files. Coordinate writers because file storage does not make a group of ticket updates one transaction.

## Backlog.md 1.52.0 observations

The installed CLI rejects overlapping edits to the same ticket with this error:

```text
Edit failed: TASK-1 is being modified by another process; retry if appropriate.
```

A bounded probe confirmed that successful writes remained intact and failed writers reported that error. A separate bounded probe created distinct IDs under concurrent creates. These observations describe version 1.52.0; Backlog.md does not publish a general multi-writer transaction guarantee for all commands, files, or versions.

## Agent rules

- Assign one writer to a ticket at a time.
- Serialize ticket creation when several agents share one project; do not treat the bounded unique-ID result as a contract.
- View the ticket immediately before an edit and verify it immediately afterward.
- Combine related field changes in one `task edit` call.
- Do not assume updates across several tickets, dependencies, configuration, completion moves, or archive moves form one transaction.
- On a concurrent-modification error, view the ticket again. Retry only after confirming that the requested change still applies.
- Never run a blind retry loop. Another writer may have changed the premise or completed the request.

## Conflict recovery

1. Stop the failed write path.
2. Read the named ticket again through the CLI.
3. Compare current fields with the user's request and the latest active-ticket pointer.
4. Ask for owner direction when updates conflict or when two agents claim the same ticket.
5. Retry one explicit edit only when the merge remains unambiguous.
6. View the result and record a concise ticket comment when the conflict changed the plan.
