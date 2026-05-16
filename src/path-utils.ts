import path from "node:path";

export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function relativePosix(cwd: string, filePath: string): string {
  return toPosixPath(path.relative(cwd, filePath));
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
