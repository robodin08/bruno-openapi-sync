import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sync } from "../src/sync.js";
import { FIXTURES, useTestOutput } from "./helpers.js";

const getOutputDir = useTestOutput();

function runCli(args: string[]): { status: number | null; stdout: string } {
  const res = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    encoding: "utf-8",
  });
  return { status: res.status, stdout: res.stdout ?? "" };
}

describe("CLI - check mode and JSON output", () => {
  it("emits JSON and exits 1 when --check finds changes", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });

    const { status, stdout } = runCli([
      "-s",
      path.join(FIXTURES, "simple-v3/openapi.json"),
      "-o",
      outputDir,
      "--check",
      "--json",
    ]);

    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.hasChanges).toBe(true);
    expect(parsed.hasConflicts).toBe(false);
    expect(Array.isArray(parsed.changes)).toBe(true);
  });

  it("exits 0 when --check finds no changes", async () => {
    const outputDir = getOutputDir();
    await sync({ source: path.join(FIXTURES, "simple/openapi.json"), output: outputDir, yes: true });

    const { status, stdout } = runCli([
      "-s",
      path.join(FIXTURES, "simple/openapi.json"),
      "-o",
      outputDir,
      "--check",
      "--json",
    ]);

    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hasChanges).toBe(false);
  });
});
