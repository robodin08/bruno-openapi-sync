#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Command } from "commander";
import chalk from "chalk";
import packageJson from "../package.json" with { type: "json" };
import { sync } from "./sync.js";
import { checkForUpdate, printUpdateNotification } from "./update-check.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("bruno-openapi-sync")
    .version(packageJson.version)
    .requiredOption("-s, --source <path-or-url>", "Path to the source file or URL (required)")
    .requiredOption("-o, --output <path>", "Path to the Bruno output directory (required)")
    .option("-n, --name <name>", "name for the imported collection")
    .option("-i, --insecure", "disable SSL certificate verification when fetching from URLs")
    .option("-y, --yes", "auto-accept all non-conflicting changes without prompting")
    .option("--dry-run", "show what would change without modifying anything")
    .option("--check", "exit non-zero if synchronization would change or conflict (implies --dry-run)")
    .option("--json", "emit machine-readable JSON results (implies non-interactive)")
    .action(async (options) => {
      if (!options.json) {
        const latestVersion = await checkForUpdate(packageJson.version);

        if (latestVersion) {
          printUpdateNotification(packageJson.version, latestVersion);
        }
      }

      const result = await sync(options);

      if (options.json) {
        const jsonResult = {
          ...result,
          changes: result.changes.map(({ path, kind, status, fromPath, toPath }) => ({
            path,
            kind,
            status,
            fromPath,
            toPath,
          })),
        };

        process.stdout.write(JSON.stringify(jsonResult, null, 2) + "\n");
      }

      if (options.check && (result.hasChanges || result.hasConflicts)) {
        process.exitCode = 1;
      }
    });
  return program;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  createProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    });
}
