// dryft:verifies core.ci
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { evaluateCi } from "../src/ci.js";
import { loadManifest } from "../src/manifest.js";

const marker = (role: string, featureId: string): string =>
  `dryft:${role} ${featureId}`;

test("evaluateCi fails changed source files with no Dryft marker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-ci-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: auth.magic-link.login",
      "    title: Magic link login",
      "    status: active"
    ].join("\n")
  );
  await writeFile(join(dir, "src", "auth.ts"), "export const auth = true;\n");

  const manifest = await loadManifest(dir);
  const report = await evaluateCi({
    cwd: dir,
    manifest,
    changedFiles: ["src/auth.ts"]
  });

  assert.equal(report.passed, false);
  assert.equal(report.issues[0].code, "missing-marker");
  assert.equal(report.issues[0].severity, "error");
});

test("evaluateCi warns when changed files fall outside feature path globs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-ci-"));
  await mkdir(join(dir, "src", "billing"), { recursive: true });
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
      "      - src/auth/**"
    ].join("\n")
  );
  await writeFile(
    join(dir, "src", "billing", "checkout.ts"),
    `// ${marker("implements", "auth.magic-link.login")}\nexport const checkout = true;\n`
  );

  const manifest = await loadManifest(dir);
  const report = await evaluateCi({
    cwd: dir,
    manifest,
    changedFiles: ["src/billing/checkout.ts"]
  });

  assert.equal(report.passed, true);
  assert.equal(report.issues[0].code, "path-affinity-mismatch");
  assert.equal(report.issues[0].severity, "warning");
});
