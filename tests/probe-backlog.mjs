import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [repoRoot, backlogBin] = process.argv.slice(2);
assert.ok(repoRoot, "repository root argument is required");
assert.ok(backlogBin, "Backlog.md executable argument is required");

function invoke(projectRoot, args, expectedStatus = 0) {
  const result = spawnSync(backlogBin, args, {
    cwd: repoRoot,
    env: { ...process.env, BACKLOG_CWD: projectRoot },
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    expectedStatus,
    `unexpected status for ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function invokeAsync(projectRoot, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(backlogBin, args, {
      cwd: repoRoot,
      env: { ...process.env, BACKLOG_CWD: projectRoot },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function initProject(projectRoot, projectName) {
  fs.mkdirSync(projectRoot, { recursive: true });
  invoke(projectRoot, [
    "init",
    projectName,
    "--defaults",
    "--integration-mode", "none",
    "--no-git",
    "--check-branches", "false",
    "--include-remote", "false",
    "--bypass-git-hooks", "false",
    "--auto-open-browser", "false",
  ]);
}

function viewTask(projectRoot, taskId) {
  return JSON.parse(invoke(projectRoot, ["task", "view", taskId, "--json"]).stdout).task;
}

function listTasks(projectRoot, extraArgs = []) {
  return JSON.parse(invoke(projectRoot, ["task", "list", "--json", ...extraArgs]).stdout).tasks;
}

function taskIdFromCreate(result) {
  const match = result.stdout.match(/Task (TASK-\d+) -/);
  assert.ok(match, `could not parse task ID from output:\n${result.stdout}`);
  return match[1];
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi backlog complete probe "));
try {
  const missingProject = path.join(tempRoot, "not initialized");
  fs.mkdirSync(missingProject);
  const missing = invoke(missingProject, ["task", "list", "--json"], 1);
  assert.match(`${missing.stdout}${missing.stderr}`, /No Backlog\.md project found/);

  const projectA = path.join(tempRoot, "Project A with spaces");
  const projectB = path.join(tempRoot, "Project B with spaces");
  initProject(projectA, "Project A");
  assert.deepEqual(fs.readdirSync(projectA).sort(), ["backlog"]);
  assert.deepEqual(fs.readdirSync(path.join(projectA, "backlog")).sort(), [
    "archive",
    "completed",
    "config.yml",
    "decisions",
    "docs",
    "drafts",
    "milestones",
    "tasks",
  ]);

  const config = fs.readFileSync(path.join(projectA, "backlog", "config.yml"), "utf8");
  for (const line of [
    "auto_open_browser: false",
    "remote_operations: false",
    "auto_commit: false",
    "filesystem_only: true",
    "bypass_git_hooks: false",
    "check_active_branches: false",
  ]) {
    assert.ok(config.includes(line), `safe init config is missing: ${line}`);
  }

  const sentinel = path.join(tempRoot, "shell-substitution-must-not-run");
  const title = 'Ticket with spaces, "quotes", apostrophe\'s, punctuation !?, and `literal backticks`';
  const description = `Keep exact text; never execute \`touch ${sentinel}\`.`;
  const acceptanceCriterion = 'Preserve "quotes", punctuation !?, and `literal backticks`.';
  const created = invoke(projectA, [
    "task", "create", title,
    "--description", description,
    "--status", "To Do",
    "--priority", "High",
    "--assignee", "@agent-one",
    "--ac", acceptanceCriterion,
    "--plain",
  ]);
  const primaryId = taskIdFromCreate(created);
  assert.equal(primaryId, "TASK-1");
  assert.equal(fs.existsSync(sentinel), false, "ticket text triggered shell substitution");

  const initial = viewTask(projectA, primaryId);
  assert.deepEqual(
    {
      id: initial.id,
      title: initial.title,
      description: initial.description,
      status: initial.status,
      priority: initial.priority,
      assignees: initial.assignees,
      dependencies: initial.dependencies,
      acceptanceCriteria: initial.acceptanceCriteria,
    },
    {
      id: "TASK-1",
      title,
      description,
      status: "To Do",
      priority: "high",
      assignees: ["@agent-one"],
      dependencies: [],
      acceptanceCriteria: [{ index: 1, text: acceptanceCriterion, checked: false }],
    },
  );

  initProject(projectB, "Project B");
  const otherTitle = "Only in project B";
  invoke(projectB, ["task", "create", otherTitle, "--plain"]);
  assert.deepEqual(listTasks(projectA).map((task) => task.title), [title]);
  assert.deepEqual(listTasks(projectB).map((task) => task.title), [otherTitle]);

  const dependencyId = taskIdFromCreate(invoke(projectA, ["task", "create", "Dependency ticket", "--plain"]));
  invoke(projectA, [
    "task", "edit", primaryId,
    "--status", "In Progress",
    "--priority", "Medium",
    "--assignee", "@agent-two",
    "--depends-on", dependencyId,
    "--plan", "Execute the verified plan.",
    "--notes", "Keep durable progress here.",
    "--comment", "Start after dependency review.",
    "--comment-author", "probe",
    "--plain",
  ]);
  const blocked = viewTask(projectA, primaryId);
  assert.deepEqual(
    {
      status: blocked.status,
      priority: blocked.priority,
      assignees: blocked.assignees,
      dependencies: blocked.dependencies,
      readiness: blocked.readiness,
      implementationPlan: blocked.implementationPlan,
      implementationNotes: blocked.implementationNotes,
      comments: blocked.comments.map(({ author, body }) => ({ author, body })),
    },
    {
      status: "In Progress",
      priority: "medium",
      assignees: ["@agent-two"],
      dependencies: [dependencyId],
      readiness: {
        isReady: false,
        isBlocked: true,
        blockingDependencies: [dependencyId],
        missingDependencies: [],
      },
      implementationPlan: "Execute the verified plan.",
      implementationNotes: "Keep durable progress here.",
      comments: [{ author: "probe", body: "Start after dependency review." }],
    },
  );

  invoke(projectA, ["task", "edit", primaryId, "--clear-deps", "--plain"]);
  assert.deepEqual(viewTask(projectA, primaryId).dependencies, []);
  invoke(projectA, ["task", "edit", primaryId, "--depends-on", dependencyId, "--plain"]);
  assert.deepEqual(viewTask(projectA, primaryId).dependencies, [dependencyId]);

  const search = JSON.parse(invoke(projectA, ["search", "literal backticks", "--type", "task", "--json"]).stdout);
  assert.deepEqual(search.results.map((result) => [result.type, result.data.id]), [["task", primaryId]]);
  assert.deepEqual(listTasks(projectA, ["--status", "In Progress"]).map((task) => task.id), [primaryId]);

  invoke(projectA, ["task", "edit", dependencyId, "--status", "Done", "--final-summary", "Dependency verified.", "--plain"]);
  assert.deepEqual(listTasks(projectA, ["--ready"]).map((task) => task.id), [primaryId]);
  invoke(projectA, ["task", "edit", primaryId, "--check-ac", "1", "--status", "Done", "--final-summary", "All requested behavior verified.", "--plain"]);
  const done = viewTask(projectA, primaryId);
  assert.equal(done.status, "Done");
  assert.equal(done.finalSummary, "All requested behavior verified.");
  assert.equal(done.acceptanceCriteria[0].checked, true);
  invoke(projectA, ["task", "complete", primaryId]);
  assert.deepEqual(listTasks(projectA).map((task) => task.id), [dependencyId]);
  assert.equal(fs.readdirSync(path.join(projectA, "backlog", "completed")).length, 1);

  const archivedId = taskIdFromCreate(invoke(projectA, ["task", "create", "Archive without completion", "--plain"]));
  invoke(projectA, ["task", "archive", archivedId]);
  assert.equal(listTasks(projectA).some((task) => task.id === archivedId), false);
  assert.equal(fs.readdirSync(path.join(projectA, "backlog", "archive", "tasks")).length, 1);

  const sharedId = taskIdFromCreate(invoke(projectA, ["task", "create", "Concurrent edit probe", "--plain"]));
  const edits = await Promise.all(
    Array.from({ length: 8 }, (_, index) => invokeAsync(projectA, [
      "task", "edit", sharedId,
      "--comment", `comment-${index}`,
      "--comment-author", `agent-${index}`,
      "--plain",
    ])),
  );
  const successfulBodies = [];
  let lockConflicts = 0;
  edits.forEach((result, index) => {
    if (result.status === 0) {
      successfulBodies.push(`comment-${index}`);
      return;
    }
    lockConflicts += 1;
    assert.match(`${result.stdout}${result.stderr}`, /is being modified by another process; retry if appropriate\./);
  });
  const concurrent = viewTask(projectA, sharedId);
  assert.deepEqual(
    concurrent.comments.map((comment) => comment.body).sort(),
    successfulBodies.sort(),
  );
  console.log(`PASS: concurrent edit probe preserved ${successfulBodies.length} writes and reported ${lockConflicts} lock conflicts`);

  console.log("PASS: real Backlog.md CLI workflows and isolation");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
