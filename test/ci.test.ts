import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateCi } from "../src/ci.js";
import { loadManifest } from "../src/manifest.js";

test("evaluateCi passes when changed files belong to active features only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-ci-"));
  await mkdir(join(dir, "src", "auth"), { recursive: true });
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: auth.login",
      "    title: Login",
      "    status: active",
      "    paths:",
      "      - src/auth/**"
    ].join("\n")
  );
  await writeFile(
    join(dir, "src", "auth", "login.ts"),
    "export const login = true;\n"
  );

  const manifest = await loadManifest(dir);
  const report = await evaluateCi({
    cwd: dir,
    manifest,
    changedFiles: ["src/auth/login.ts"]
  });

  assert.equal(report.passed, true);
  assert.deepEqual(report.issues, []);
});

test("evaluateCi warns when changed files touch a deprecated feature", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-ci-"));
  await mkdir(join(dir, "src", "legacy"), { recursive: true });
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: legacy.module",
      "    title: Legacy module",
      "    status: deprecated",
      "    paths:",
      "      - src/legacy/**"
    ].join("\n")
  );
  await writeFile(
    join(dir, "src", "legacy", "old.ts"),
    "export const old = true;\n"
  );

  const manifest = await loadManifest(dir);
  const report = await evaluateCi({
    cwd: dir,
    manifest,
    changedFiles: ["src/legacy/old.ts"]
  });

  assert.equal(report.passed, true);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].code, "deprecated-feature-touched");
  assert.equal(report.issues[0].severity, "warning");
});

test("evaluateCi fails when changed files touch an archived feature", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-ci-"));
  await mkdir(join(dir, "src", "deleted"), { recursive: true });
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: deleted.module",
      "    title: Deleted module",
      "    status: archived",
      "    paths:",
      "      - src/deleted/**"
    ].join("\n")
  );
  await writeFile(
    join(dir, "src", "deleted", "ghost.ts"),
    "export const ghost = true;\n"
  );

  const manifest = await loadManifest(dir);
  const report = await evaluateCi({
    cwd: dir,
    manifest,
    changedFiles: ["src/deleted/ghost.ts"]
  });

  assert.equal(report.passed, false);
  assert.equal(report.issues[0].code, "archived-feature-touched");
  assert.equal(report.issues[0].severity, "error");
});
