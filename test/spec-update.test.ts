import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

const COLLECTION = "Simple Test API";

async function syncVersions(outputDir: string): Promise<void> {
  await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
  await sync({ source: path.join(FIXTURES, "simple-v2/openapi.json"), output: outputDir, yes: true });
}

describe("sync() - spec update", () => {
  it("adds new files from v2", async () => {
    const outputDir = getOutputDir();
    await syncVersions(outputDir);
    expect(listFiles(outputDir)).toEqual(
      expect.arrayContaining([path.join(COLLECTION, "Health check.yml"), path.join(COLLECTION, "List users (v2).yml")]),
    );
  });

  it("removes files deleted in v2", async () => {
    const outputDir = getOutputDir();
    await syncVersions(outputDir);
    const files = listFiles(outputDir);
    expect(files).not.toEqual(
      expect.arrayContaining([
        path.join(COLLECTION, "Create user.yml"),
        path.join(COLLECTION, "Delete user.yml"),
        path.join(COLLECTION, "List users.yml"),
      ]),
    );
  });

  it("keeps shared files and updates changed content", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    const contentBefore = fs.readFileSync(path.join(outputDir, COLLECTION, "Get user by ID.yml"), "utf-8");
    await sync({ source: path.join(FIXTURES, "simple-v2/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(
      expect.arrayContaining([path.join(COLLECTION, "opencollection.yml"), path.join(COLLECTION, "Get user by ID.yml")]),
    );
    expect(fs.readFileSync(path.join(outputDir, COLLECTION, "Get user by ID.yml"), "utf-8")).not.toBe(contentBefore);
  });
});