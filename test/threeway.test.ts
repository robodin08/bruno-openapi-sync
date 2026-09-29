import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { stateDirFor } from "../src/state.js";
import { FIXTURES, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

const simple = path.join(FIXTURES, "simple/openapi.json");
const simpleV2 = path.join(FIXTURES, "simple-v2/openapi.json");
const simpleV3 = path.join(FIXTURES, "simple-v3/openapi.json");
const simpleMoved = path.join(FIXTURES, "simple-moved/openapi.json");

const COLLECTION = "Simple Test API";

function coll(outputDir: string): string {
  return path.join(outputDir, COLLECTION);
}

function read(outputDir: string, relPath: string): string {
  return fs.readFileSync(path.join(outputDir, relPath), "utf-8");
}

function edit(outputDir: string, relPath: string, from: string, to: string): void {
  const file = path.join(outputDir, relPath);
  const content = fs.readFileSync(file, "utf-8");
  const next = content.replace(from, to);
  if (next === content) {
    throw new Error(`pattern not found in ${relPath}: ${from}`);
  }
  fs.writeFileSync(file, next);
}

describe("three-way sync - BASE state", () => {
  it("creates state.json and a base/ snapshot on first sync", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const stateDir = stateDirFor(coll(outputDir));
    expect(fs.existsSync(path.join(stateDir, "state.json"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "base", "opencollection.yml"))).toBe(true);
    expect(fs.existsSync(path.join(stateDir, "base", "List users.yml"))).toBe(true);
  });

  it("reports no changes when nothing changed", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const result = await sync({ source: simple, output: outputDir, yes: true });
    expect(result.changes).toEqual([]);
    expect(result.hasChanges).toBe(false);
    expect(result.hasConflicts).toBe(false);
  });
});

describe("three-way sync - content classification", () => {
  it("applies OpenAPI-only changes", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const result = await sync({ source: simpleV3, output: outputDir, yes: true });
    expect(result.hasConflicts).toBe(false);
    expect(read(coll(outputDir), "Get user by ID.yml")).toContain("User found (detailed)");
  });

  it("preserves user-only changes", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    edit(coll(outputDir), "Get user by ID.yml", "  timeout: 0", "  timeout: 5000");
    const result = await sync({ source: simple, output: outputDir, yes: true });
    expect(result.hasChanges).toBe(false);
    expect(read(coll(outputDir), "Get user by ID.yml")).toContain("timeout: 5000");
  });

  it("merges independent changes (user + OpenAPI on different lines)", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    edit(coll(outputDir), "Get user by ID.yml", "  timeout: 0", "  timeout: 5000");
    const result = await sync({ source: simpleV3, output: outputDir, yes: true });
    expect(result.hasConflicts).toBe(false);
    const content = read(coll(outputDir), "Get user by ID.yml");
    expect(content).toContain("timeout: 5000");
    expect(content).toContain("User found (detailed)");
  });

  it("reports a conflict when both sides change the same line differently", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    edit(coll(outputDir), "Get user by ID.yml", "description: User found", "description: User found (mine)");
    const result = await sync({ source: simpleV3, output: outputDir, yes: true });
    expect(result.hasConflicts).toBe(true);
    const content = read(coll(outputDir), "Get user by ID.yml");
    expect(content).toContain("User found (mine)");
    expect(content).not.toContain("User found (detailed)");
  });
});

describe("three-way sync - operations", () => {
  it("creates new OpenAPI operations", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    await sync({ source: simpleV2, output: outputDir, yes: true });
    expect(fs.existsSync(path.join(coll(outputDir), "Health check.yml"))).toBe(true);
    expect(fs.existsSync(path.join(coll(outputDir), "List users (v2).yml"))).toBe(true);
  });

  it("deletes operations removed from OpenAPI", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    await sync({ source: simpleV2, output: outputDir, yes: true });
    expect(fs.existsSync(path.join(coll(outputDir), "Create user.yml"))).toBe(false);
    expect(fs.existsSync(path.join(coll(outputDir), "Delete user.yml"))).toBe(false);
    expect(fs.existsSync(path.join(coll(outputDir), "List users.yml"))).toBe(false);
  });

  it("does not silently delete a locally modified removed operation", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    edit(coll(outputDir), "Create user.yml", "description: Created", "description: Created (edited)");
    const result = await sync({ source: simpleV2, output: outputDir, yes: true });
    expect(result.hasConflicts).toBe(true);
    expect(fs.existsSync(path.join(coll(outputDir), "Create user.yml"))).toBe(true);
    expect(read(coll(outputDir), "Create user.yml")).toContain("Created (edited)");
  });

  it("detects moves instead of delete + create", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const result = await sync({ source: simpleMoved, output: outputDir, yes: true });
    expect(result.hasConflicts).toBe(false);
    expect(fs.existsSync(path.join(coll(outputDir), "users", "List users.yml"))).toBe(true);
    expect(fs.existsSync(path.join(coll(outputDir), "List users.yml"))).toBe(false);
  });
});

describe("three-way sync - state robustness", () => {
  it("recovers from corrupted state without crashing", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const stateDir = stateDirFor(coll(outputDir));
    fs.writeFileSync(path.join(stateDir, "state.json"), "{ not valid json");
    const result = await sync({ source: simple, output: outputDir, yes: true });
    expect(result.hasChanges).toBe(false);
    expect(fs.existsSync(path.join(coll(outputDir), "opencollection.yml"))).toBe(true);
    expect(JSON.parse(read(stateDir, "state.json")).files).toBeDefined();
  });

  it("recreates state when it is missing", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    fs.rmSync(stateDirFor(coll(outputDir)), { recursive: true, force: true });
    await sync({ source: simple, output: outputDir, yes: true });
    expect(fs.existsSync(path.join(stateDirFor(coll(outputDir)), "state.json"))).toBe(true);
    expect(fs.existsSync(path.join(coll(outputDir), "List users.yml"))).toBe(true);
  });
});

describe("three-way sync - dry-run and check", () => {
  it("dry-run makes no changes", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const before = listFiles(outputDir);
    const result = await sync({ source: simpleV3, output: outputDir, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.hasChanges).toBe(true);
    expect(listFiles(outputDir)).toEqual(before);
    expect(read(coll(outputDir), "Get user by ID.yml")).not.toContain("User found (detailed)");
  });

  it("check reports changes without modifying anything", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const result = await sync({ source: simpleV3, output: outputDir, check: true });
    expect(result.dryRun).toBe(true);
    expect(result.hasChanges).toBe(true);
    expect(read(coll(outputDir), "Get user by ID.yml")).not.toContain("User found (detailed)");
  });

  it("check reports clean when nothing changed", async () => {
    const outputDir = getOutputDir();
    await sync({ source: simple, output: outputDir, yes: true });
    const result = await sync({ source: simple, output: outputDir, check: true });
    expect(result.hasChanges).toBe(false);
    expect(result.hasConflicts).toBe(false);
  });
});
