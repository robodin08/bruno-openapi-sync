import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const bruScript = require.resolve("@usebruno/cli/bin/bru");

export function importOpenApi(
  source: string,
  output: string,
  name?: string,
  insecure?: boolean,
  quiet?: boolean,
): void {
  const args = [bruScript, "import", "openapi", "--source", source, "--output", output];

  if (name) {
    args.push("--collection-name", name);
  }

  if (insecure) {
    args.push("--insecure");
  }

  try {
    if (quiet) {
      execFileSync("node", args, { stdio: ["ignore", "pipe", "pipe"] });
    } else {
      execFileSync("node", args, { stdio: "inherit" });
    }
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr) : "";
    throw new Error(`Failed to import OpenAPI spec from ${source}\n\n${stderr || error}`);
  }
}
