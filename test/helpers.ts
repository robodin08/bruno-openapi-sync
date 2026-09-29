import { afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FIXTURES = path.resolve("test/fixtures");
export const PETSTORE = path.resolve("test/petstore/openapi.json");

export function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(full).map((file) => path.join(entry.name, file)));
    } else {
      result.push(entry.name);
    }
  }
  return result.sort();
}

export function useTestOutput(): () => string {
  let outputDir: string;

  beforeEach(() => {
    outputDir = path.join(os.tmpdir(), `bru-test-${Date.now()}`);
    for (const entry of fs.readdirSync(path.dirname(outputDir), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(".bruno-sync-tmp-")) {
        fs.rmSync(path.join(path.dirname(outputDir), entry.name), { recursive: true, force: true });
      }
    }
  });

  afterEach(() => {
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    const stateDir = outputDir + ".bruno-openapi-sync";
    if (fs.existsSync(stateDir)) {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(path.dirname(outputDir), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(".bruno-sync-tmp-")) {
        fs.rmSync(path.join(path.dirname(outputDir), entry.name), { recursive: true, force: true });
      }
    }
  });

  return () => outputDir;
}
