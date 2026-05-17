export { evaluateCi, getChangedFiles } from "./ci.js";
export {
  buildFeatureIndex,
  computeFeatureIndex,
  featuresForFile,
  filesForFeature,
  getFeature,
  listFeatures,
  searchFeatures
} from "./context.js";
export { runInfer } from "./infer.js";
export { createAgentInstructions, createMcpConfig, createStarterManifest } from "./init.js";
export { isValidFeatureId, loadManifest, parseManifestContent } from "./manifest.js";
export { createMcpServer, runMcp } from "./mcp.js";
export {
  toContextFeatureReport,
  toContextFileReport,
  toContextListReport,
  toContextSearchReport,
  toJsonReport,
  toSarifReport,
  toTextReport
} from "./reporters.js";
export { scanRepository } from "./scanner.js";
export type {
  CiOptions,
  DryftFeature,
  DryftIssue,
  DryftManifest,
  DryftProject,
  DryftReport,
  FeatureDetail,
  FeatureIndex,
  FeatureIndexEntry,
  FeatureStatus,
  FeatureSummary,
  IssueSeverity,
  ReportMode,
  ScanOptions
} from "./types.js";
