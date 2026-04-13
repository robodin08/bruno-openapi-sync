import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export interface SyncOptions {
  source: string;
  output: string;
  yes?: boolean;
}

export function getBruCommand(): string {
  try {
    execSync('bru --version', { stdio: 'ignore' });
    return 'bru';
  } catch {
    return 'npx @usebruno/cli';
  }
}

export function walkDir(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

/**
 * Returns all directories (recursively) within a directory, as a Set of
 * normalised absolute paths (including the root dir itself).
 */
export function walkDirs(dir: string): Set<string> {
  const dirs = new Set<string>();
  dirs.add(path.normalize(dir));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      for (const d of walkDirs(full)) dirs.add(d);
    }
  }
  return dirs;
}

export function showDiff(existingFile: string, newFile: string): void {
  // Use --no-pager and GIT_PAGER=cat to prevent git from launching `less`
  spawnSync('git', ['--no-pager', 'diff', '--no-index', '--color=always', existingFile, newFile], {
    stdio: 'inherit',
    env: { ...process.env, GIT_PAGER: 'cat', LESS: '-FRX' },
  });
}

/**
 * Remove empty directories bottom-up within a root directory.
 * The root itself is never removed.
 */
function pruneEmptyDirs(dir: string, root: string): void {
  if (!fs.existsSync(dir) || dir === root) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pruneEmptyDirs(path.join(dir, entry.name), root);
    }
  }
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    fs.rmdirSync(dir);
  }
}

export async function sync(options: SyncOptions): Promise<void> {
  const { source, output: outputDir, yes = false } = options;
  const bruCmd = getBruCommand();
  const rl = createInterface({ input, output });

  async function askUser(question: string): Promise<string> {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase();
  }

  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(outputDir);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`OpenAPI source file not found: ${sourcePath}`);
  }

  // Place tmpDir as a sibling of outputPath to avoid any path collision
  const tmpDir = path.join(path.dirname(outputPath), '.bruno-sync-tmp');

  if (path.normalize(tmpDir) === path.normalize(outputPath)) {
    throw new Error(`Output path cannot be ".bruno-sync-tmp" — choose a different output directory`);
  }

  try {
    // Clean and recreate temp dir
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const cwd = process.cwd();
    const relSource = path.relative(cwd, sourcePath).replace(/\\/g, '/');
    const relOutput = path.relative(cwd, tmpDir).replace(/\\/g, '/');

    console.log(`→ Importing OpenAPI to temp dir (using ${bruCmd})...`);

    execSync(`${bruCmd} import openapi --source ${relSource} --output ${relOutput}`, {
      stdio: 'inherit',
      cwd,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    });

    // bru always creates a single named subdirectory inside the output dir
    // (e.g. "Simple Test API/"). Detect it and use it as the canonical root.
    const topLevelEntries = fs.readdirSync(tmpDir, { withFileTypes: true });
    const collectionDirs = topLevelEntries.filter((e) => e.isDirectory());
    if (collectionDirs.length !== 1) {
      throw new Error(
        `Expected bru to create exactly one collection directory in ${tmpDir}, got: ${topLevelEntries.map((e) => e.name).join(', ')}`,
      );
    }
    const collectionName = collectionDirs[0].name;
    const tmpRoot = path.join(tmpDir, collectionName);
    const outputRoot = path.join(outputPath, collectionName);

    // Collect all files and directories produced by bru import
    const tmpFiles = walkDir(tmpRoot);
    const tmpDirs = walkDirs(tmpRoot);

    let acceptAll = yes;
    let quit = false;

    // ── Phase 1: add / update files ──────────────────────────────────────────
    for (const tmpFile of tmpFiles) {
      if (quit) break;

      const relPath = path.relative(tmpRoot, tmpFile);
      const existingFile = path.join(outputRoot, relPath);

      if (!fs.existsSync(existingFile)) {
        // New file — auto-add without prompting
        fs.mkdirSync(path.dirname(existingFile), { recursive: true });
        fs.copyFileSync(tmpFile, existingFile);
        console.log(`\n✚ Added: ${path.join(collectionName, relPath)}`);
        continue;
      }

      const existingContent = fs.readFileSync(existingFile, 'utf-8');
      const newContent = fs.readFileSync(tmpFile, 'utf-8');

      if (existingContent === newContent) {
        continue; // Identical — skip silently
      }

      // Changed — show diff and prompt
      console.log(`\n── Changed: ${path.join(collectionName, relPath)} ──`);
      showDiff(existingFile, tmpFile);

      if (!acceptAll) {
        const answer = await askUser('\nApply this change? [y/n/a(all)/q(quit)] ');
        if (answer === 'q') {
          console.log('Quitting — no further changes applied.');
          quit = true;
          break;
        } else if (answer === 'a') {
          acceptAll = true;
        } else if (answer !== 'y') {
          console.log('  Skipped.');
          continue;
        }
      }

      fs.copyFileSync(tmpFile, existingFile);
      console.log(`  ✔ Updated: ${path.join(collectionName, relPath)}`);
    }

    // ── Phase 2: delete files no longer in spec ───────────────────────────────
    // Only consider files whose parent directory was produced by THIS bru import.
    // This prevents touching files that belong to a different spec synced into
    // the same parent output directory.
    if (!quit && fs.existsSync(outputRoot)) {
      const existingFiles = walkDir(outputRoot);

      for (const existingFile of existingFiles) {
        if (quit) break;

        const relPath = path.relative(outputRoot, existingFile);
        const tmpFile = path.join(tmpRoot, relPath);

        // Map the file's parent directory back to what it would be in tmpRoot
        const parentInTmp = path.normalize(path.join(tmpRoot, path.dirname(relPath)));

        // Only flag as stale if the parent directory is known to bru's output
        if (!tmpDirs.has(parentInTmp)) {
          continue; // Not managed by this spec — leave it alone
        }

        if (!fs.existsSync(tmpFile)) {
          console.log(`\n── Removed from spec: ${path.join(collectionName, relPath)} ──`);

          if (!acceptAll) {
            const answer = await askUser('Delete this file? [y/n] ');
            if (answer !== 'y') {
              console.log('  Kept.');
              continue;
            }
          }

          fs.unlinkSync(existingFile);
          console.log(`  ✖ Deleted: ${path.join(collectionName, relPath)}`);
        }
      }

      // Clean up any directories that became empty after deletions
      for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          pruneEmptyDirs(path.join(outputRoot, entry.name), outputRoot);
        }
      }
    }

    console.log('\n✓ Bruno sync complete.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    rl.close();
  }
}
