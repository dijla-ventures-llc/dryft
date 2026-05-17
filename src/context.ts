import picomatch from "picomatch";

import { listRepositoryFiles } from "./file-list.js";
import type {
  DryftManifest,
  FeatureDetail,
  FeatureIndex,
  FeatureIndexEntry,
  FeatureSummary
} from "./types.js";

export async function buildFeatureIndex(
  cwd: string,
  manifest: DryftManifest
): Promise<FeatureIndex> {
  const files = await listRepositoryFiles(cwd);
  return computeFeatureIndex(manifest, files);
}

export function computeFeatureIndex(
  manifest: DryftManifest,
  files: string[]
): FeatureIndex {
  const features: Record<string, FeatureIndexEntry> = {};
  const fileToFeatures = new Map<string, string[]>();

  for (const feature of manifest.features) {
    features[feature.id] = { feature, files: [] };
  }

  for (const feature of manifest.features) {
    if (!feature.paths || feature.paths.length === 0) {
      continue;
    }
    const matcher = picomatch(feature.paths);
    const entry = features[feature.id];
    for (const file of files) {
      if (matcher(file)) {
        entry.files.push(file);
        const existing = fileToFeatures.get(file);
        if (existing) {
          if (!existing.includes(feature.id)) {
            existing.push(feature.id);
          }
        } else {
          fileToFeatures.set(file, [feature.id]);
        }
      }
    }
  }

  for (const id of Object.keys(features)) {
    features[id].files = sortUnique(features[id].files);
  }

  return { manifest, features, fileToFeatures };
}

export function listFeatures(index: FeatureIndex): FeatureSummary[] {
  return Object.values(index.features)
    .map((entry) => ({
      id: entry.feature.id,
      title: entry.feature.title,
      status: entry.feature.status,
      owner: entry.feature.owner,
      fileCount: entry.files.length
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getFeature(
  index: FeatureIndex,
  id: string
): FeatureDetail | undefined {
  const entry = index.features[id];
  if (!entry) {
    return undefined;
  }
  return { feature: entry.feature, files: entry.files };
}

export function featuresForFile(
  index: FeatureIndex,
  filePath: string
): string[] {
  const memberships = index.fileToFeatures.get(filePath) ?? [];
  return [...memberships].sort((left, right) => left.localeCompare(right));
}

export function filesForFeature(index: FeatureIndex, id: string): string[] {
  return index.features[id]?.files ?? [];
}

export function searchFeatures(
  index: FeatureIndex,
  query: string
): FeatureSummary[] {
  const normalized = query.toLowerCase().trim();
  if (normalized.length === 0) {
    return [];
  }
  return listFeatures(index).filter((summary) => {
    if (summary.id.toLowerCase().includes(normalized)) return true;
    if (summary.title.toLowerCase().includes(normalized)) return true;
    if (summary.owner?.toLowerCase().includes(normalized)) return true;
    return false;
  });
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
