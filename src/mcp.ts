// dryft:implements core.mcp
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
  searchFeatures
} from "./context.js";
import { loadManifest } from "./manifest.js";
import {
  toContextFeatureReport,
  toContextFileReport,
  toContextListReport,
  toContextSearchReport
} from "./reporters.js";
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
    { name: "dryft", version: "0.2.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "dryft_list_features",
        description:
          "List all features tracked in the dryft manifest, including status, owner, and file/marker counts.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "dryft_get_feature",
        description:
          "Get full details for a feature: status, owner, declared path globs, member files (marker- or path-sourced), and per-role markers.",
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
          "List the features a given file belongs to (via marker comment or via path glob). Use this before editing a file so you know which feature you are touching.",
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
          "List all files that belong to a feature (union of marker- and path-sourced files).",
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
          `# Files for \`${id}\`\n\n_No files tracked for this feature._\n`
        );
      }
      const lines = [`# Files for \`${id}\``, ""];
      for (const file of files) {
        lines.push(`- \`${file.file}\` — ${file.source}`);
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

    return errorResult(`Unknown tool: ${name}`);
  });

  return server;
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }]
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}
