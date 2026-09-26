import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

describe("sync() - direct output root", () => {
  it("replaces the output root when a different spec is synced there", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, "auth/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(expect.arrayContaining(["opencollection.yml", "Login.yml", "Logout.yml"]));
    expect(files).not.toContain("List users.yml");
  });

  it("keeps separate output directories independent", async () => {
    const parent = path.join(os.tmpdir(), `bru-independent-${Date.now()}`);
    const apiOut = path.join(parent, "api");
    const authOut = path.join(parent, "auth");
    try {
      await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: apiOut, yes: true });
      await sync({ source: path.join(FIXTURES, "auth/openapi.json"), output: authOut, yes: true });
      expect(listFiles(apiOut)).toContain("Create user.yml");
      expect(listFiles(authOut)).toContain("Login.yml");
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
