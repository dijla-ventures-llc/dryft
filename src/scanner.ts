import { readFile } from "node:fs/promises";
import path from "node:path";

import { listRepositoryFiles, normalizeInputFiles } from "./file-list.js";
import { isValidFeatureId } from "./manifest.js";
import { parseMarkers } from "./markers.js";
import type {
  DryftIssue,
  DryftMarker,
  DryftReport,
  FeatureReferences,
  ScanOptions
} from "./types.js";

export async function scanRepository(options: ScanOptions): Promise<DryftReport> {
  const featureMap = createFeatureMap(options.manifest.features);
  const knownFeatureIds = new Set(Object.keys(featureMap));
  const files = options.files
    ? normalizeInputFiles(options.cwd, options.files)
    : await listRepositoryFiles(options.cwd);
  const references: DryftMarker[] = [];
  const issues: DryftIssue[] = [];

  for (const file of files) {
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
    references.push(...markers);

    for (const marker of markers) {
      if (!isValidFeatureId(marker.featureId)) {
        issues.push({
          code: "unknown-feature",
          severity: "error",
          message: `Marker references invalid feature id "${marker.featureId}".`,
          file: marker.file,
          line: marker.line,
          featureId: marker.featureId
        });
        continue;
      }

      if (!knownFeatureIds.has(marker.featureId)) {
        issues.push({
          code: "unknown-feature",
          severity: "error",
          message: `Marker references unknown feature "${marker.featureId}".`,
          file: marker.file,
          line: marker.line,
          featureId: marker.featureId
        });
        continue;
      }

      const featureReferences = featureMap[marker.featureId];
      featureReferences[marker.role].push(marker);

      if (featureReferences.feature.status === "deprecated") {
        issues.push({
          code: "deprecated-feature",
          severity: "warning",
          message: `Marker references deprecated feature "${marker.featureId}".`,
          file: marker.file,
          line: marker.line,
          featureId: marker.featureId
        });
      }

      if (featureReferences.feature.status === "archived") {
        issues.push({
          code: "inactive-feature",
          severity: "error",
          message: `Marker references archived feature "${marker.featureId}".`,
          file: marker.file,
          line: marker.line,
          featureId: marker.featureId
        });
      }
    }
  }

  return {
    project: options.manifest.project,
    mode: "scan",
    passed: issues.every((issue) => issue.severity !== "error"),
    scannedFiles: files.length,
    changedFiles: [],
    references,
    features: featureMap,
    issues
  };
}

function createFeatureMap(
  features: ScanOptions["manifest"]["features"]
): Record<string, FeatureReferences> {
  return Object.fromEntries(
    features.map((feature) => [
      feature.id,
      {
        feature,
        implements: [],
        verifies: [],
        relates: []
      }
    ])
  );
}
