#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateCi } from "./ci.js";
import {
  buildFeatureIndex,
  featuresForFile,
  getFeature,
  listFeatures,
  searchFeatures
} from "./context.js";
import { runInfer } from "./infer.js";
import {
  createAgentInstructions,
  createMcpConfig,
  createStarterManifest
} from "./init.js";
import { loadManifest } from "./manifest.js";
import { runMcp } from "./mcp.js";
import {
  toContextFeatureReport,
  toContextFileReport,
  toContextListReport,
  toContextSearchReport,
  toJsonReport,
  toSarifReport,
  toTextReport
} from "./reporters.js";
import { scanRepository } from "./scanner.js";
import type { DryftReport } from "./types.js";

type OutputFormat = "text" | "json" | "sarif";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (command === "init") {
    await runInit(args.slice(1));
  } else if (command === "scan") {
    await runScan(args.slice(1));
  } else if (command === "ci") {
    await runCi(args.slice(1));
  } else if (command === "context") {
    await runContext(args.slice(1));
  } else if (command === "mcp") {
    await runMcpCommand(args.slice(1));
  } else {
    printHelp();
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function runInit(rawArgs: string[]): Promise<void> {
  const options = parseOptions(rawArgs);
  const cwd = process.cwd();
  const isInfer = "infer" in options;
  const isDryRun = "dry-run" in options;

  if (isInfer) {
    const result = await runInfer({
      cwd,
      model: options.model || undefined,
      dryRun: isDryRun
    });
    if (isDryRun) {
      process.stdout.write(result.yaml);
      if (!result.yaml.endsWith("\n")) {
        process.stdout.write("\n");
      }
      console.error("(--dry-run: dryft.yml was not written)");
      return;
    }
    console.log(`Wrote ${result.path}. Review before committing.`);
    await writeIfAbsent(path.join(cwd, "AGENTS.md"), createAgentInstructions());
    await writeIfAbsent(path.join(cwd, ".mcp.json"), createMcpConfig());
    console.log("Dryft initialized.");
    return;
  }

  const projectName = options.project ?? path.basename(cwd);

  await writeIfAbsent(path.join(cwd, "dryft.yml"), createStarterManifest(projectName));
  await writeIfAbsent(path.join(cwd, "AGENTS.md"), createAgentInstructions());
  await writeIfAbsent(path.join(cwd, ".mcp.json"), createMcpConfig());

  console.log("Dryft initialized.");
}

async function runScan(rawArgs: string[]): Promise<void> {
  const options = parseOptions(rawArgs);
  const manifest = await loadManifest(process.cwd(), options.config);
  const report = await scanRepository({ cwd: process.cwd(), manifest });

  printReport(report, parseFormat(options.format));
  process.exitCode = report.passed ? 0 : 1;
}

async function runCi(rawArgs: string[]): Promise<void> {
  const options = parseOptions(rawArgs);
  const manifest = await loadManifest(process.cwd(), options.config);
  const report = await evaluateCi({
    cwd: process.cwd(),
    manifest,
    baseRef: options.base
  });

  printReport(report, parseFormat(options.format));
  process.exitCode = report.passed ? 0 : 1;
}

function printReport(report: DryftReport, format: OutputFormat): void {
  if (format === "json") {
    process.stdout.write(toJsonReport(report));
  } else if (format === "sarif") {
    process.stdout.write(toSarifReport(report));
  } else {
    process.stdout.write(toTextReport(report));
  }
}

function parseOptions(rawArgs: string[]): Record<string, string | undefined> {
  const options: Record<string, string | undefined> = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else {
      const next = rawArgs[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = "";
      }
    }
  }

  return options;
}

function parseArgs(rawArgs: string[]): {
  positional: string[];
  options: Record<string, string | undefined>;
} {
  const positional: string[] = [];
  const options: Record<string, string | undefined> = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else {
      const next = rawArgs[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = "";
      }
    }
  }

  return { positional, options };
}

async function runContext(rawArgs: string[]): Promise<void> {
  const subcommand = rawArgs[0];
  const { positional, options } = parseArgs(rawArgs.slice(1));
  const format = parseContextFormat(options.format);
  const manifest = await loadManifest(process.cwd(), options.config);
  const index = await buildFeatureIndex(process.cwd(), manifest);

  if (subcommand === "list") {
    const summaries = listFeatures(index);
    process.stdout.write(
      format === "json"
        ? `${JSON.stringify(summaries, null, 2)}\n`
        : toContextListReport(summaries)
    );
    return;
  }

  if (subcommand === "feature") {
    const id = positional[0];
    if (!id) {
      console.error("Usage: dryft context feature <id>");
      process.exitCode = 1;
      return;
    }
    const detail = getFeature(index, id);
    if (!detail) {
      console.error(`Unknown feature "${id}".`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      format === "json"
        ? `${JSON.stringify(detail, null, 2)}\n`
        : toContextFeatureReport(detail)
    );
    return;
  }

  if (subcommand === "file") {
    const filePath = positional[0];
    if (!filePath) {
      console.error("Usage: dryft context file <path>");
      process.exitCode = 1;
      return;
    }
    const memberships = featuresForFile(index, filePath);
    process.stdout.write(
      format === "json"
        ? `${JSON.stringify(memberships, null, 2)}\n`
        : toContextFileReport(filePath, memberships)
    );
    return;
  }

  if (subcommand === "search") {
    const query = positional.join(" ");
    if (!query) {
      console.error("Usage: dryft context search <query>");
      process.exitCode = 1;
      return;
    }
    const results = searchFeatures(index, query);
    process.stdout.write(
      format === "json"
        ? `${JSON.stringify(results, null, 2)}\n`
        : toContextSearchReport(query, results)
    );
    return;
  }

  console.error(
    "Usage: dryft context list | feature <id> | file <path> | search <query>"
  );
  process.exitCode = 1;
}

function parseContextFormat(format: string | undefined): "text" | "json" {
  return format === "json" ? "json" : "text";
}

async function runMcpCommand(rawArgs: string[]): Promise<void> {
  const { options } = parseArgs(rawArgs);
  const cwd = options.cwd
    ? path.resolve(process.cwd(), options.cwd)
    : process.cwd();
  await runMcp({ cwd, config: options.config });
}

function parseFormat(format: string | undefined): OutputFormat {
  if (format === "json" || format === "sarif" || format === "text") {
    return format;
  }

  return "text";
}

async function writeIfAbsent(filePath: string, content: string): Promise<void> {
  try {
    await writeFile(filePath, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

function printHelp(): void {
  console.log([
    "Dryft",
    "",
    "Usage:",
    "  dryft init [--project <name>]",
    "  dryft init --infer [--model <id>] [--dry-run]",
    "  dryft scan [--format text|json|sarif] [--config <path>]",
    "  dryft ci --base <ref> [--format text|json|sarif] [--config <path>]",
    "  dryft context list [--format text|json] [--config <path>]",
    "  dryft context feature <id> [--format text|json] [--config <path>]",
    "  dryft context file <path> [--format text|json] [--config <path>]",
    "  dryft context search <query> [--format text|json] [--config <path>]",
    "  dryft mcp [--cwd <path>] [--config <path>]",
    ""
  ].join("\n"));
}
