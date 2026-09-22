import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repoRoot, sdkEntry, agentDir] = process.argv.slice(2);
assert.ok(repoRoot && sdkEntry && agentDir);
const absoluteRepoRoot = path.resolve(repoRoot);
const expected = new Map([
  ["pi-backlog", path.join(absoluteRepoRoot, "SKILL.md")],
  ["pi-backlog-relay", path.join(absoluteRepoRoot, "skills", "pi-backlog-relay", "SKILL.md")],
  ["pi-backlog-developer", path.join(absoluteRepoRoot, "skills", "pi-backlog-developer", "SKILL.md")],
  ["pi-backlog-reviewer", path.join(absoluteRepoRoot, "skills", "pi-backlog-reviewer", "SKILL.md")],
]);

const { DefaultPackageManager, DefaultResourceLoader, SettingsManager } = await import(pathToFileURL(sdkEntry).href);
const settingsManager = SettingsManager.create(absoluteRepoRoot, agentDir);
const packageManager = new DefaultPackageManager({ cwd: absoluteRepoRoot, agentDir, settingsManager });
const resolved = await packageManager.resolveExtensionSources([absoluteRepoRoot], { temporary: true });
const skillPaths = resolved.skills.filter((resource) => resource.enabled).map((resource) => resource.path);
assert.deepEqual(skillPaths.sort(), [...expected.values()].sort(), "package manifest did not resolve the expected skills");
assert.ok(resolved.skills.every((resource) => resource.metadata.origin === "package"));

const loader = new DefaultResourceLoader({
  cwd: absoluteRepoRoot,
  agentDir,
  additionalSkillPaths: skillPaths,
  noExtensions: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});
await loader.reload();
const { skills, diagnostics } = loader.getSkills();
const discovered = skills.filter((skill) => expected.has(skill.name));
assert.deepEqual(discovered.map((skill) => skill.name).sort(), [...expected.keys()].sort());
for (const skill of discovered) {
  assert.equal(skill.filePath, expected.get(skill.name));
  assert.ok(skill.description.length > 20, `${skill.name} has an inadequate description`);
}
assert.equal(diagnostics.filter((diagnostic) => diagnostic.type === "error").length, 0, JSON.stringify(diagnostics));
console.log("PASS: Pi package manifest resolved and discovered all four skills");
