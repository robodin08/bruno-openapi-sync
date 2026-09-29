import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { walkDir } from "./filesystem.js";

export const STATE_SUFFIX = ".bruno-openapi-sync";

export interface State {
  schemaVersion: number;
  source: string;
  files: Record<string, string>;
}

export function stateDirFor(outputPath: string): string {
  return path.resolve(outputPath) + STATE_SUFFIX;
}

export function baseDirFor(outputPath: string): string {
  return path.join(stateDirFor(outputPath), "base");
}

function stateFileFor(outputPath: string): string {
  return path.join(stateDirFor(outputPath), "state.json");
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function loadState(outputPath: string): { state: State | null; corrupted: boolean } {
  const file = stateFileFor(outputPath);
  if (!fs.existsSync(file)) {
    return { state: null, corrupted: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as State;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.schemaVersion !== "number" ||
      typeof parsed.files !== "object" ||
      parsed.files === null
    ) {
      return { state: null, corrupted: true };
    }
    return { state: parsed, corrupted: false };
  } catch {
    return { state: null, corrupted: true };
  }
}

export function readBaseFile(outputPath: string, relPath: string): string | null {
  const file = path.join(baseDirFor(outputPath), relPath);
  if (!fs.existsSync(file)) {
    return null;
  }
  return fs.readFileSync(file, "utf-8");
}

export function listBaseFiles(outputPath: string): Map<string, string> {
  const baseDir = baseDirFor(outputPath);
  const map = new Map<string, string>();
  if (!fs.existsSync(baseDir)) {
    return map;
  }
  for (const file of walkDir(baseDir)) {
    const rel = path.relative(baseDir, file);
    map.set(rel, fs.readFileSync(file, "utf-8"));
  }
  return map;
}

export function saveState(outputPath: string, source: string, newRoot: string): void {
  const stateDir = stateDirFor(outputPath);
  const baseDir = baseDirFor(outputPath);

  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.mkdirSync(baseDir, { recursive: true });

  const files: Record<string, string> = {};
  for (const file of walkDir(newRoot)) {
    const rel = path.relative(newRoot, file);
    const content = fs.readFileSync(file, "utf-8");
    files[rel] = sha256(content);
    const dest = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  const state: State = { schemaVersion: 1, source, files };
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFileFor(outputPath), JSON.stringify(state, null, 2) + "\n");
}
