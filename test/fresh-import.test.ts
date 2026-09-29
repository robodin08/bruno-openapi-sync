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

  it("exports opencollection.yml into the collection directory", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, "Simple Test API", "opencollection.yml"))).toBe(true);
  });

  it("generates all expected request files for simple fixture", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(
      expect.arrayContaining([
        path.join("Simple Test API", "opencollection.yml"),
        path.join("Simple Test API", "Create user.yml"),
        path.join("Simple Test API", "Delete user.yml"),
        path.join("Simple Test API", "Get user by ID.yml"),
        path.join("Simple Test API", "List users.yml"),
      ]),
    );
  });

  it("generates valid YAML content in request files", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });
    const content = fs.readFileSync(path.join(outputDir, "Simple Test API", "List users.yml"), "utf-8");
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
    const content = fs.readFileSync(path.join(outputDir, "Custom API", "opencollection.yml"), "utf-8");
    expect(content).toContain("name: Custom API");
  });

  it("generates auth request files", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "auth/openapi.json"), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toEqual(
      expect.arrayContaining([
        path.join("Auth API", "opencollection.yml"),
        path.join("Auth API", "Login.yml"),
        path.join("Auth API", "Logout.yml"),
      ]),
    );
  });

  it("generates the petstore folder and environment structure", async () => {
    const outputDir = getOutputDir();
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files).toContain(path.join("Swagger Petstore", "opencollection.yml"));
    expect(files.some((file) => file.startsWith(path.join("Swagger Petstore", "pet") + path.sep))).toBe(true);
    expect(files.some((file) => file.startsWith(path.join("Swagger Petstore", "environments") + path.sep))).toBe(true);
  });
});
