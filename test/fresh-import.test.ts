import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, PETSTORE, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

describe("sync() - fresh import", () => {
  it("creates the output directory when it does not exist", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    expect(fs.existsSync(outputDir)).toBe(true);
  });

  it("exports opencollection.yml directly into the output directory", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, "opencollection.yml"))).toBe(true);
  });

  it("generates all expected request files for simple fixture", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(
      expect.arrayContaining([
        "opencollection.yml",
        "Create user.yml",
        "Delete user.yml",
        "Get user by ID.yml",
        "List users.yml",
      ]),
    );
  });

  it("generates valid YAML content in request files", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    const content = fs.readFileSync(path.join(outputDir, "List users.yml"), "utf-8");
    expect(content).toContain("List users");
    expect(content).toContain("method: GET");
  });

  it("passes a custom collection name to Bruno", async () => {
    const outputDir = getOutputDir();
    await sync({
      source: path.join(FIXTURES, "simple/openapi.json"),
      output: outputDir,
      name: "Custom API",
      yes: true,
    });
    const content = fs.readFileSync(path.join(outputDir, "opencollection.yml"), "utf-8");
    expect(content).toContain("name: Custom API");
  });

  it("generates auth request files", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "auth/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(expect.arrayContaining(["opencollection.yml", "Login.yml", "Logout.yml"]));
  });

  it("generates the petstore folder and environment structure", async () => {
    const outputDir = getOutputDir();
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toContain("opencollection.yml");
    expect(files.some((file) => file.startsWith("pet" + path.sep))).toBe(true);
    expect(files.some((file) => file.startsWith("environments" + path.sep))).toBe(true);
  });
});
