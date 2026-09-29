export interface SyncOptions {
  source: string;
  output: string;
  name?: string;
  insecure?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  check?: boolean;
  json?: boolean;
}

export type ChangeKind =
  | "create"
  | "update"
  | "merge"
  | "delete"
  | "delete-conflict"
  | "move"
  | "move-conflict"
  | "conflict"
  | "preserve"
  | "keep-deleted"
  | "user-file"
  | "unchanged";

export type ChangeStatus = "planned" | "applied" | "skipped";

export interface FileChange {
  path: string;
  kind: ChangeKind;
  status: ChangeStatus;
  fromPath?: string;
  toPath?: string;
  finalContent?: string;
  baseContent?: string;
  currentContent?: string;
  newContent?: string;
}

export interface SyncResult {
  source: string;
  output: string;
  dryRun: boolean;
  changes: FileChange[];
  hasChanges: boolean;
  hasConflicts: boolean;
}

export function isConflictKind(kind: ChangeKind): boolean {
  return kind === "conflict" || kind === "delete-conflict" || kind === "move-conflict";
}

export function isActionKind(kind: ChangeKind): boolean {
  return (
    kind === "create" ||
    kind === "update" ||
    kind === "merge" ||
    kind === "delete" ||
    kind === "move" ||
    isConflictKind(kind)
  );
}
