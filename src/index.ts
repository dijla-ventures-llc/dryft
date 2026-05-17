// dryft:implements core.cli
export { evaluateCi, getChangedFiles } from "./ci.js";
export { createAgentInstructions, createGithubWorkflow, createStarterManifest } from "./init.js";
export { isValidFeatureId, loadManifest } from "./manifest.js";
export { parseMarkers } from "./markers.js";
export { toJsonReport, toSarifReport, toTextReport } from "./reporters.js";
export { scanRepository } from "./scanner.js";
export type {
  CiOptions,
  DryftFeature,
  DryftIssue,
  DryftManifest,
  DryftMarker,
  DryftProject,
  DryftReport,
  FeatureReferences,
  FeatureStatus,
  IssueSeverity,
  MarkerRole,
  ReportMode,
  ScanOptions
} from "./types.js";
