// dryft:verifies core.scanner
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadManifest } from "../src/manifest.js";
import { scanRepository } from "../src/scanner.js";

const marker = (role: string, featureId: string): string =>
  `dryft:${role} ${featureId}`;

test("scanRepository builds a feature reference graph and reports unknown markers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-scan-"));
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
  await writeFile(
    join(dir, "src", "auth.ts"),
    [
      `// ${marker("implements", "auth.magic-link.login")}`,
      "export const auth = true;",
      `// ${marker("verifies", "missing.feature")}`
    ].join("\n")
  );

  const manifest = await loadManifest(dir);
  const report = await scanRepository({ cwd: dir, manifest });

  assert.equal(report.references.length, 2);
  assert.equal(report.features["auth.magic-link.login"].implements.length, 1);
  assert.equal(report.issues[0].code, "unknown-feature");
  assert.equal(report.issues[0].severity, "error");
});

test("scanRepository warns on deprecated features and fails archived features", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dryft-scan-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "dryft.yml"),
    [
      "project:",
      "  name: Example",
      "features:",
      "  - id: auth.legacy-login",
      "    title: Legacy login",
      "    status: deprecated",
      "  - id: auth.deleted-login",
      "    title: Deleted login",
      "    status: archived"
    ].join("\n")
  );
  await writeFile(
    join(dir, "src", "auth.ts"),
    [
      `// ${marker("implements", "auth.legacy-login")}`,
      `// ${marker("implements", "auth.deleted-login")}`
    ].join("\n")
  );

  const manifest = await loadManifest(dir);
  const report = await scanRepository({ cwd: dir, manifest });

  assert.equal(report.passed, false);
  assert.deepEqual(
    report.issues.map((issue) => [issue.code, issue.severity]),
    [
      ["deprecated-feature", "warning"],
      ["inactive-feature", "error"]
    ]
  );
});
