import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

describe("sync() - output root with collection subdirectory", () => {
  it("creates a collection subdirectory named after the spec title", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(expect.arrayContaining([path.join("Simple Test API", "opencollection.yml")]));
  });

  it("keeps different collections side by side in the same root", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, "auth/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(
      expect.arrayContaining([
        path.join("Simple Test API", "opencollection.yml"),
        path.join("Simple Test API", "List users.yml"),
        path.join("Auth API", "Login.yml"),
        path.join("Auth API", "Logout.yml"),
      ]),
    );
  });

  it("keeps separate output directories independent", async () => {
    const parent = path.join(os.tmpdir(), `bru-independent-${Date.now()}`);
    const apiOut = path.join(parent, "api");
    const authOut = path.join(parent, "auth");
    try {
      await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: apiOut, yes: true });
      await sync({ source: path.join(FIXTURES, "auth/openapi.json"), output: authOut, yes: true });
      expect(listFiles(apiOut)).toContain(path.join("Simple Test API", "Create user.yml"));
      expect(listFiles(authOut)).toContain(path.join("Auth API", "Login.yml"));
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
