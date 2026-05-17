import type {
  DryftIssue,
  DryftReport,
  FeatureDetail,
  FeatureSummary
} from "./types.js";

export function toJsonReport(report: DryftReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function toTextReport(report: DryftReport): string {
  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter((issue) => issue.severity === "warning");
  const title =
    report.mode === "ci"
      ? `Dryft CI ${report.passed ? "passed" : "failed"}`
      : `Dryft scan ${report.passed ? "passed" : "failed"}`;
  const lines = [
    title,
    `Project: ${report.project.name ?? "unnamed"}`,
    `Scanned files: ${report.scannedFiles}`,
    `Features: ${Object.keys(report.features).length}`,
    `Issues: ${countLabel(errors.length, "error")}, ${countLabel(
      warnings.length,
      "warning"
    )}`
  ];

  if (report.changedFiles.length) {
    lines.push(`Changed files: ${report.changedFiles.length}`);
  }

  for (const issue of report.issues) {
    lines.push(formatIssue(issue));
  }

  return `${lines.join("\n")}\n`;
}

export function toSarifReport(report: DryftReport): string {
  const rules = [...new Set(report.issues.map((issue) => issue.code))].map(
    (code) => ({
      id: code,
      shortDescription: { text: code }
    })
  );

  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "Dryft",
              informationUri: "https://github.com/dijla-ventures-llc/dryft",
              rules
            }
          },
          results: report.issues.map((issue) => ({
            ruleId: issue.code,
            level: issue.severity === "error" ? "error" : "warning",
            message: { text: issue.message },
            locations: issue.file
              ? [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: issue.file }
                    }
                  }
                ]
              : []
          }))
        }
      ]
    },
    null,
    2
  )}\n`;
}

export function toContextListReport(summaries: FeatureSummary[]): string {
  if (summaries.length === 0) {
    return "# Features\n\nNo features defined in the manifest.\n";
  }
  const lines = [
    "# Features",
    "",
    `${summaries.length} feature${summaries.length === 1 ? "" : "s"} tracked in this repo.`,
    "",
    "| ID | Status | Title | Files | Owner |",
    "|---|---|---|---|---|"
  ];
  for (const summary of summaries) {
    lines.push(
      `| \`${summary.id}\` | ${summary.status} | ${summary.title} | ${summary.fileCount} | ${summary.owner ?? "-"} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

export function toContextFeatureReport(detail: FeatureDetail): string {
  const lines = [`# \`${detail.feature.id}\``, ""];
  lines.push(`- **Status:** ${detail.feature.status}`);
  lines.push(`- **Title:** ${detail.feature.title}`);
  if (detail.feature.owner) {
    lines.push(`- **Owner:** ${detail.feature.owner}`);
  }
  if (detail.feature.paths && detail.feature.paths.length > 0) {
    lines.push(
      `- **Paths:** ${detail.feature.paths.map((entry) => `\`${entry}\``).join(", ")}`
    );
  }

  lines.push("", `## Files (${detail.files.length})`, "");
  if (detail.files.length === 0) {
    lines.push("_No files match this feature's path globs._");
  } else {
    for (const file of detail.files) {
      lines.push(`- \`${file}\``);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function toContextFileReport(
  filePath: string,
  featureIds: string[]
): string {
  const lines = [`# \`${filePath}\``, ""];
  if (featureIds.length === 0) {
    lines.push("This file is not part of any tracked feature.");
    return `${lines.join("\n")}\n`;
  }
  lines.push("This file is part of:", "");
  for (const id of featureIds) {
    lines.push(`- \`${id}\``);
  }
  return `${lines.join("\n")}\n`;
}

export function toContextSearchReport(
  query: string,
  summaries: FeatureSummary[]
): string {
  const lines = [`# Search: \`${query}\``, ""];
  if (summaries.length === 0) {
    lines.push("No features match this query.");
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    `Found ${summaries.length} match${summaries.length === 1 ? "" : "es"}.`,
    "",
    "| ID | Status | Title | Owner |",
    "|---|---|---|---|"
  );
  for (const summary of summaries) {
    lines.push(
      `| \`${summary.id}\` | ${summary.status} | ${summary.title} | ${summary.owner ?? "-"} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatIssue(issue: DryftIssue): string {
  const location = issue.file ? `${issue.file}: ` : "";
  return `[${issue.severity}] ${issue.code}: ${location}${issue.message}`;
}
