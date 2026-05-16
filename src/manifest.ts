// dryft:implements core.manifest
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import type { DryftFeature, DryftManifest, FeatureStatus } from "./types.js";

const MANIFEST_FILENAMES = ["dryft.yml", "dryft.yaml", "dryft.json"];
const FEATURE_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;
const STATUSES = new Set<FeatureStatus>(["active", "deprecated", "archived"]);

export async function loadManifest(
  cwd: string,
  manifestPath?: string
): Promise<DryftManifest> {
  const resolvedPath = manifestPath
    ? path.resolve(cwd, manifestPath)
    : await findManifestPath(cwd);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = parseManifest(raw, resolvedPath);

  return validateManifest(parsed, resolvedPath);
}

export function isValidFeatureId(featureId: string): boolean {
  return FEATURE_ID_PATTERN.test(featureId);
}

async function findManifestPath(cwd: string): Promise<string> {
  for (const filename of MANIFEST_FILENAMES) {
    const candidate = path.join(cwd, filename);
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(
    `No Dryft manifest found. Expected one of: ${MANIFEST_FILENAMES.join(", ")}`
  );
}

function parseManifest(raw: string, manifestPath: string): unknown {
  if (manifestPath.endsWith(".json")) {
    return JSON.parse(raw);
  }

  return YAML.parse(raw);
}

function validateManifest(input: unknown, manifestPath: string): DryftManifest {
  if (!isRecord(input)) {
    throw new Error("Dryft manifest must be an object.");
  }

  const project = isRecord(input.project) ? input.project : {};
  const features = input.features;

  if (!Array.isArray(features)) {
    throw new Error("Dryft manifest must include a features array.");
  }

  const seen = new Set<string>();
  const validatedFeatures = features.map((feature, index) =>
    validateFeature(feature, index, seen)
  );

  return {
    project: {
      name: typeof project.name === "string" ? project.name : undefined
    },
    features: validatedFeatures,
    path: manifestPath
  };
}

function validateFeature(
  input: unknown,
  index: number,
  seen: Set<string>
): DryftFeature {
  if (!isRecord(input)) {
    throw new Error(`Feature at index ${index} must be an object.`);
  }

  const id = input.id;
  const title = input.title;
  const status = input.status;

  if (typeof id !== "string" || !isValidFeatureId(id)) {
    throw new Error(
      `Feature id "${String(
        id
      )}" must use lowercase hierarchical segments like "auth.magic-link.login".`
    );
  }

  if (seen.has(id)) {
    throw new Error(`Feature id "${id}" is duplicated.`);
  }
  seen.add(id);

  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error(`Feature "${id}" must include a non-empty title.`);
  }

  if (typeof status !== "string" || !STATUSES.has(status as FeatureStatus)) {
    throw new Error(
      `Feature "${id}" must use status active, deprecated, or archived.`
    );
  }

  return {
    id,
    title,
    status: status as FeatureStatus,
    owner: typeof input.owner === "string" ? input.owner : undefined,
    paths: validatePaths(input.paths, id)
  };
}

function validatePaths(paths: unknown, featureId: string): string[] | undefined {
  if (paths === undefined) {
    return undefined;
  }

  if (!Array.isArray(paths) || paths.some((entry) => typeof entry !== "string")) {
    throw new Error(`Feature "${featureId}" paths must be an array of strings.`);
  }

  return paths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
