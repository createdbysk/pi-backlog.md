import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [skillPath, sdkEntry, agentDir] = process.argv.slice(2);
assert.ok(skillPath, "skill path argument is required");
assert.ok(sdkEntry, "Pi SDK entry argument is required");
assert.ok(agentDir, "agent directory argument is required");

const { DefaultResourceLoader } = await import(pathToFileURL(sdkEntry).href);
const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir,
  additionalSkillPaths: [skillPath],
  noExtensions: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});
await loader.reload();
const { skills, diagnostics } = loader.getSkills();
const discovered = skills.filter((skill) => skill.filePath === skillPath);
assert.equal(discovered.length, 1, `expected one discovered skill; diagnostics: ${JSON.stringify(diagnostics)}`);
assert.equal(discovered[0].name, "pi-backlog");
assert.match(discovered[0].description, /explicitly asks/);
assert.equal(diagnostics.filter((diagnostic) => diagnostic.type === "error").length, 0);
console.log("PASS: Pi discovered pi-backlog with valid metadata");
