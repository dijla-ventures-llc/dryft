#!/usr/bin/env node
// dryft:implements core.cli
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateCi } from "./ci.js";
import {
  createAgentInstructions,
  createGithubWorkflow,
  createStarterManifest
} from "./init.js";
import { loadManifest } from "./manifest.js";
import { toJsonReport, toSarifReport, toTextReport } from "./reporters.js";
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
  const projectName = options.project ?? path.basename(cwd);

  await writeIfAbsent(path.join(cwd, "dryft.yml"), createStarterManifest(projectName));
  await writeIfAbsent(path.join(cwd, "AGENTS.md"), createAgentInstructions());
  await mkdir(path.join(cwd, ".github", "workflows"), { recursive: true });
  await writeIfAbsent(
    path.join(cwd, ".github", "workflows", "dryft.yml"),
    createGithubWorkflow()
  );

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
      options[key] = rawArgs[index + 1];
      index += 1;
    }
  }

  return options;
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
    "  dryft scan [--format text|json|sarif] [--config <path>]",
    "  dryft ci --base <ref> [--format text|json|sarif] [--config <path>]",
    ""
  ].join("\n"));
}
