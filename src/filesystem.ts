import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

export function walkDirs(dir: string): Set<string> {
  const dirs = new Set<string>();
  dirs.add(path.normalize(dir));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      for (const nestedDir of walkDirs(full)) dirs.add(nestedDir);
    }
  }
  return dirs;
}

export function showDiff(existingFile: string, newFile: string): void {
  spawnSync("git", ["--no-pager", "diff", "--no-index", "--color=always", existingFile, newFile], {
    stdio: "inherit",
    env: { ...process.env, GIT_PAGER: "cat", LESS: "-FRX" },
  });
}

export function pruneEmptyDirs(dir: string, root: string): void {
  if (!fs.existsSync(dir) || dir === root) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pruneEmptyDirs(path.join(dir, entry.name), root);
    }
  }
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}
