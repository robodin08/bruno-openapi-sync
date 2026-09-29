import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { PETSTORE, listFiles, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

const COLLECTION = "Swagger Petstore";

describe("sync() - petstore", () => {
  it("generates the collection, environment, folder, and request files", async () => {
    const outputDir = getOutputDir();
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(fs.readFileSync(path.join(outputDir, COLLECTION, "opencollection.yml"), "utf-8")).toContain("opencollection");
    expect(files).toContain(path.join(COLLECTION, "environments", "Environment 1.yml"));
    expect(files).toContain(path.join(COLLECTION, "pet", "folder.yml"));
    expect(files).toEqual(
      expect.arrayContaining([
        path.join(COLLECTION, "pet", "Add a new pet to the store.yml"),
        path.join(COLLECTION, "pet", "Finds Pets by status.yml"),
        path.join(COLLECTION, "pet", "Finds Pets by status (GET).yml"),
      ]),
    );
  });

  it("is idempotent and removes the temporary directory", async () => {
    const outputDir = getOutputDir();
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const firstRun = listFiles(outputDir);
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    expect(listFiles(outputDir)).toEqual(firstRun);
    expect(
      fs
        .readdirSync(path.dirname(outputDir), { withFileTypes: true })
        .some((entry) => entry.isDirectory() && entry.name.startsWith(".bruno-sync-tmp-")),
    ).toBe(false);
  });
});
