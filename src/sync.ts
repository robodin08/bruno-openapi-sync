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

function getBruCommand(): string {
  try {
    execSync('bru --version', { stdio: 'ignore' });
    return 'bru';
  } catch {
    return 'npx @usebruno/cli';
  }
}

function walkDir(dir: string): string[] {
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

function showDiff(existingFile: string, newFile: string): void {
  spawnSync('git', ['diff', '--no-index', '--color=always', existingFile, newFile], {
    stdio: 'inherit',
  });
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

  try {
    // Import to temp dir
    const tmpDir = path.join(path.dirname(outputPath), '.bruno-sync-tmp');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const cwd = process.cwd();
    const relSource = path.relative(cwd, sourcePath).replace(/\\/g, '/');
    const relOutput = path.relative(cwd, tmpDir).replace(/\\/g, '/');

    console.log(`→ Importing OpenAPI to temp dir (using ${bruCmd})...`);

    try {
      execSync(`${bruCmd} import openapi --source ${relSource} --output ${relOutput}`, {
        stdio: 'inherit',
        cwd,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });

      // Walk temp dir files and compare against existing output files
      const tmpFiles = walkDir(tmpDir);
      let acceptAll = yes;
      let quit = false;

      for (const tmpFile of tmpFiles) {
        if (quit) break;

        const relPath = path.relative(tmpDir, tmpFile);
        const existingFile = path.join(outputPath, relPath);

        if (!fs.existsSync(existingFile)) {
          // New file — auto-add without prompting
          fs.mkdirSync(path.dirname(existingFile), { recursive: true });
          fs.copyFileSync(tmpFile, existingFile);
          console.log(`\n✚ Added: ${relPath}`);
          continue;
        }

        const existingContent = fs.readFileSync(existingFile, 'utf-8');
        const newContent = fs.readFileSync(tmpFile, 'utf-8');

        if (existingContent === newContent) {
          continue; // Identical — skip silently
        }

        // Changed — show diff and prompt
        console.log(`\n── Changed: ${relPath} ──`);
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
        console.log(`  ✔ Updated: ${relPath}`);
      }

      // Check for files in output that no longer exist in the new spec
      if (!quit && fs.existsSync(outputPath)) {
        const existingFiles = walkDir(outputPath);
        for (const existingFile of existingFiles) {
          if (quit) break;

          const relPath = path.relative(outputPath, existingFile);
          const tmpFile = path.join(tmpDir, relPath);

          if (!fs.existsSync(tmpFile)) {
            console.log(`\n── Removed from spec: ${relPath} ──`);

            if (!acceptAll) {
              const answer = await askUser('Delete this file? [y/n] ');
              if (answer !== 'y') {
                console.log('  Kept.');
                continue;
              }
            }

            fs.unlinkSync(existingFile);
            console.log(`  ✖ Deleted: ${relPath}`);
          }
        }
      }

      console.log('\n✓ Bruno sync complete.');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } finally {
    rl.close();
  }
}
