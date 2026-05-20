import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import {
  buildFeatureIndex,
  featuresForFile,
  filesForFeature,
  getFeature,
  listFeatures,
  planChange,
  searchFeatures
} from "./context.js";
import { loadManifest } from "./manifest.js";
import {
  toContextFeatureReport,
  toContextFileReport,
  toContextListReport,
  toContextSearchReport
} from "./reporters.js";
import { getCurrentChangedFiles, verifyChange } from "./verify.js";
import type { ChangePlan } from "./context.js";
import type { FeatureIndex } from "./types.js";
import type { VerifyChangeResult } from "./verify.js";

const execFileAsync = promisify(execFile);

export interface RunMcpOptions {
  cwd: string;
  config?: string;
}

export interface DryftChangeContract {
  changeId: string;
  intent: string;
  plannedFiles: string[];
  featureIds: string[];
  createdAt: string;
}

type ChangePlanWithContract = ChangePlan & {
  changeId: string;
  contract: DryftChangeContract;
};

export async function runMcp(options: RunMcpOptions): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createMcpServer(options: RunMcpOptions): Server {
  const contracts = new Map<string, DryftChangeContract>();
  let contractCounter = 0;

  async function ensureIndex(): Promise<FeatureIndex> {
    const manifest = await loadManifest(options.cwd, options.config);
    return buildFeatureIndex(options.cwd, manifest);
  }

  const server = new Server(
    { name: "dryft", version: "0.4.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "dryft_list_features",
        description:
          "List all features tracked in the dryft manifest, including status, owner, and file counts.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "dryft_get_feature",
        description:
          "Get full details for a feature: status, owner, declared path globs, and member files.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Feature id, e.g. \"auth.magic-link.login\". Must exist in the manifest."
            }
          },
          required: ["id"]
        }
      },
      {
        name: "dryft_features_for_file",
        description:
          "List the features a given file belongs to via path globs. Use this before editing a file so you know which feature you are touching.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Repo-relative file path with POSIX separators, e.g. \"src/auth/login.ts\"."
            }
          },
          required: ["path"]
        }
      },
      {
        name: "dryft_files_for_feature",
        description:
          "List all files that belong to a feature by matching its path globs.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Feature id."
            }
          },
          required: ["id"]
        }
      },
      {
        name: "dryft_search_features",
        description:
          "Substring search across feature id, title, and owner. Use this when you do not yet know the exact feature id.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Substring to match (case-insensitive)."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "dryft_plan_change",
        description:
          "Plan a code change before editing by checking intended files against the Dryft feature map. Use this first when you know the goal and likely files.",
        inputSchema: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              description:
                "Short description of the intended change, e.g. \"Add password reset email flow\"."
            },
            files: {
              type: "array",
              minItems: 1,
              items: { type: "string" },
              description:
                "Repo-relative paths the agent expects to edit or create."
            }
          },
          required: ["intent", "files"]
        }
      },
      {
        name: "dryft_verify_change",
        description:
          "Verify actual git changes against the planned feature boundary before finalizing an AI code change.",
        inputSchema: {
          type: "object",
          properties: {
            changeId: {
              type: "string",
              description:
                "Change contract id returned by dryft_plan_change. When present, Dryft verifies against the saved plan."
            },
            intent: {
              type: "string",
              description:
                "Short description of the intended change. Required only when changeId is not provided."
            },
            plannedFiles: {
              type: "array",
              items: { type: "string" },
              description:
                "Repo-relative paths the agent planned to edit or create. Ignored when changeId is provided."
            },
            baseRef: {
              type: "string",
              description:
                "Optional git base ref for branch changes. Defaults to origin/main."
            }
          }
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = (args ?? {}) as Record<string, unknown>;
    const index = await ensureIndex();

    if (name === "dryft_list_features") {
      const summaries = listFeatures(index);
      return textResult(toContextListReport(summaries));
    }

    if (name === "dryft_get_feature") {
      const id = typeof params.id === "string" ? params.id : "";
      if (!id) {
        return errorResult("Missing required parameter: id");
      }
      const detail = getFeature(index, id);
      if (!detail) {
        return errorResult(`Unknown feature "${id}".`);
      }
      return textResult(toContextFeatureReport(detail));
    }

    if (name === "dryft_features_for_file") {
      const filePath = typeof params.path === "string" ? params.path : "";
      if (!filePath) {
        return errorResult("Missing required parameter: path");
      }
      const memberships = featuresForFile(index, filePath);
      return textResult(toContextFileReport(filePath, memberships));
    }

    if (name === "dryft_files_for_feature") {
      const id = typeof params.id === "string" ? params.id : "";
      if (!id) {
        return errorResult("Missing required parameter: id");
      }
      const files = filesForFeature(index, id);
      if (files.length === 0) {
        return textResult(
          `# Files for \`${id}\`\n\n_No files match this feature's path globs._\n`
        );
      }
      const lines = [`# Files for \`${id}\``, ""];
      for (const file of files) {
        lines.push(`- \`${file}\``);
      }
      return textResult(`${lines.join("\n")}\n`);
    }

    if (name === "dryft_search_features") {
      const query = typeof params.query === "string" ? params.query : "";
      if (!query) {
        return errorResult("Missing required parameter: query");
      }
      const results = searchFeatures(index, query);
      return textResult(toContextSearchReport(query, results));
    }

    if (name === "dryft_plan_change") {
      const intent = typeof params.intent === "string" ? params.intent : "";
      const files = Array.isArray(params.files)
        ? params.files.filter((file): file is string => typeof file === "string")
        : [];
      if (!intent.trim()) {
        return errorResult("Missing required parameter: intent");
      }
      if (files.length === 0) {
        return errorResult("Missing required parameter: files");
      }

      const plan = await withChangeContract(
        options.cwd,
        planChange(index, { intent, files }),
        contracts,
        () => createChangeId(++contractCounter)
      );
      return structuredTextResult(toChangePlanReport(plan), plan);
    }

    if (name === "dryft_verify_change") {
      const changeId =
        typeof params.changeId === "string" && params.changeId.trim()
          ? params.changeId.trim()
          : "";
      const contract = changeId
        ? await loadChangeContract(options.cwd, changeId, contracts)
        : undefined;
      if (changeId && !contract) {
        return errorResult(
          `Unknown Dryft changeId "${changeId}". Re-run dryft_plan_change or verify with intent and plannedFiles.`
        );
      }

      const intent =
        contract?.intent ?? (typeof params.intent === "string" ? params.intent : "");
      const plannedFiles = contract
        ? contract.plannedFiles
        : Array.isArray(params.plannedFiles)
        ? params.plannedFiles.filter((file): file is string => typeof file === "string")
        : undefined;
      const baseRef =
        typeof params.baseRef === "string" && params.baseRef.trim()
          ? params.baseRef
          : undefined;
      if (!intent.trim()) {
        return errorResult("Missing required parameter: intent or changeId");
      }

      const changedFiles = await getCurrentChangedFiles(options.cwd, baseRef);
      const verification = verifyChange(index, {
        intent,
        changeId: contract?.changeId,
        plannedFiles,
        changedFiles
      });
      return structuredVerifyResult(toVerifyChangeReport(verification), verification);
    }

    return errorResult(`Unknown tool: ${name}`);
  });

  return server;
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }]
  };
}

function structuredTextResult(text: string, structuredContent: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent
  };
}

function structuredVerifyResult(
  text: string,
  structuredContent: VerifyChangeResult
) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

function withChangeContract(
  cwd: string,
  plan: ChangePlan,
  contracts: Map<string, DryftChangeContract>,
  createId: () => string
): Promise<ChangePlanWithContract> {
  const contract: DryftChangeContract = {
    changeId: createId(),
    intent: plan.intent,
    plannedFiles: plan.files.map((file) => file.path),
    featureIds: plan.features.map((feature) => feature.id),
    createdAt: new Date().toISOString()
  };
  contracts.set(contract.changeId, contract);
  return saveChangeContract(cwd, contract).then(() => ({
    ...plan,
    changeId: contract.changeId,
    contract
  }));
}

function createChangeId(sequence: number): string {
  return `dryft_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

async function saveChangeContract(
  cwd: string,
  contract: DryftChangeContract
): Promise<void> {
  const directory = await getContractDirectory(cwd);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${contract.changeId}.json`),
    `${JSON.stringify(contract, null, 2)}\n`
  );
}

async function loadChangeContract(
  cwd: string,
  changeId: string,
  contracts: Map<string, DryftChangeContract>
): Promise<DryftChangeContract | undefined> {
  const cached = contracts.get(changeId);
  if (cached) {
    return cached;
  }
  if (!/^dryft_[a-z0-9_]+$/.test(changeId)) {
    return undefined;
  }

  try {
    const directory = await getContractDirectory(cwd);
    const raw = await readFile(path.join(directory, `${changeId}.json`), "utf8");
    const parsed = JSON.parse(raw) as Partial<DryftChangeContract>;
    if (!isDryftChangeContract(parsed) || parsed.changeId !== changeId) {
      return undefined;
    }
    contracts.set(parsed.changeId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

async function getContractDirectory(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--git-path", "dryft/contracts"],
      { cwd }
    );
    const gitPath = stdout.trim();
    return path.isAbsolute(gitPath) ? gitPath : path.join(cwd, gitPath);
  } catch {
    return path.join(cwd, ".dryft", "contracts");
  }
}

function isDryftChangeContract(
  value: Partial<DryftChangeContract>
): value is DryftChangeContract {
  return (
    typeof value.changeId === "string" &&
    typeof value.intent === "string" &&
    Array.isArray(value.plannedFiles) &&
    value.plannedFiles.every((file) => typeof file === "string") &&
    Array.isArray(value.featureIds) &&
    value.featureIds.every((featureId) => typeof featureId === "string") &&
    typeof value.createdAt === "string"
  );
}

function toChangePlanReport(plan: ChangePlan): string {
  const lines = [
    `# Dryft change plan: ${formatDecision(plan.decision)}`,
    "",
    `**Intent:** ${plan.intent}`,
    ""
  ];

  if ("changeId" in plan && typeof plan.changeId === "string") {
    lines.push(`**changeId:** \`${plan.changeId}\``, "");
  }

  lines.push(
    "## Files"
  );

  for (const file of plan.files) {
    const owner =
      file.ownership === "owned"
        ? file.featureIds.map((id) => `\`${id}\``).join(", ")
        : "_No matching feature_";
    lines.push(`- \`${file.path}\`: ${owner}`);
    if (file.suggestedPathGlob) {
      lines.push(`  - Suggested path glob: \`${file.suggestedPathGlob}\``);
    }
  }

  if (plan.features.length > 0) {
    lines.push("", "## Features");
    for (const feature of plan.features) {
      const owner = feature.owner ? `, owner: ${feature.owner}` : "";
      lines.push(
        `- \`${feature.id}\` (${feature.status}${owner}): ${feature.title}`
      );
    }
  }

  if (plan.risks.length > 0) {
    lines.push("", "## Risks");
    for (const risk of plan.risks) {
      lines.push(`- **${risk.severity}:** ${risk.message}`);
    }
  }

  if (plan.manifestSuggestions.length > 0) {
    lines.push("", "## Suggested dryft.yml patch");
    for (const suggestion of plan.manifestSuggestions) {
      lines.push(
        `For ${suggestion.files.map((file) => `\`${file}\``).join(", ")}:`,
        "",
        "```yaml",
        suggestion.yaml,
        "```"
      );
    }
  }

  lines.push("", "## Next Steps");
  for (const step of plan.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatDecision(decision: ChangePlan["decision"]): string {
  if (decision === "ready") {
    return "Ready to edit";
  }
  if (decision === "needs_review") {
    return "Needs review";
  }
  if (decision === "needs_manifest_update") {
    return "Needs manifest update";
  }
  return "Blocked by archived feature";
}

function toVerifyChangeReport(result: VerifyChangeResult): string {
  const lines = [
    `# Dryft verification: ${formatVerifyDecision(result.decision)}`,
    "",
    `**Intent:** ${result.intent}`,
    "",
    "## Planned Files",
    ...(result.plannedFiles.length > 0
      ? result.plannedFiles.map((file) => `- \`${file}\``)
      : ["_No planned file boundary was provided._"]),
    "",
    "## Actual Files",
    ...(result.actualFiles.length > 0
      ? result.actualFiles.map((file) => `- \`${file}\``)
      : ["_No git changes detected._"])
  ];

  lines.push("", "## Receipt", "```text", result.receipt.trimEnd(), "```");

  if (result.plannedFeatures.length > 0) {
    lines.push("", "## Planned Features");
    for (const feature of result.plannedFeatures) {
      lines.push(`- \`${feature.id}\` (${feature.status}): ${feature.title}`);
    }
  }

  if (result.actualFeatures.length > 0) {
    lines.push("", "## Actual Features");
    for (const feature of result.actualFeatures) {
      lines.push(`- \`${feature.id}\` (${feature.status}): ${feature.title}`);
    }
  }

  if (result.unplannedFiles.length > 0) {
    lines.push("", "## Unplanned Files");
    for (const file of result.unplannedFiles) {
      lines.push(`- \`${file}\``);
    }
  }

  if (result.unownedFiles.length > 0) {
    lines.push("", "## Unowned Files");
    for (const file of result.unownedFiles) {
      lines.push(`- \`${file}\``);
    }
  }

  if (result.manifestSuggestions.length > 0) {
    lines.push("", "## Suggested dryft.yml patch");
    for (const suggestion of result.manifestSuggestions) {
      lines.push(
        `For ${suggestion.files.map((file) => `\`${file}\``).join(", ")}:`,
        "",
        "```yaml",
        suggestion.yaml,
        "```"
      );
    }
  }

  if (result.risks.length > 0) {
    lines.push("", "## Risks");
    for (const risk of result.risks) {
      lines.push(`- **${risk.severity}:** ${risk.message}`);
    }
  }

  lines.push("", "## Next Steps");
  for (const step of result.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatVerifyDecision(decision: VerifyChangeResult["decision"]): string {
  if (decision === "verified") {
    return "Verified";
  }
  if (decision === "needs_review") {
    return "Needs review";
  }
  if (decision === "needs_manifest_update") {
    return "Needs manifest update";
  }
  return "Blocked by archived feature";
}
