// dryft:implements core.context
import picomatch from "picomatch";

import { listRepositoryFiles } from "./file-list.js";
import { scanRepository } from "./scanner.js";
import type {
  DryftManifest,
  DryftMarker,
  FeatureDetail,
  FeatureIndex,
  FeatureIndexEntry,
  FeatureMembership,
  FeatureSummary,
  FileMembership
} from "./types.js";

export async function buildFeatureIndex(
  cwd: string,
  manifest: DryftManifest
): Promise<FeatureIndex> {
  const files = await listRepositoryFiles(cwd);
  const scan = await scanRepository({ cwd, manifest, files });
  return computeFeatureIndex(manifest, files, scan.references);
}

export function computeFeatureIndex(
  manifest: DryftManifest,
  files: string[],
  markers: DryftMarker[]
): FeatureIndex {
  const features: Record<string, FeatureIndexEntry> = {};
  const fileToFeatures = new Map<string, FeatureMembership[]>();

  for (const feature of manifest.features) {
    features[feature.id] = {
      feature,
      markerFiles: [],
      pathFiles: [],
      allFiles: [],
      markers: []
    };
  }

  const markerFilesByFeature = new Map<string, Set<string>>();
  for (const marker of markers) {
    const entry = features[marker.featureId];
    if (!entry) {
      continue;
    }
    entry.markers.push(marker);
    let set = markerFilesByFeature.get(marker.featureId);
    if (!set) {
      set = new Set();
      markerFilesByFeature.set(marker.featureId, set);
    }
    set.add(marker.file);
    addMembership(fileToFeatures, marker.file, {
      featureId: marker.featureId,
      source: "marker"
    });
  }

  for (const feature of manifest.features) {
    if (!feature.paths || feature.paths.length === 0) {
      continue;
    }
    const entry = features[feature.id];
    for (const file of files) {
      if (picomatch.isMatch(file, feature.paths)) {
        entry.pathFiles.push(file);
        if (!hasMembership(fileToFeatures, file, feature.id)) {
          addMembership(fileToFeatures, file, {
            featureId: feature.id,
            source: "path"
          });
        }
      }
    }
  }

  for (const featureId of Object.keys(features)) {
    const entry = features[featureId];
    entry.markerFiles = sortUnique(
      Array.from(markerFilesByFeature.get(featureId) ?? [])
    );
    entry.pathFiles = sortUnique(entry.pathFiles);
    entry.allFiles = sortUnique([...entry.markerFiles, ...entry.pathFiles]);
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
      fileCount: entry.allFiles.length,
      markerCount: entry.markers.length
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

  const markerFileSet = new Set(entry.markerFiles);
  const files: FileMembership[] = [
    ...entry.markerFiles.map((file): FileMembership => ({
      file,
      source: "marker"
    })),
    ...entry.pathFiles
      .filter((file) => !markerFileSet.has(file))
      .map((file): FileMembership => ({ file, source: "path" }))
  ];

  return {
    feature: entry.feature,
    files: files.sort((left, right) => left.file.localeCompare(right.file)),
    markers: {
      implements: entry.markers.filter((marker) => marker.role === "implements"),
      verifies: entry.markers.filter((marker) => marker.role === "verifies"),
      relates: entry.markers.filter((marker) => marker.role === "relates")
    }
  };
}

export function featuresForFile(
  index: FeatureIndex,
  filePath: string
): FeatureMembership[] {
  const memberships = index.fileToFeatures.get(filePath) ?? [];
  return [...memberships].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "marker" ? -1 : 1;
    }
    return left.featureId.localeCompare(right.featureId);
  });
}

export function filesForFeature(
  index: FeatureIndex,
  id: string
): FileMembership[] {
  const detail = getFeature(index, id);
  return detail?.files ?? [];
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

function addMembership(
  map: Map<string, FeatureMembership[]>,
  file: string,
  membership: FeatureMembership
): void {
  const list = map.get(file);
  if (!list) {
    map.set(file, [membership]);
    return;
  }
  const duplicate = list.some(
    (existing) =>
      existing.featureId === membership.featureId &&
      existing.source === membership.source
  );
  if (!duplicate) {
    list.push(membership);
  }
}

function hasMembership(
  map: Map<string, FeatureMembership[]>,
  file: string,
  featureId: string
): boolean {
  const list = map.get(file);
  if (!list) return false;
  return list.some((existing) => existing.featureId === featureId);
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
