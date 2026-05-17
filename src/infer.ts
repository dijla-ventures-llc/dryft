// dryft:implements core.infer
import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { listRepositoryFiles } from "./file-list.js";
import { parseManifestContent } from "./manifest.js";

export const DEFAULT_INFER_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const MAX_FILES_IN_PROMPT = 600;

export interface InferOptions {
  cwd: string;
  model?: string;
  dryRun?: boolean;
  client?: AnthropicLike;
}

export interface InferResult {
  yaml: string;
  wrote: boolean;
  path?: string;
}

export interface AnthropicLike {
  messages: {
    create(params: AnthropicCreateParams): Promise<AnthropicMessageResponse>;
  };
}

interface AnthropicCreateParams {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function runInfer(options: InferOptions): Promise<InferResult> {
  const client = options.client ?? createDefaultClient();
  const files = await listRepositoryFiles(options.cwd);
  if (files.length === 0) {
    throw new Error("No files found in repo — nothing to infer from.");
  }

  const prompt = buildInferPrompt(options.cwd, files);
  const response = await client.messages.create({
    model: options.model ?? DEFAULT_INFER_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }]
  });

  const yaml = extractYaml(response);
  if (!yaml) {
    throw new Error(
      "Model returned no usable YAML. Re-run with --dry-run to inspect the raw response."
    );
  }

  parseManifestContent(yaml, path.join(options.cwd, "dryft.yml"));

  if (options.dryRun) {
    return { yaml, wrote: false };
  }

  const target = path.join(options.cwd, "dryft.yml");
  await writeFile(target, yaml, { flag: "wx" });
  return { yaml, wrote: true, path: target };
}

export function buildInferPrompt(cwd: string, files: string[]): string {
  const projectName = path.basename(cwd);
  const trimmedFiles = files.slice(0, MAX_FILES_IN_PROMPT);
  const truncatedNote =
    files.length > MAX_FILES_IN_PROMPT
      ? `\n(showing ${MAX_FILES_IN_PROMPT} of ${files.length} files)`
      : "";

  return [
    "You are bootstrapping a dryft.yml manifest for a code repository.",
    "",
    "dryft is a feature-index tool. A manifest declares logical 'features' in",
    "the codebase. Each feature has:",
    "  - id: lowercase hierarchical dot-separated, e.g. 'auth.magic-link.login'",
    "  - title: short human-readable name",
    "  - status: 'active' (use this for every feature you propose)",
    "  - paths: glob patterns matching files that belong to this feature",
    "",
    "GUIDELINES:",
    "  - Identify 3-10 features. Group related files; do not make a feature per file.",
    "  - Use names that describe user-visible capabilities or architectural",
    "    concerns (e.g., 'auth.login', 'billing.checkout', 'core.observability').",
    "  - Each feature should have at least one paths glob covering its files.",
    "  - Use glob syntax like 'src/auth/**'. Use lowercase ids with kebab-case",
    "    for multi-word segments.",
    "  - Do not invent files. Only group files that actually appear below.",
    "",
    `Project name: ${projectName}`,
    "",
    `Repo files:${truncatedNote}`,
    trimmedFiles.map((file) => `  - ${file}`).join("\n"),
    "",
    "OUTPUT FORMAT:",
    "Return ONLY valid YAML matching this exact shape. No explanation.",
    "No code fences. No prose before or after.",
    "",
    "project:",
    "  name: <Project>",
    "features:",
    "  - id: <feature-id>",
    "    title: <Title>",
    "    status: active",
    "    paths:",
    "      - <glob>"
  ].join("\n");
}

export function extractYaml(response: AnthropicMessageResponse): string {
  const text = response.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  return stripCodeFence(text);
}

function stripCodeFence(text: string): string {
  let trimmed = text.trim();
  const fencedOpen = trimmed.match(/^```(?:ya?ml)?\s*\n?/i);
  if (fencedOpen) {
    trimmed = trimmed.slice(fencedOpen[0].length);
    const closingIndex = trimmed.lastIndexOf("```");
    if (closingIndex !== -1) {
      trimmed = trimmed.slice(0, closingIndex);
    }
  }
  return trimmed.trim();
}

function createDefaultClient(): AnthropicLike {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for dryft init --infer. Get a key at https://console.anthropic.com and set it in your environment."
    );
  }
  return new Anthropic({ apiKey });
}
