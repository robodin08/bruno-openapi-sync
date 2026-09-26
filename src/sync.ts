import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { importOpenApi } from "./bru.js";
import { pruneEmptyDirs, showDiff, walkDir, walkDirs } from "./filesystem.js";

export interface SyncOptions {
  source: string;
  output: string;
  name?: string;
  insecure?: boolean;
  yes?: boolean;
}

export async function sync(options: SyncOptions): Promise<void> {
  const { source, output: outputDir, name, insecure = false, yes = false } = options;

  const outputPath = path.resolve(outputDir);

  // Use a unique sibling so concurrent syncs cannot remove each other's imports.
  if (path.basename(outputPath) === ".bruno-sync-tmp") {
    throw new Error(`Output path cannot be ".bruno-sync-tmp" — choose a different output directory`);
  }

  let tmpDir: string | undefined;
  let rl: ReturnType<typeof createInterface> | undefined;

  try {
    const parentDir = path.dirname(outputPath);
    fs.mkdirSync(parentDir, { recursive: true });

    tmpDir = fs.mkdtempSync(path.join(parentDir, ".bruno-sync-tmp-"));

    console.log(`→ Importing OpenAPI to temp dir...`);

    importOpenApi(source, tmpDir, name, insecure);

    // bru always creates a single named subdirectory inside the output dir
    // (e.g. "Simple Test API/"). Detect it and use it as the canonical root.
    const topLevelEntries = fs.readdirSync(tmpDir, { withFileTypes: true });
    const collectionDirs = topLevelEntries.filter((e) => e.isDirectory());
    if (collectionDirs.length !== 1) {
      throw new Error(
        `Expected bru to create exactly one collection directory in ${tmpDir}, got: ${topLevelEntries.map((e) => e.name).join(", ")}`,
      );
    }
    const tmpRoot = path.join(tmpDir, collectionDirs[0].name);
    const outputRoot = outputPath;

    const tmpFiles = walkDir(tmpRoot);
    const tmpDirs = walkDirs(tmpRoot);

    rl = createInterface({ input, output });
    async function askUser(question: string): Promise<string> {
      const answer = await rl!.question(question);
      return answer.trim().toLowerCase();
    }

    let acceptAll = yes;
    let quit = false;

    for (const tmpFile of tmpFiles) {
      if (quit) break;

      const relPath = path.relative(tmpRoot, tmpFile);
      const existingFile = path.join(outputRoot, relPath);

      if (!fs.existsSync(existingFile)) {
        fs.mkdirSync(path.dirname(existingFile), { recursive: true });
        fs.copyFileSync(tmpFile, existingFile);
        console.log(`\n✚ Added: ${relPath}`);
        continue;
      }

      const existingContent = fs.readFileSync(existingFile, "utf-8");
      const newContent = fs.readFileSync(tmpFile, "utf-8");

      if (existingContent === newContent) {
        continue;
      }

      console.log(`\n── Changed: ${relPath} ──`);
      showDiff(existingFile, tmpFile);

      if (!acceptAll) {
        const answer = await askUser("\nApply this change? [y/N/a/q]: ");
        if (answer === "q") {
          console.log("Quitting — no further changes applied.");
          quit = true;
          break;
        } else if (answer === "a") {
          acceptAll = true;
        } else if (answer !== "y") {
          console.log("  Skipped.");
          continue;
        }
      }

      fs.copyFileSync(tmpFile, existingFile);
      console.log(`  ✔ Updated: ${relPath}`);
    }

    if (!quit && fs.existsSync(outputRoot)) {
      const existingFiles = walkDir(outputRoot);

      for (const existingFile of existingFiles) {
        if (quit) break;

        const relPath = path.relative(outputRoot, existingFile);
        const tmpFile = path.join(tmpRoot, relPath);

        const parentInTmp = path.normalize(path.join(tmpRoot, path.dirname(relPath)));

        if (!tmpDirs.has(parentInTmp)) {
          continue;
        }

        if (!fs.existsSync(tmpFile)) {
          console.log(`\n── Removed from spec: ${relPath} ──`);

          if (!acceptAll) {
            const answer = await askUser("Delete this file? [y/N]: ");
            if (answer !== "y") {
              console.log("  Kept.");
              continue;
            }
          }

          fs.unlinkSync(existingFile);
          console.log(`  ✖ Deleted: ${relPath}`);
        }
      }

      for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          pruneEmptyDirs(path.join(outputRoot, entry.name), outputRoot);
        }
      }
    }

    console.log("\n✓ Bruno sync complete.");
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    rl?.close();
  }
}
