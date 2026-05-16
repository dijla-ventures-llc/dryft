// dryft:implements core.scanner
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { relativePosix, toPosixPath } from "./path-utils.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".cache",
  ".turbo",
  ".vercel"
]);

const SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".cts",
  ".cxx",
  ".go",
  ".graphql",
  ".gql",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sql",
  ".swift",
  ".tf",
  ".ts",
  ".tsx"
]);

export async function listRepositoryFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];

  await walk(cwd, cwd, files);

  return files.sort((left, right) => left.localeCompare(right));
}

export function normalizeInputFiles(cwd: string, files: string[]): string[] {
  return files
    .filter((file) => file.trim().length > 0)
    .map((file) => toPosixPath(file))
    .map((file) => (path.isAbsolute(file) ? relativePosix(cwd, file) : file))
    .sort((left, right) => left.localeCompare(right));
}

export function isSourceFile(file: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

async function walk(root: string, current: string, files: string[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      await walk(root, absolutePath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    if (fileStat.size > 1024 * 1024) {
      continue;
    }

    files.push(relativePosix(root, absolutePath));
  }
}
