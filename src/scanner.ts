import picomatch from "picomatch";

import { listRepositoryFiles, normalizeInputFiles } from "./file-list.js";
import type {
  DryftReport,
  FeatureSummary,
  ScanOptions
} from "./types.js";

export async function scanRepository(options: ScanOptions): Promise<DryftReport> {
  const files = options.files
    ? normalizeInputFiles(options.cwd, options.files)
    : await listRepositoryFiles(options.cwd);

  const featureSummaries: Record<string, FeatureSummary> = {};

  for (const feature of options.manifest.features) {
    let fileCount = 0;
    if (feature.paths && feature.paths.length > 0) {
      const matcher = picomatch(feature.paths);
      for (const file of files) {
        if (matcher(file)) {
          fileCount += 1;
        }
      }
    }
    featureSummaries[feature.id] = {
      id: feature.id,
      title: feature.title,
      status: feature.status,
      owner: feature.owner,
      fileCount
    };
  }

  return {
    project: options.manifest.project,
    mode: "scan",
    passed: true,
    scannedFiles: files.length,
    changedFiles: [],
    features: featureSummaries,
    issues: []
  };
}
