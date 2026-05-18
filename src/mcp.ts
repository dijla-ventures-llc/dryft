import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import type { ChangePlan } from "./context.js";
import type { FeatureIndex } from "./types.js";

export interface RunMcpOptions {
  cwd: string;
  config?: string;
}

export async function runMcp(options: RunMcpOptions): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createMcpServer(options: RunMcpOptions): Server {
  let cachedIndex: FeatureIndex | undefined;

  async function ensureIndex(): Promise<FeatureIndex> {
    if (!cachedIndex) {
      const manifest = await loadManifest(options.cwd, options.config);
      cachedIndex = await buildFeatureIndex(options.cwd, manifest);
    }
    return cachedIndex;
  }

  const server = new Server(
    { name: "dryft", version: "0.3.0" },
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

      const plan = planChange(index, { intent, files });
      return structuredTextResult(toChangePlanReport(plan), plan);
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

function structuredTextResult(text: string, structuredContent: ChangePlan) {
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

function toChangePlanReport(plan: ChangePlan): string {
  const lines = [
    `# Dryft change plan: ${formatDecision(plan.decision)}`,
    "",
    `**Intent:** ${plan.intent}`,
    "",
    "## Files"
  ];

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
