export type FeatureStatus = "active" | "deprecated" | "archived";

export type MarkerRole = "implements" | "verifies" | "relates";

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

export interface DryftMarker {
  role: MarkerRole;
  featureId: string;
  file: string;
  line: number;
  column: number;
  raw: string;
}

export interface DryftIssue {
  code:
    | "invalid-manifest"
    | "unknown-feature"
    | "deprecated-feature"
    | "inactive-feature"
    | "missing-marker"
    | "missing-verification"
    | "path-affinity-mismatch";
  severity: IssueSeverity;
  message: string;
  file?: string;
  line?: number;
  featureId?: string;
}

export interface FeatureReferences {
  feature: DryftFeature;
  implements: DryftMarker[];
  verifies: DryftMarker[];
  relates: DryftMarker[];
}

export interface DryftReport {
  project: DryftProject;
  mode: ReportMode;
  passed: boolean;
  baseRef?: string;
  scannedFiles: number;
  changedFiles: string[];
  references: DryftMarker[];
  features: Record<string, FeatureReferences>;
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
