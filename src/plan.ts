import path from "node:path";
import { load } from "js-yaml";
import { merge3 } from "./merge.js";
import type { FileChange } from "./types.js";

export interface PlanOptions {
  detectMoves: boolean;
  rebaseline?: boolean;
}

interface IdentifiedFile {
  relPath: string;
  content: string;
}

function identityOf(relPath: string, content: string): string {
  const basename = path.basename(relPath);
  if (basename === "opencollection.yml") {
    return "opencollection";
  }
  let doc: unknown;
  try {
    doc = load(content);
  } catch {
    return basename;
  }
  if (doc && typeof doc === "object") {
    const info = (doc as { info?: { type?: string; name?: string } }).info;
    if (info && typeof info.name === "string") {
      if (info.type === "folder") {
        return `folder:${info.name}`;
      }
      const method = (doc as { http?: { method?: string } }).http?.method ?? "";
      return `http:${method}:${info.name}`;
    }
  }
  return basename;
}

function matchMove(from: IdentifiedFile, to: IdentifiedFile): boolean {
  if (path.basename(from.relPath) !== path.basename(to.relPath)) {
    return false;
  }
  return identityOf(from.relPath, from.content) === identityOf(to.relPath, to.content);
}

export function computePlan(
  base: Map<string, string>,
  current: Map<string, string>,
  next: Map<string, string>,
  options: PlanOptions = { detectMoves: true },
): FileChange[] {
  const baseKeys = new Set(base.keys());
  const currentKeys = new Set(current.keys());
  const newKeys = new Set(next.keys());

  const moves = new Map<string, string>(); // fromPath -> toPath
  if (options.detectMoves) {
    // A move source is a tracked file still present on disk but missing from the
    // new import; a move target is a new file that matches its identity.
    const sources: IdentifiedFile[] = [];
    for (const k of [...baseKeys].sort()) {
      if (currentKeys.has(k) && !newKeys.has(k)) {
        sources.push({ relPath: k, content: current.get(k)! });
      }
    }
    const targets: IdentifiedFile[] = [];
    for (const k of [...newKeys].sort()) {
      if (!baseKeys.has(k) && !currentKeys.has(k)) {
        targets.push({ relPath: k, content: next.get(k)! });
      }
    }

    const usedTargets = new Set<string>();
    for (const from of sources) {
      for (const to of targets) {
        if (usedTargets.has(to.relPath)) continue;
        if (matchMove(from, to)) {
          moves.set(from.relPath, to.relPath);
          usedTargets.add(to.relPath);
          break;
        }
      }
    }
  }

  const movedFrom = new Set(moves.keys());
  const movedTo = new Set(moves.values());

  const entries: FileChange[] = [];
  const allKeys = [...new Set([...baseKeys, ...currentKeys, ...newKeys])].sort();

  for (const k of allKeys) {
    if (movedTo.has(k)) {
      continue; // handled as a move destination
    }

    const inBase = baseKeys.has(k);
    const inCurrent = currentKeys.has(k);
    const inNew = newKeys.has(k);

    if (movedFrom.has(k)) {
      const to = moves.get(k)!;
      const baseContent = base.get(k);
      const currentContent = current.get(k);
      const newContent = next.get(to);

      if (currentContent === newContent) {
        entries.push({ path: to, fromPath: k, toPath: to, kind: "move", status: "planned", finalContent: newContent });
      } else {
        const res = merge3(baseContent ?? "", currentContent ?? "", newContent ?? "");
        if (res.conflicted) {
          entries.push({
            path: to,
            fromPath: k,
            toPath: to,
            kind: "move-conflict",
            status: "planned",
            baseContent,
            currentContent,
            newContent,
          });
        } else {
          entries.push({
            path: to,
            fromPath: k,
            toPath: to,
            kind: "move",
            status: "planned",
            finalContent: res.merged,
          });
        }
      }
      continue;
    }

    const baseContent = inBase ? base.get(k) : undefined;
    const currentContent = inCurrent ? current.get(k) : undefined;
    const newContent = inNew ? next.get(k) : undefined;

    if (!inBase && !inCurrent && inNew) {
      entries.push({ path: k, kind: "create", status: "planned", finalContent: newContent, newContent });
      continue;
    }

    if (inBase && inCurrent && !inNew) {
      if (currentContent === baseContent) {
        entries.push({ path: k, kind: "delete", status: "planned", baseContent, currentContent, newContent });
      } else {
        entries.push({ path: k, kind: "delete-conflict", status: "planned", baseContent, currentContent, newContent });
      }
      continue;
    }

    if (inBase && !inCurrent && inNew) {
      // A tracked file is missing on disk but still present in the new import.
      // During a re-baseline (source changed) we trust the new spec and recreate
      // it; otherwise we preserve the user's deletion.
      if (options.rebaseline) {
        entries.push({ path: k, kind: "create", status: "planned", finalContent: newContent, newContent });
      } else {
        entries.push({ path: k, kind: "keep-deleted", status: "planned", baseContent, currentContent, newContent });
      }
      continue;
    }

    if (inBase && !inCurrent && !inNew) {
      continue; // already gone and removed from spec
    }

    if (!inBase && inCurrent && !inNew) {
      entries.push({ path: k, kind: "user-file", status: "planned", currentContent });
      continue;
    }

    if (!inBase && inCurrent && inNew) {
      if (currentContent === newContent) {
        entries.push({ path: k, kind: "unchanged", status: "planned", currentContent, newContent });
      } else {
        entries.push({ path: k, kind: "conflict", status: "planned", baseContent, currentContent, newContent });
      }
      continue;
    }

    // inBase && inCurrent && inNew -> content three-way
    if (baseContent === currentContent && baseContent === newContent) {
      continue; // unchanged
    }
    if (baseContent === currentContent) {
      entries.push({ path: k, kind: "update", status: "planned", finalContent: newContent, baseContent, currentContent, newContent });
      continue;
    }
    if (baseContent === newContent) {
      entries.push({ path: k, kind: "preserve", status: "planned", baseContent, currentContent, newContent });
      continue;
    }
    if (currentContent === newContent) {
      continue; // both made the same change
    }

    const res = merge3(baseContent!, currentContent!, newContent!);
    if (res.conflicted) {
      entries.push({ path: k, kind: "conflict", status: "planned", baseContent, currentContent, newContent });
    } else {
      entries.push({ path: k, kind: "merge", status: "planned", finalContent: res.merged, baseContent, currentContent, newContent });
    }
  }

  return entries;
}
