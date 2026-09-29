import { describe, expect, it, vi } from "vitest";

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: async () => "q",
    close: () => {},
  }),
}));

import fs from "node:fs";
import path from "node:path";
import { sync } from "../src/sync.js";
import { stateDirFor } from "../src/state.js";
import { FIXTURES, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

describe("three-way sync - aborted synchronization", () => {
  it("leaves the collection and state unchanged when the user aborts", async () => {
    const outputDir = getOutputDir();
    const simple = path.join(FIXTURES, "simple/openapi.json");
    const simpleV3 = path.join(FIXTURES, "simple-v3/openapi.json");

    await sync({ source: simple, output: outputDir, yes: true });

    const file = path.join(outputDir, "Simple Test API", "Get user by ID.yml");
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf-8").replace("description: User found", "description: User found (mine)"),
    );

    const stateFile = path.join(stateDirFor(path.join(outputDir, "Simple Test API")), "state.json");
    const stateBefore = fs.readFileSync(stateFile, "utf-8");

    // Prompt is mocked to answer "q" (quit/abort) — must not be run with --yes.
    const result = await sync({ source: simpleV3, output: outputDir });

    expect(fs.readFileSync(file, "utf-8")).toContain("User found (mine)");
    expect(fs.readFileSync(file, "utf-8")).not.toContain("User found (detailed)");
    expect(fs.readFileSync(stateFile, "utf-8")).toBe(stateBefore);
    expect(result.hasChanges).toBe(false);
  });
});
