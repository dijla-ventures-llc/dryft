// dryft:verifies core.cli
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const marker = (role: string, featureId: string): string =>
  `dryft:${role} ${featureId}`;

test("package bin points to the built CLI file", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const binPath = fileURLToPath(new URL(`../../${packageJson.bin.dryft}`, import.meta.url));

  await access(binPath);
});

test("dryft init writes starter manifest, agent instructions, and workflow", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-init-"));

  await runCli(["init", "--project", "Example"], dir);

  assert.match(await readFile(join(dir, "dryft.yml"), "utf8"), /name: Example/);
  assert.match(
    await readFile(join(dir, "AGENTS.md"), "utf8"),
    /dryft:implements <feature-id>/
  );
  assert.match(
    await readFile(join(dir, ".github", "workflows", "dryft.yml"), "utf8"),
    /uses: dijla-ventures-llc\/dryft-action@v1/
  );
  assert.match(
    await readFile(join(dir, ".github", "workflows", "dryft.yml"), "utf8"),
    /actions: read/
  );
  assert.match(
    await readFile(join(dir, ".github", "workflows", "dryft.yml"), "utf8"),
    /json-output: dryft-report\.json/
  );
  assert.match(
    await readFile(join(dir, ".github", "workflows", "dryft.yml"), "utf8"),
    /name: Upload Dryft SARIF to code scanning[\s\S]*continue-on-error: true/
  );
  assert.match(
    await readFile(join(dir, ".github", "workflows", "dryft.yml"), "utf8"),
    /name: dryft-sarif/
  );
  assert.match(
    await readFile(join(dir, ".github", "workflows", "dryft.yml"), "utf8"),
    /uses: actions\/upload-artifact@v4/
  );
});

test("dryft scan emits JSON for a tagged repository", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-scan-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth.ts"),
    `// ${marker("implements", "auth.magic-link.login")}\nexport const auth = true;\n`
  );

  const { stdout } = await runCli(["scan", "--format", "json"], dir);
  const report = JSON.parse(stdout);

  assert.equal(report.mode, "scan");
  assert.equal(report.references.length, 1);
});

test("dryft ci evaluates changed files against a git base ref", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ci-"));
  await writeExampleManifest(dir);
  await runGit(["init", "-b", "main"], dir);
  await runGit(["config", "user.email", "dryft@example.com"], dir);
  await runGit(["config", "user.name", "Dryft Test"], dir);
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "initial"], dir);
  await runGit(["switch", "-c", "feature/auth"], dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await mkdir(join(dir, "test", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    `// ${marker("implements", "auth.magic-link.login")}\nexport const login = true;\n`
  );
  await writeFile(
    join(dir, "test", "auth", "login.test.ts"),
    `// ${marker("verifies", "auth.magic-link.login")}\nexport const testLogin = true;\n`
  );
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "implement auth feature"], dir);

  const { stdout } = await runCli(["ci", "--base", "main", "--format", "json"], dir);
  const report = JSON.parse(stdout);

  assert.equal(report.mode, "ci");
  assert.equal(report.passed, true);
  assert.deepEqual(report.changedFiles, [
    "src/auth/login.ts",
    "test/auth/login.test.ts"
  ]);
});

test("dryft ci exits non-zero for unknown feature markers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ci-"));
  await writeExampleManifest(dir);
  await runGit(["init", "-b", "main"], dir);
  await runGit(["config", "user.email", "dryft@example.com"], dir);
  await runGit(["config", "user.name", "Dryft Test"], dir);
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "initial"], dir);
  await runGit(["switch", "-c", "feature/unknown"], dir);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "src", "unknown.ts"),
    `// ${marker("implements", "missing.feature")}\nexport const unknown = true;\n`
  );

  await assert.rejects(
    () => runCli(["ci", "--base", "main", "--format", "json"], dir),
    (error: unknown) =>
      isExecError(error) &&
      error.code === 1 &&
      JSON.parse(error.stdout).issues.some(
        (issue: { code: string }) => issue.code === "unknown-feature"
      )
  );
});

test("dryft context list emits feature summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-list-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    `// ${marker("implements", "auth.magic-link.login")}\nexport const login = true;\n`
  );

  const { stdout } = await runCli(["context", "list", "--format", "json"], dir);
  const summaries = JSON.parse(stdout);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, "auth.magic-link.login");
  assert.equal(summaries[0].markerCount, 1);
  assert.ok(summaries[0].fileCount >= 1);
});

test("dryft context feature returns marker- and path-sourced files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-feat-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    `// ${marker("implements", "auth.magic-link.login")}\nexport const login = true;\n`
  );
  await writeFile(
    join(dir, "src", "auth", "session.ts"),
    `export const session = true;\n`
  );

  const { stdout } = await runCli(
    ["context", "feature", "auth.magic-link.login", "--format", "json"],
    dir
  );
  const detail = JSON.parse(stdout);

  assert.equal(detail.feature.id, "auth.magic-link.login");
  const sources = detail.files.map((entry: { source: string }) => entry.source);
  assert.ok(sources.includes("marker"));
  assert.ok(sources.includes("path"));
});

test("dryft context file returns memberships for a path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-file-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    `// ${marker("implements", "auth.magic-link.login")}\nexport const login = true;\n`
  );

  const { stdout } = await runCli(
    ["context", "file", "src/auth/login.ts", "--format", "json"],
    dir
  );
  const memberships = JSON.parse(stdout);

  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].featureId, "auth.magic-link.login");
  assert.equal(memberships[0].source, "marker");
});

test("dryft context search filters by id, title, and owner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-search-"));
  await writeExampleManifest(dir);

  const { stdout } = await runCli(
    ["context", "search", "login", "--format", "json"],
    dir
  );
  const results = JSON.parse(stdout);

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "auth.magic-link.login");
});

async function writeExampleManifest(dir: string): Promise<void> {
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: auth.magic-link.login",
      "    title: Magic link login",
      "    status: active",
      "    paths:",
      "      - src/auth/**",
      "      - test/auth/**",
      ""
    ].join("\n")
  );
}

async function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [cliPath, ...args], { cwd });
}

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

function isExecError(error: unknown): error is Error & {
  code: number;
  stdout: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "stdout" in error
  );
}
