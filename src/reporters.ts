import type { DryftIssue, DryftReport } from "./types.js";

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
    `References: ${report.references.length}`,
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
      $schema:
        "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "Dryft",
              informationUri: "https://github.com/dijla-ventures/dryft",
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
                      artifactLocation: { uri: issue.file },
                      region: {
                        startLine: issue.line ?? 1
                      }
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

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatIssue(issue: DryftIssue): string {
  const location = issue.file
    ? `${issue.file}${issue.line ? `:${issue.line}` : ""}: `
    : "";

  return `[${issue.severity}] ${issue.code}: ${location}${issue.message}`;
}
