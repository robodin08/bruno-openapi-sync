import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { importOpenApi } from "./bru.js";
import { pruneEmptyDirs, showDiff, walkDir } from "./filesystem.js";
import { loadState, listBaseFiles, saveState } from "./state.js";
import { computePlan } from "./plan.js";
import { isActionKind, isConflictKind } from "./types.js";
import type { ChangeKind, FileChange, SyncOptions, SyncResult } from "./types.js";

function resolveSource(source: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source)) {
    return source;
  }
  return path.resolve(source);
}

function readMap(root: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(root)) {
    return map;
  }
  for (const file of walkDir(root)) {
    map.set(path.relative(root, file), fs.readFileSync(file, "utf-8"));
  }
  return map;
}

export async function sync(options: SyncOptions): Promise<SyncResult> {
  const { source, output: outputDir, name, insecure = false } = options;
  const json = options.json === true;
  const dryRun = options.dryRun === true || options.check === true;
  const check = options.check === true;
  // `--json` implies non-interactive: auto-accept, keep-current on conflicts.
  const yes = options.yes === true || json;
  const quiet = json;

  const log = (...args: unknown[]): void => {
    if (!quiet) console.log(...args);
  };
  const warn = (...args: unknown[]): void => {
    console.warn(chalk.yellow(...args.map(String)));
  };

  const outputRoot = path.resolve(outputDir);

  if (path.basename(outputRoot) === ".bruno-sync-tmp") {
    throw new Error(`Output path cannot be ".bruno-sync-tmp" - choose a different output directory`);
  }

  const resolvedSource = resolveSource(source);

  let tmpDir: string | undefined;
  let rl: ReturnType<typeof createInterface> | undefined;

  try {
    const parentDir = path.dirname(outputRoot);
    fs.mkdirSync(parentDir, { recursive: true });

    tmpDir = fs.mkdtempSync(path.join(parentDir, ".bruno-sync-tmp-"));

    log(chalk.cyan("Importing OpenAPI to temp dir..."));
    importOpenApi(source, tmpDir, name, insecure, quiet);

    const topLevelEntries = fs.readdirSync(tmpDir, { withFileTypes: true });
    const collectionDirs = topLevelEntries.filter((e) => e.isDirectory());
    if (collectionDirs.length !== 1) {
      throw new Error(
        `Expected bru to create exactly one collection directory in ${tmpDir}, got: ${topLevelEntries.map((e) => e.name).join(", ")}`,
      );
    }

    const collectionDirName = collectionDirs[0].name;
    const outputPath = path.join(outputRoot, collectionDirName);
    if (path.basename(outputPath) === ".bruno-sync-tmp") {
      throw new Error(`Output path cannot be ".bruno-sync-tmp" - choose a different output directory`);
    }

    const tmpRoot = path.join(tmpDir, collectionDirName);

    const nextMap = readMap(tmpRoot);
    const currentMap = readMap(outputPath);

    const { state, corrupted } = loadState(outputPath);
    if (corrupted) {
      warn(`Warning: sync state is corrupted - treating this as a fresh sync (existing files are preserved).`);
    }
    const sourceChanged = state !== null && !corrupted && state.source !== resolvedSource;

    let baseMap = new Map<string, string>();
    let detectMoves = true;
    if (!corrupted && state !== null) {
      baseMap = listBaseFiles(outputPath);
      if (sourceChanged) {
        detectMoves = false;
        warn(`Warning: source changed (${state.source} -> ${resolvedSource}) - re-baselining.`);
      }
    }

    const entries = computePlan(baseMap, currentMap, nextMap, { detectMoves, rebaseline: sourceChanged }).filter((e) =>
      isActionKind(e.kind),
    );

    rl = createInterface({ input, output });
    const askUser = async (question: string): Promise<string> => {
      const answer = await rl!.question(question);
      return answer.trim().toLowerCase();
    };

    const changes: FileChange[] = [];
    let acceptAll = yes;
    let aborted = false;

    const printConflict = (e: FileChange): void => {
      log(`\n${chalk.red.bold(`Conflict: ${e.path}`)}`);
      log(chalk.dim("\n--- BASE (last sync) ---"));
      log(e.baseContent ?? "(none)");
      log(chalk.dim("\n--- CURRENT (on disk) ---"));
      log(e.currentContent ?? "(deleted)");
      log(chalk.dim("\n--- OPENAPI (new) ---"));
      log(e.newContent ?? "(removed)");
    };

    for (const e of entries) {
      if (aborted) break;

      if (dryRun) {
        changes.push({ ...e, status: "planned" });
        continue;
      }

      switch (e.kind) {
        case "create":
        case "move": {
          changes.push({ ...e, status: "applied" });
          break;
        }
        case "update":
        case "merge": {
          const isMerge = e.kind === "merge";
          const existingFile = path.join(outputPath, e.path);
          log(`\n${chalk.cyan(`${isMerge ? "Merged" : "Changed"}: ${e.path}`)}`);
          const viewFile = isMerge
            ? path.join(tmpDir!, `.merge-view-${changes.length}.yml`)
            : path.join(tmpRoot, e.path);
          if (isMerge) {
            fs.writeFileSync(viewFile, e.finalContent ?? "");
          }
          if (!quiet) {
            showDiff(existingFile, viewFile);
          }

          if (!acceptAll) {
            const answer = await askUser("\nApply this change? [y/N/a/q]: ");
            if (answer === "q") {
              log("Quitting - no changes applied.");
              aborted = true;
              changes.push({ ...e, status: "skipped" });
              break;
            } else if (answer === "a") {
              acceptAll = true;
            } else if (answer !== "y") {
              log("  Skipped.");
              changes.push({ ...e, status: "skipped" });
              break;
            }
          }
          changes.push({ ...e, status: "applied" });
          break;
        }
        case "delete": {
          log(`\n${chalk.red(`Removed from spec: ${e.path}`)}`);
          if (!acceptAll) {
            const answer = await askUser("Delete this file? [y/N]: ");
            if (answer !== "y") {
              log("  Kept.");
              changes.push({ ...e, status: "skipped" });
              break;
            }
          }
          changes.push({ ...e, status: "applied" });
          break;
        }
        case "conflict": {
          printConflict(e);
          if (acceptAll) {
            log("  Kept current (conflict left unresolved).");
            changes.push({ ...e, status: "skipped" });
            break;
          }
          const answer = await askUser("\nResolve? [c=keep current / o=accept OpenAPI / q=abort]: ");
          if (answer === "q") {
            log("Aborted - no changes applied.");
            aborted = true;
            changes.push({ ...e, status: "skipped" });
          } else if (answer === "o") {
            changes.push({ ...e, status: "applied", finalContent: e.newContent });
          } else {
            log("  Kept current.");
            changes.push({ ...e, status: "skipped" });
          }
          break;
        }
        case "delete-conflict": {
          log(`\n${chalk.red.bold(`Conflict: ${e.path}`)}`);
          log(`This file was removed from the OpenAPI spec but you have local modifications.`);
          if (acceptAll) {
            log("  Kept current (conflict left unresolved).");
            changes.push({ ...e, status: "skipped" });
            break;
          }
          const answer = await askUser("\nResolve? [c=keep current / o=accept OpenAPI (delete) / q=abort]: ");
          if (answer === "q") {
            log("Aborted - no changes applied.");
            aborted = true;
            changes.push({ ...e, status: "skipped" });
          } else if (answer === "o") {
            changes.push({ ...e, status: "applied" });
          } else {
            log("  Kept current.");
            changes.push({ ...e, status: "skipped" });
          }
          break;
        }
        case "move-conflict": {
          log(`\n${chalk.red.bold(`Conflict: ${e.path}`)}`);
          log(`This operation was moved (${e.fromPath} -> ${e.toPath}) but you have local modifications.`);
          if (acceptAll) {
            log("  Kept current location (conflict left unresolved).");
            changes.push({ ...e, status: "skipped" });
            break;
          }
          const answer = await askUser("\nResolve? [c=keep current / o=accept OpenAPI (move) / q=abort]: ");
          if (answer === "q") {
            log("Aborted - no changes applied.");
            aborted = true;
            changes.push({ ...e, status: "skipped" });
          } else if (answer === "o") {
            changes.push({ ...e, status: "applied" });
          } else {
            log("  Kept current.");
            changes.push({ ...e, status: "skipped" });
          }
          break;
        }
        default:
          break;
      }
    }

    if (aborted) {
      log(chalk.yellow("\nSync aborted - collection left unchanged."));
      return buildResult(options, resolvedSource, outputPath, changes);
    }

    if (!dryRun) {
      applyChanges(outputPath, changes, log);
      saveState(outputPath, resolvedSource, tmpRoot);
    } else {
      printDryRun(changes, log);
    }

    if (dryRun) {
      log(chalk.cyan(check ? "\nCheck complete." : "\nDry run complete - no changes made."));
    } else {
      log(chalk.green("\nBruno sync complete."));
    }

    return buildResult(options, resolvedSource, outputPath, changes);
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    rl?.close();
  }
}

function applyChanges(outputPath: string, changes: FileChange[], log: (...args: unknown[]) => void): void {
  for (const e of changes) {
    if (e.status !== "applied") continue;
    const dest = path.join(outputPath, e.path);
    switch (e.kind) {
      case "create":
      case "update":
      case "merge": {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, e.finalContent ?? "");
        log(chalk.green(`  ${e.kind === "create" ? "Added" : "Updated"}: ${e.path}`));
        break;
      }
      case "delete":
      case "delete-conflict": {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
          log(chalk.red(`  Deleted: ${e.path}`));
        }
        break;
      }
      case "conflict": {
        if (e.finalContent !== undefined) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, e.finalContent);
          log(chalk.green(`  Updated (OpenAPI): ${e.path}`));
        }
        break;
      }
      case "move": {
        const toDest = path.join(outputPath, e.toPath ?? e.path);
        fs.mkdirSync(path.dirname(toDest), { recursive: true });
        fs.writeFileSync(toDest, e.finalContent ?? "");
        const fromDest = path.join(outputPath, e.fromPath ?? "");
        if (fs.existsSync(fromDest)) {
          fs.unlinkSync(fromDest);
        }
        log(chalk.cyan(`  Moved: ${e.fromPath} -> ${e.toPath}`));
        break;
      }
      case "move-conflict": {
        const toDest = path.join(outputPath, e.toPath ?? e.path);
        fs.mkdirSync(path.dirname(toDest), { recursive: true });
        fs.writeFileSync(toDest, e.newContent ?? "");
        const fromDest = path.join(outputPath, e.fromPath ?? "");
        if (fs.existsSync(fromDest)) {
          fs.unlinkSync(fromDest);
        }
        log(chalk.cyan(`  Moved (OpenAPI): ${e.fromPath} -> ${e.toPath}`));
        break;
      }
      default:
        break;
    }
  }

  for (const entry of fs.readdirSync(outputPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pruneEmptyDirs(path.join(outputPath, entry.name), outputPath);
    }
  }
}

function printDryRun(changes: FileChange[], log: (...args: unknown[]) => void): void {
  for (const e of changes) {
    const label = kindLabel(e.kind);
    const styledLabel = label.startsWith("conflict") ? chalk.red(label) : chalk.cyan(label);
    log(`  ${styledLabel} ${e.path}`);
  }
}

function kindLabel(kind: ChangeKind): string {
  switch (kind) {
    case "create":
      return "would add:";
    case "update":
      return "would update:";
    case "merge":
      return "would merge:";
    case "delete":
      return "would delete:";
    case "move":
      return "would move:";
    case "conflict":
    case "delete-conflict":
    case "move-conflict":
      return "conflict:";
    default:
      return "unchanged:";
  }
}

function buildResult(options: SyncOptions, source: string, outputPath: string, changes: FileChange[]): SyncResult {
  const dryRun = options.dryRun === true || options.check === true;
  const hasChanges = changes.some((c) => c.status === "applied" || c.status === "planned");
  const hasConflicts = changes.some((c) => isConflictKind(c.kind));
  return { source, output: outputPath, dryRun, changes, hasChanges, hasConflicts };
}
