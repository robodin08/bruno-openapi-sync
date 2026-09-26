#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { sync } from "./sync.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("bruno-openapi-sync")
    .version(packageJson.version)
    .requiredOption("-s, --source <path-or-url>", "Path to the source file or URL (required)")
    .requiredOption("-o, --output <path>", "Path to the Bruno output directory (required)")
    .option("-n, --name <name>", "name for the imported collection")
    .option("-i, --insecure", "disable SSL certificate verification when fetching from URLs")
    .option("-y, --yes", "auto-accept all changes without prompting")
    .action(sync);
  return program;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  createProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
