import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface MergeResult {
  merged: string;
  conflicted: boolean;
  reason?: string;
}

/**
 * Three-way line merge using `git merge-file`, which is already a soft
 * dependency of this project (used to render diffs). `base` is the common
 * ancestor, `current` is the user's version on disk, and `other` is the
 * freshly generated OpenAPI version.
 */
export function merge3(base: string, current: string, other: string): MergeResult {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bos-merge-"));
  const baseFile = path.join(tmp, "base");
  const currentFile = path.join(tmp, "current");
  const otherFile = path.join(tmp, "other");

  try {
    fs.writeFileSync(baseFile, base);
    fs.writeFileSync(currentFile, current);
    fs.writeFileSync(otherFile, other);

    const res = spawnSync("git", ["merge-file", "-p", currentFile, baseFile, otherFile], {
      encoding: "utf-8",
    });

    if (res.error) {
      return { merged: current, conflicted: true, reason: "git unavailable" };
    }

    const merged = res.stdout ?? "";
    const conflicted = res.status !== 0 || /^<{7} /m.test(merged);

    return { merged, conflicted, reason: conflicted ? "conflicting changes" : undefined };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
