import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const testRoot = fileURLToPath(new URL("../dist/test", import.meta.url));
const testFiles = await findTestFiles(testRoot);

if (testFiles.length === 0) {
  throw new Error(`No compiled test files found in ${testRoot}`);
}

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`Test process exited with signal ${signal}`));
      return;
    }

    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findTestFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}
