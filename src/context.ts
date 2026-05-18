import picomatch from "picomatch";

import { listRepositoryFiles } from "./file-list.js";
import { toPosixPath } from "./path-utils.js";
import type {
  DryftManifest,
  DryftFeature,
  FeatureDetail,
  FeatureIndex,
  FeatureIndexEntry,
  FeatureStatus,
  FeatureSummary
} from "./types.js";

export type ChangePlanDecision =
  | "ready"
  | "needs_review"
  | "needs_manifest_update"
  | "blocked_archived";

export type ChangePlanRiskCode =
  | "unowned_file"
  | "deprecated_feature"
  | "archived_feature"
  | "cross_feature_change";

export interface ChangePlanOptions {
  intent: string;
  files: string[];
}

export interface ChangePlanFile {
  path: string;
  ownership: "owned" | "unowned";
  featureIds: string[];
  status: FeatureStatus | "mixed" | "unowned";
  suggestedPathGlob?: string;
  guidance: string;
}

export interface ChangePlanFeature {
  id: string;
  title: string;
  status: FeatureStatus;
  owner?: string;
  paths: string[];
}

export interface ChangePlanRisk {
  code: ChangePlanRiskCode;
  severity: "warning" | "error";
  message: string;
  file?: string;
  featureId?: string;
}

export interface ChangePlan {
  intent: string;
  decision: ChangePlanDecision;
  files: ChangePlanFile[];
  features: ChangePlanFeature[];
  risks: ChangePlanRisk[];
  nextSteps: string[];
}

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
  const normalizedPath = toPosixPath(filePath);
  const memberships = new Set(index.fileToFeatures.get(normalizedPath) ?? []);

  for (const entry of Object.values(index.features)) {
    if (!entry.feature.paths || entry.feature.paths.length === 0) {
      continue;
    }

    if (picomatch(entry.feature.paths)(normalizedPath)) {
      memberships.add(entry.feature.id);
    }
  }

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

export function planChange(
  index: FeatureIndex,
  options: ChangePlanOptions
): ChangePlan {
  const intent = options.intent.trim();
  const normalizedFiles = sortUnique(
    options.files.map((file) => toPosixPath(file).trim()).filter(Boolean)
  );
  const risks: ChangePlanRisk[] = [];
  const touchedFeatureIds = new Set<string>();

  const plannedFiles = normalizedFiles.map((filePath): ChangePlanFile => {
    const featureIds = featuresForFile(index, filePath);
    for (const featureId of featureIds) {
      touchedFeatureIds.add(featureId);
    }

    if (featureIds.length === 0) {
      const suggestedPathGlob = suggestPathGlob(filePath);
      risks.push({
        code: "unowned_file",
        severity: "warning",
        message: `No Dryft feature owns \`${filePath}\`. Add or update a feature path glob before editing.`,
        file: filePath
      });
      return {
        path: filePath,
        ownership: "unowned",
        featureIds: [],
        status: "unowned",
        suggestedPathGlob,
        guidance: `No feature matches this path. Consider adding \`${suggestedPathGlob}\` to the correct feature in dryft.yml.`
      };
    }

    const statuses = featureIds.map((featureId) => index.features[featureId].feature.status);
    const status = summarizeStatuses(statuses);

    for (const featureId of featureIds) {
      const feature = index.features[featureId].feature;
      if (feature.status === "deprecated") {
        risks.push({
          code: "deprecated_feature",
          severity: "warning",
          message: `\`${filePath}\` touches deprecated feature \`${feature.id}\`; call this out before editing.`,
          file: filePath,
          featureId: feature.id
        });
      }
      if (feature.status === "archived") {
        risks.push({
          code: "archived_feature",
          severity: "error",
          message: `\`${filePath}\` touches archived feature \`${feature.id}\`; do not edit without explicit approval.`,
          file: filePath,
          featureId: feature.id
        });
      }
    }

    return {
      path: filePath,
      ownership: "owned",
      featureIds,
      status,
      guidance: `This file belongs to ${formatFeatureList(featureIds)}. Keep the change aligned with that feature boundary.`
    };
  });

  if (touchedFeatureIds.size > 1) {
    risks.push({
      code: "cross_feature_change",
      severity: "warning",
      message: `This plan spans ${touchedFeatureIds.size} features: ${formatFeatureList([...touchedFeatureIds].sort())}. Keep the scope intentional and mention the cross-feature impact.`
    });
  }

  const features = [...touchedFeatureIds]
    .sort((left, right) => left.localeCompare(right))
    .map((featureId) => toChangePlanFeature(index.features[featureId].feature));
  const decision = decideChangePlan(risks);

  return {
    intent,
    decision,
    files: plannedFiles,
    features,
    risks,
    nextSteps: buildNextSteps(decision, features, risks)
  };
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function toChangePlanFeature(feature: DryftFeature): ChangePlanFeature {
  return {
    id: feature.id,
    title: feature.title,
    status: feature.status,
    owner: feature.owner,
    paths: feature.paths ?? []
  };
}

function summarizeStatuses(statuses: FeatureStatus[]): FeatureStatus | "mixed" {
  const unique = [...new Set(statuses)];
  return unique.length === 1 ? unique[0] : "mixed";
}

function decideChangePlan(risks: ChangePlanRisk[]): ChangePlanDecision {
  if (risks.some((risk) => risk.code === "archived_feature")) {
    return "blocked_archived";
  }
  if (risks.some((risk) => risk.code === "unowned_file")) {
    return "needs_manifest_update";
  }
  if (
    risks.some(
      (risk) =>
        risk.code === "deprecated_feature" ||
        risk.code === "cross_feature_change"
    )
  ) {
    return "needs_review";
  }
  return "ready";
}

function buildNextSteps(
  decision: ChangePlanDecision,
  features: ChangePlanFeature[],
  risks: ChangePlanRisk[]
): string[] {
  const featureIds = features.map((feature) => feature.id);
  if (decision === "blocked_archived") {
    return [
      "Stop before editing archived feature code.",
      "Ask for explicit human approval or move the work to an active feature."
    ];
  }
  if (decision === "needs_manifest_update") {
    return [
      "Update dryft.yml so every planned file belongs to a feature before editing.",
      "Re-run dryft_plan_change after updating the feature map."
    ];
  }
  if (decision === "needs_review") {
    const steps = [
      `Proceed carefully and name the touched feature IDs in the plan: ${formatFeatureList(featureIds)}.`
    ];
    if (risks.some((risk) => risk.code === "deprecated_feature")) {
      steps.push("Call out deprecated feature impact before editing.");
    }
    if (risks.some((risk) => risk.code === "cross_feature_change")) {
      steps.push("Keep the cross-feature scope intentional and summarize why it is needed.");
    }
    return steps;
  }
  return [
    `Proceed with the edit inside ${formatFeatureList(featureIds)}.`,
    "Summarize the touched feature IDs when finished."
  ];
}

function suggestPathGlob(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return filePath;
  }
  return `${parts[0]}/**`;
}

function formatFeatureList(featureIds: string[]): string {
  if (featureIds.length === 0) {
    return "no Dryft feature";
  }
  return featureIds.map((featureId) => `\`${featureId}\``).join(", ");
}
