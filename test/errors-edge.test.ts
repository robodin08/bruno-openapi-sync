import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

describe("sync() - error handling", () => {
  it("lets Bruno reject a source file that does not exist", async () => {
    const outputDir = getOutputDir();
    await expect(
      sync({ source: path.join(FIXTURES, "does-not-exist.json"), output: outputDir, yes: true }),
    ).rejects.toThrow();
  });

  it("lets Bruno report the missing source path", async () => {
    const outputDir = getOutputDir();
    const missing = path.join(FIXTURES, "missing.json");
    await expect(sync({ source: missing, output: outputDir, yes: true })).rejects.toThrow();
  });

  it("lets Bruno reject unsupported source protocols", async () => {
    const outputDir = getOutputDir();
    await expect(sync({ source: "ftp://example.com/openapi.json", output: outputDir, yes: true })).rejects.toThrow();
  });

  it("rejects using .bruno-sync-tmp as output", async () => {
    const outputDir = getOutputDir();
    const badOutput = path.join(path.dirname(outputDir), ".bruno-sync-tmp");
    await expect(
      sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: badOutput, yes: true }),
    ).rejects.toThrow(".bruno-sync-tmp");
  });
});

describe("sync() - source and path edge cases", () => {
  it("accepts local, absolute, and YAML sources", async () => {
    const outputDir = getOutputDir();
    const sourceDir = path.join(path.dirname(outputDir), "source with spaces");
    fs.mkdirSync(sourceDir, { recursive: true });
    const spacedSource = path.join(sourceDir, "openapi.json");
    fs.copyFileSync(path.join(FIXTURES, "simple/openapi.json"), spacedSource);
    await sync({ source: spacedSource, output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, "Simple Test API", "opencollection.yml"))).toBe(true);

    fs.rmSync(outputDir, { recursive: true, force: true });
    await sync({ source: path.resolve(FIXTURES, "yaml/openapi.yaml"), output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, "YAML API", "opencollection.yml"))).toBe(true);

    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it("creates deeply nested output paths and keeps flat request files flat", async () => {
    const outputDir = getOutputDir();
    const deep = path.join(outputDir, "a", "b", "c");
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: deep, yes: true });
    const collectionDir = path.join(deep, "Simple Test API");
    expect(fs.existsSync(path.join(collectionDir, "opencollection.yml"))).toBe(true);
    const requestFiles = listFiles(collectionDir).filter((file) => file.endsWith(".yml") && file !== "opencollection.yml");
    expect(requestFiles.every((file) => !file.includes(path.sep))).toBe(true);
  });
});
