import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  featuresForFile,
  mergeManifestPatchSuggestions,
  suggestManifestPatch,
  type ChangePlanFeature,
  type ManifestPatchSuggestion
} from "./context.js";
import { toPosixPath } from "./path-utils.js";
import type { DryftFeature, FeatureIndex } from "./types.js";

const execFileAsync = promisify(execFile);

export type VerifyChangeDecision =
  | "verified"
  | "needs_review"
  | "needs_manifest_update"
  | "blocked_archived";

export type VerifyChangeRiskCode =
  | "unplanned_file"
  | "unexpected_feature"
  | "unowned_file"
  | "deprecated_feature"
  | "archived_feature"
  | "cross_feature_change";

export interface VerifyChangeOptions {
  intent: string;
  changeId?: string;
  plannedFiles?: string[];
  changedFiles: string[];
}

export interface VerifyChangeRisk {
  code: VerifyChangeRiskCode;
  severity: "warning" | "error";
  message: string;
  file?: string;
  featureId?: string;
}

export interface VerifyChangeResult {
  changeId?: string;
  intent: string;
  decision: VerifyChangeDecision;
  plannedFiles: string[];
  actualFiles: string[];
  plannedFeatures: ChangePlanFeature[];
  actualFeatures: ChangePlanFeature[];
  unexpectedFeatures: ChangePlanFeature[];
  unplannedFiles: string[];
  unownedFiles: string[];
  manifestSuggestions: ManifestPatchSuggestion[];
  risks: VerifyChangeRisk[];
  nextSteps: string[];
  receipt: string;
}

type VerifyChangeResultWithoutReceipt = Omit<VerifyChangeResult, "receipt">;

export function verifyChange(
  index: FeatureIndex,
  options: VerifyChangeOptions
): VerifyChangeResult {
  const intent = options.intent.trim();
  const plannedFiles = normalizeFiles(options.plannedFiles ?? []);
  const actualFiles = normalizeFiles(options.changedFiles);
  const plannedFeatureIds = collectFeatureIds(index, plannedFiles);
  const actualFeatureIds = collectFeatureIds(index, actualFiles);
  const risks: VerifyChangeRisk[] = [];
  const hasPlannedBoundary = plannedFiles.length > 0;

  const unplannedFiles = hasPlannedBoundary
    ? actualFiles.filter((file) => !plannedFiles.includes(file))
    : [];
  for (const file of unplannedFiles) {
    risks.push({
      code: "unplanned_file",
      severity: "warning",
      message: `\`${file}\` changed but was not in the planned file list.`,
      file
    });
  }

  const unownedFiles = actualFiles.filter(
    (file) => featuresForFile(index, file).length === 0
  );
  for (const file of unownedFiles) {
    risks.push({
      code: "unowned_file",
      severity: "warning",
      message: `\`${file}\` changed but is not covered by dryft.yml.`,
      file
    });
  }

  const unexpectedFeatureIds =
    hasPlannedBoundary && plannedFeatureIds.length > 0
      ? actualFeatureIds.filter((featureId) => !plannedFeatureIds.includes(featureId))
      : [];
  for (const featureId of unexpectedFeatureIds) {
    risks.push({
      code: "unexpected_feature",
      severity: "warning",
      message: `Actual changes touched unexpected feature \`${featureId}\`.`,
      featureId
    });
  }

  for (const file of actualFiles) {
    for (const featureId of featuresForFile(index, file)) {
      const feature = index.features[featureId].feature;
      if (feature.status === "deprecated") {
        risks.push({
          code: "deprecated_feature",
          severity: "warning",
          message: `\`${file}\` touches deprecated feature \`${feature.id}\`.`,
          file,
          featureId: feature.id
        });
      }
      if (feature.status === "archived") {
        risks.push({
          code: "archived_feature",
          severity: "error",
          message: `\`${file}\` touches archived feature \`${feature.id}\`.`,
          file,
          featureId: feature.id
        });
      }
    }
  }

  if (actualFeatureIds.length > 1) {
    risks.push({
      code: "cross_feature_change",
      severity: "warning",
      message: `Actual changes span ${actualFeatureIds.length} features: ${formatFeatureList(actualFeatureIds)}.`
    });
  }

  const decision = decideVerification(risks);
  const manifestSuggestions = mergeManifestPatchSuggestions(
    unownedFiles.map((file) => suggestManifestPatch(file))
  );

  const result: VerifyChangeResultWithoutReceipt = {
    changeId: options.changeId,
    intent,
    decision,
    plannedFiles,
    actualFiles,
    plannedFeatures: plannedFeatureIds.map((id) =>
      toChangePlanFeature(index.features[id].feature)
    ),
    actualFeatures: actualFeatureIds.map((id) =>
      toChangePlanFeature(index.features[id].feature)
    ),
    unexpectedFeatures: unexpectedFeatureIds.map((id) =>
      toChangePlanFeature(index.features[id].feature)
    ),
    unplannedFiles,
    unownedFiles,
    manifestSuggestions,
    risks,
    nextSteps: buildVerifyNextSteps(decision, risks)
  };

  return {
    ...result,
    receipt: buildVerificationReceipt(result)
  };
}

export async function getCurrentChangedFiles(
  cwd: string,
  baseRef = "origin/main"
): Promise<string[]> {
  const groups = await Promise.all([
    getGitFiles(cwd, ["diff", "--name-only", "--diff-filter=ACMRTUXB", `${baseRef}...HEAD`]),
    getGitFiles(cwd, ["diff", "--name-only", "--diff-filter=ACMRTUXB"]),
    getGitFiles(cwd, ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"]),
    getGitFiles(cwd, ["ls-files", "--others", "--exclude-standard"])
  ]);

  return normalizeFiles(groups.flat());
}

function normalizeFiles(files: string[]): string[] {
  return [...new Set(files.map((file) => toPosixPath(file).trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function collectFeatureIds(index: FeatureIndex, files: string[]): string[] {
  return [
    ...new Set(files.flatMap((file) => featuresForFile(index, file)))
  ].sort((left, right) => left.localeCompare(right));
}

async function getGitFiles(cwd: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
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

function decideVerification(risks: VerifyChangeRisk[]): VerifyChangeDecision {
  if (risks.some((risk) => risk.code === "archived_feature")) {
    return "blocked_archived";
  }
  if (risks.some((risk) => risk.code === "unowned_file")) {
    return "needs_manifest_update";
  }
  if (risks.length > 0) {
    return "needs_review";
  }
  return "verified";
}

function buildVerifyNextSteps(
  decision: VerifyChangeDecision,
  risks: VerifyChangeRisk[]
): string[] {
  if (decision === "blocked_archived") {
    return [
      "Stop before finalizing this change.",
      "Get explicit approval before shipping archived feature edits."
    ];
  }
  if (decision === "needs_manifest_update") {
    return [
      "Update dryft.yml so every changed file is owned by a feature.",
      "Re-run dryft_verify_change before final response."
    ];
  }
  if (decision === "needs_review") {
    const steps: string[] = [];
    if (
      risks.some(
        (risk) =>
          risk.code === "unplanned_file" || risk.code === "unexpected_feature"
      )
    ) {
      steps.push("Explain why the actual changed files differ from the plan.");
    }
    if (risks.some((risk) => risk.code === "unexpected_feature")) {
      steps.push("Call out unexpected feature areas in the final summary.");
    }
    if (risks.some((risk) => risk.code === "cross_feature_change")) {
      steps.push("Summarize the cross-feature impact before finishing.");
    }
    if (risks.some((risk) => risk.code === "deprecated_feature")) {
      steps.push("Call out deprecated feature impact explicitly.");
    }
    if (steps.length === 0) {
      steps.push("Review the verification risks before finishing.");
    }
    return steps;
  }
  return [
    "The actual changed files match the planned feature boundary.",
    "Summarize the verified feature IDs in the final response."
  ];
}

function formatFeatureList(featureIds: string[]): string {
  return featureIds.map((featureId) => `\`${featureId}\``).join(", ");
}

function buildVerificationReceipt(result: VerifyChangeResultWithoutReceipt): string {
  const lines = [
    `Dryft Receipt: ${result.decision}`,
    `Intent: ${result.intent}`
  ];

  if (result.changeId) {
    lines.push(`Change ID: ${result.changeId}`);
  }

  lines.push(
    `Planned features: ${formatReceiptValues(
      result.plannedFeatures.map((feature) => feature.id)
    )}`,
    `Actual features: ${formatReceiptValues(
      result.actualFeatures.map((feature) => feature.id)
    )}`,
    `Planned files: ${formatReceiptValues(result.plannedFiles)}`,
    `Actual files: ${formatReceiptValues(result.actualFiles)}`
  );

  if (result.unplannedFiles.length > 0) {
    lines.push(`Unplanned files: ${formatReceiptValues(result.unplannedFiles)}`);
  }

  if (result.unownedFiles.length > 0) {
    lines.push(`Unowned files: ${formatReceiptValues(result.unownedFiles)}`);
  }

  if (result.manifestSuggestions.length > 0) {
    lines.push(
      `Manifest suggestions: ${formatReceiptValues(
        result.manifestSuggestions.map((suggestion) => suggestion.featureId)
      )}`
    );
  }

  if (result.unexpectedFeatures.length > 0) {
    lines.push(
      `Unexpected features: ${formatReceiptValues(
        result.unexpectedFeatures.map((feature) => feature.id)
      )}`
    );
  }

  lines.push(`Required: ${result.nextSteps.join(" ")}`);

  return `${lines.join("\n")}\n`;
}

function formatReceiptValues(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
