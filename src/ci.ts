import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import picomatch from "picomatch";

import {
  isSourceFile,
  listRepositoryFiles,
  normalizeInputFiles
} from "./file-list.js";
import { parseMarkers } from "./markers.js";
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
  const issues: DryftIssue[] = [...scan.issues];
  const changedMarkersByFeature = new Map<string, Set<string>>();

  for (const file of normalizedChangedFiles) {
    const absolutePath = path.join(options.cwd, file);
    let content: string;

    try {
      content = await readFile(absolutePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const markers = parseMarkers(content, file);

    if (isSourceFile(file) && markers.length === 0) {
      issues.push({
        code: "missing-marker",
        severity: "error",
        message: "Changed source file has no Dryft marker.",
        file
      });
      continue;
    }

    for (const marker of markers) {
      const feature = options.manifest.features.find(
        (candidate) => candidate.id === marker.featureId
      );
      if (!feature) {
        continue;
      }

      if (!changedMarkersByFeature.has(marker.featureId)) {
        changedMarkersByFeature.set(marker.featureId, new Set());
      }
      changedMarkersByFeature.get(marker.featureId)?.add(file);

      if (feature.paths?.length && !picomatch.isMatch(file, feature.paths)) {
        issues.push({
          code: "path-affinity-mismatch",
          severity: "warning",
          message: `Changed file is outside declared paths for feature "${marker.featureId}".`,
          file,
          line: marker.line,
          featureId: marker.featureId
        });
      }
    }
  }

  for (const featureId of changedMarkersByFeature.keys()) {
    const references = scan.features[featureId];
    if (references?.implements.length && references.verifies.length === 0) {
      issues.push({
        code: "missing-verification",
        severity: "warning",
        message: `Feature "${featureId}" has implementation references but no verification references.`,
        featureId
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
