import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const bruScript = require.resolve("@usebruno/cli/bin/bru");

export function importOpenApi(source: string, output: string, name?: string, insecure?: boolean): void {
  const args = [bruScript, "import", "openapi", "--source", source, "--output", output];

  if (name) {
    args.push("--collection-name", name);
  }

  if (insecure) {
    args.push("--insecure");
  }

  try {
    execFileSync("node", args, { stdio: "inherit" });
  } catch (error) {
    throw new Error(`Failed to import OpenAPI spec from ${source}\n\n${error}`);
  }
}
