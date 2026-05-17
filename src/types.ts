export type FeatureStatus = "active" | "deprecated" | "archived";

export type ReportMode = "scan" | "ci";

export type IssueSeverity = "error" | "warning";

export interface DryftProject {
  name?: string;
}

export interface DryftFeature {
  id: string;
  title: string;
  status: FeatureStatus;
  owner?: string;
  paths?: string[];
}

export interface DryftManifest {
  project: DryftProject;
  features: DryftFeature[];
  path: string;
}

export interface DryftIssue {
  code:
    | "invalid-manifest"
    | "deprecated-feature-touched"
    | "archived-feature-touched";
  severity: IssueSeverity;
  message: string;
  file?: string;
  featureId?: string;
}

export interface FeatureSummary {
  id: string;
  title: string;
  status: FeatureStatus;
  owner?: string;
  fileCount: number;
}

export interface FeatureDetail {
  feature: DryftFeature;
  files: string[];
}

export interface FeatureIndexEntry {
  feature: DryftFeature;
  files: string[];
}

export interface FeatureIndex {
  manifest: DryftManifest;
  features: Record<string, FeatureIndexEntry>;
  fileToFeatures: Map<string, string[]>;
}

export interface DryftReport {
  project: DryftProject;
  mode: ReportMode;
  passed: boolean;
  baseRef?: string;
  scannedFiles: number;
  changedFiles: string[];
  features: Record<string, FeatureSummary>;
  issues: DryftIssue[];
}

export interface ScanOptions {
  cwd: string;
  manifest: DryftManifest;
  files?: string[];
}

export interface CiOptions {
  cwd: string;
  manifest: DryftManifest;
  baseRef?: string;
  changedFiles?: string[];
}
