// dryft:implements core.ci
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import picomatch from "picomatch";

import { listRepositoryFiles, normalizeInputFiles } from "./file-list.js";
import { scanRepository } from "./scanner.js";
import type { CiOptions, DryftIssue, DryftReport } from "./types.js";

const execFileAsync = promisify(execFile);

export async function evaluateCi(options: CiOptions): Promise<DryftReport> {
  const changedFiles =
    options.changedFiles ?? (await getChangedFiles(options.cwd, options.baseRef));
  const normalizedChangedFiles = normalizeInputFiles(options.cwd, changedFiles);
  const scan = await scanRepository({
    cwd: options.cwd,
    manifest: options.manifest,
    files: await listRepositoryFiles(options.cwd)
  });

  const issues: DryftIssue[] = [];

  for (const feature of options.manifest.features) {
    if (!feature.paths || feature.paths.length === 0) {
      continue;
    }
    if (feature.status !== "deprecated" && feature.status !== "archived") {
      continue;
    }

    const matcher = picomatch(feature.paths);
    const touchedFiles = normalizedChangedFiles.filter((file) => matcher(file));
    if (touchedFiles.length === 0) {
      continue;
    }

    const severity = feature.status === "archived" ? "error" : "warning";
    const code =
      feature.status === "archived"
        ? "archived-feature-touched"
        : "deprecated-feature-touched";

    for (const file of touchedFiles) {
      issues.push({
        code,
        severity,
        message: `Changed file touches ${feature.status} feature "${feature.id}".`,
        file,
        featureId: feature.id
      });
    }
  }

  return {
    ...scan,
    mode: "ci",
    baseRef: options.baseRef,
    changedFiles: normalizedChangedFiles,
    issues,
    passed: issues.every((issue) => issue.severity !== "error")
  };
}

export async function getChangedFiles(
  cwd: string,
  baseRef = "origin/main"
): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRTUXB", `${baseRef}...HEAD`],
    { cwd }
  );

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
