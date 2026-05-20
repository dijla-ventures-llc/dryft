import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../../package.json", import.meta.url));

test("package bin points to the built CLI file", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const binPath = fileURLToPath(new URL(`../../${packageJson.bin.dryft}`, import.meta.url));

  await access(binPath);
});

test("dryft init writes starter manifest, agent instructions, and MCP config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-init-"));

  await runCli(["init", "--project", "Example"], dir);

  assert.match(await readFile(join(dir, "dryft.yml"), "utf8"), /name: Example/);
  assert.match(
    await readFile(join(dir, "AGENTS.md"), "utf8"),
    /dryft_plan_change/
  );
  assert.match(
    await readFile(join(dir, "AGENTS.md"), "utf8"),
    /dryft_verify_change/
  );
  assert.match(
    await readFile(join(dir, "AGENTS.md"), "utf8"),
    /Dryft Receipt/
  );
  assert.match(
    await readFile(join(dir, ".mcp.json"), "utf8"),
    /@dijla-ventures-llc\/dryft@latest/
  );
  await assert.rejects(() => stat(join(dir, ".github")));
});

test("dryft scan emits JSON listing path-matched features", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-scan-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );

  const { stdout } = await runCli(["scan", "--format", "json"], dir);
  const report = JSON.parse(stdout);

  assert.equal(report.mode, "scan");
  assert.ok(report.features["auth.magic-link.login"]);
  assert.equal(report.features["auth.magic-link.login"].fileCount, 1);
});

test("dryft ci passes when changed files belong to active features", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ci-"));
  await writeExampleManifest(dir);
  await runGit(["init", "-b", "main"], dir);
  await runGit(["config", "user.email", "dryft@example.com"], dir);
  await runGit(["config", "user.name", "Dryft Test"], dir);
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "initial"], dir);
  await runGit(["switch", "-c", "feature/auth"], dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "implement auth feature"], dir);

  const { stdout } = await runCli(["ci", "--base", "main", "--format", "json"], dir);
  const report = JSON.parse(stdout);

  assert.equal(report.mode, "ci");
  assert.equal(report.passed, true);
  assert.deepEqual(report.changedFiles, ["src/auth/login.ts"]);
});

test("dryft ci fails when changed files touch an archived feature", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ci-arch-"));
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: legacy.module",
      "    title: Legacy module",
      "    status: archived",
      "    paths:",
      "      - src/legacy/**"
    ].join("\n")
  );
  await runGit(["init", "-b", "main"], dir);
  await runGit(["config", "user.email", "dryft@example.com"], dir);
  await runGit(["config", "user.name", "Dryft Test"], dir);
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "initial"], dir);
  await runGit(["switch", "-c", "feature/legacy-touch"], dir);
  await mkdir(join(dir, "src", "legacy"), { recursive: true });
  await writeFile(
    join(dir, "src", "legacy", "old.ts"),
    "export const old = true;\n"
  );
  await runGit(["add", "."], dir);
  await runGit(["commit", "-m", "touch legacy"], dir);

  await assert.rejects(
    () => runCli(["ci", "--base", "main", "--format", "json"], dir),
    (error: unknown) =>
      isExecError(error) &&
      error.code === 1 &&
      JSON.parse(error.stdout).issues.some(
        (issue: { code: string }) => issue.code === "archived-feature-touched"
      )
  );
});

test("dryft context list emits feature summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-list-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );

  const { stdout } = await runCli(["context", "list", "--format", "json"], dir);
  const summaries = JSON.parse(stdout);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, "auth.magic-link.login");
  assert.ok(summaries[0].fileCount >= 1);
});

test("dryft context feature returns the files that match its path globs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-feat-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );
  await writeFile(
    join(dir, "src", "auth", "session.ts"),
    "export const session = true;\n"
  );

  const { stdout } = await runCli(
    ["context", "feature", "auth.magic-link.login", "--format", "json"],
    dir
  );
  const detail = JSON.parse(stdout);

  assert.equal(detail.feature.id, "auth.magic-link.login");
  assert.ok(detail.files.includes("src/auth/login.ts"));
  assert.ok(detail.files.includes("src/auth/session.ts"));
});

test("dryft context file returns the features a file belongs to", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-cli-ctx-file-"));
  await writeExampleManifest(dir);
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );

  const { stdout } = await runCli(
    ["context", "file", "src/auth/login.ts", "--format", "json"],
    dir
  );
  const featureIds = JSON.parse(stdout);

  assert.deepEqual(featureIds, ["auth.magic-link.login"]);
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
