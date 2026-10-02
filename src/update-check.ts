import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";

const PACKAGE_NAME = "bruno-openapi-sync";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 1000;

interface UpdateCache {
  checkedAt: number;
  latestVersion?: string;
}

function getCachePath(): string {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), PACKAGE_NAME, "update-check.json");
}

function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const currentPart = currentParts[i] ?? 0;
    const latestPart = latestParts[i] ?? 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

async function readCache(): Promise<UpdateCache | undefined> {
  try {
    const content = await readFile(getCachePath(), "utf8");
    return JSON.parse(content) as UpdateCache;
  } catch {
    return undefined;
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    const path = getCachePath();

    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify(cache), "utf8");
  } catch {
    // Cache failures should never affect the CLI.
  }
}

async function fetchLatestVersion(): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return undefined;

    const data = (await response.json()) as { version?: unknown };

    return typeof data.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkForUpdate(currentVersion: string): Promise<string | undefined> {
  const cache = await readCache();

  if (cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
    if (cache.latestVersion && isNewerVersion(currentVersion, cache.latestVersion)) {
      return cache.latestVersion;
    }

    return undefined;
  }

  const latestVersion = await fetchLatestVersion();

  await writeCache({
    checkedAt: Date.now(),
    latestVersion,
  });

  if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
    return latestVersion;
  }

  return undefined;
}

export function printUpdateNotification(currentVersion: string, latestVersion: string): void {
  process.stderr.write(
    `\n${chalk.yellow(`Update available: ${currentVersion} -> ${latestVersion}`)}\n` +
      `${chalk.dim(`Run: npm install -g ${PACKAGE_NAME}@latest`)}\n\n`,
  );
}
