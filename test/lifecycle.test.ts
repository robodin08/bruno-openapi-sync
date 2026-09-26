import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

describe("sync() - temporary directory lifecycle", () => {
  it("removes .bruno-sync-tmp after a successful sync", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    expect(
      fs
        .readdirSync(path.dirname(outputDir), { withFileTypes: true })
        .some((entry) => entry.isDirectory() && entry.name.startsWith(".bruno-sync-tmp-")),
    ).toBe(false);
  });

  it("does not leave .bruno-sync-tmp when source file does not exist", async () => {
    const outputDir = getOutputDir();
    await expect(
      sync({ source: path.join(FIXTURES, "nonexistent.json"), output: outputDir, yes: true }),
    ).rejects.toThrow();
    expect(
      fs
        .readdirSync(path.dirname(outputDir), { withFileTypes: true })
        .some((entry) => entry.isDirectory() && entry.name.startsWith(".bruno-sync-tmp-")),
    ).toBe(false);
  });

  it("removes .bruno-sync-tmp on re-run", async () => {
    const outputDir = getOutputDir();
    const source = path.join(FIXTURES, "simple/openapi.json");
    await sync({ source, output: outputDir, yes: true });
    await sync({ source, output: outputDir, yes: true });
    expect(
      fs
        .readdirSync(path.dirname(outputDir), { withFileTypes: true })
        .some((entry) => entry.isDirectory() && entry.name.startsWith(".bruno-sync-tmp-")),
    ).toBe(false);
  });
});

describe("sync() - idempotent re-run", () => {
  it("produces identical files and content on second run", async () => {
    const outputDir = getOutputDir();
    const source = path.join(FIXTURES, "simple/openapi.json");
    await sync({ source, output: outputDir, yes: true });
    const firstRun = listFiles(outputDir);
    const contentBefore = fs.readFileSync(path.join(outputDir, "List users.yml"), "utf-8");
    await sync({ source, output: outputDir, yes: true });
    expect(listFiles(outputDir)).toEqual(firstRun);
    expect(fs.readFileSync(path.join(outputDir, "List users.yml"), "utf-8")).toBe(contentBefore);
  });
});
