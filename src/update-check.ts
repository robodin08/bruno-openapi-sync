import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json' with { type: 'json' }
import chalk from 'chalk'
import { gt, valid } from 'semver'

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 1000

interface UpdateCache {
  checkedAt: number
  latestVersion?: string
}

function getCachePath(): string {
  return join(
    process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    packageJson.name,
    'update-check.json',
  )
}

async function readCache(): Promise<UpdateCache | undefined> {
  try {
    const content = await readFile(getCachePath(), 'utf8')
    return JSON.parse(content) as UpdateCache
  } catch {
    return undefined
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    const path = getCachePath()

    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, JSON.stringify(cache), 'utf8')
  } catch {
    // Cache failures should never affect the CLI.
  }
}

async function fetchLatestVersion(): Promise<string | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageJson.name}/latest`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      },
    )

    if (!response.ok) return undefined

    const data = (await response.json()) as { version?: unknown }

    return typeof data.version === 'string' && valid(data.version)
      ? data.version
      : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkForUpdate(
  currentVersion: string,
): Promise<string | undefined> {
  if (!valid(currentVersion)) {
    throw new Error(`Invalid current package version: "${currentVersion}"`)
  }

  const cache = await readCache()

  if (cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
    if (
      cache.latestVersion &&
      valid(cache.latestVersion) &&
      gt(cache.latestVersion, currentVersion)
    ) {
      return cache.latestVersion
    }

    return undefined
  }

  const latestVersion = await fetchLatestVersion()

  await writeCache({
    checkedAt: Date.now(),
    latestVersion,
  })

  if (latestVersion && gt(latestVersion, currentVersion)) {
    return latestVersion
  }

  return undefined
}

export function printUpdateNotification(
  currentVersion: string,
  latestVersion: string,
): void {
  process.stderr.write(
    `\n${chalk.yellow(`Update available: ${currentVersion} -> ${latestVersion}`)}\n` +
      `${chalk.dim(`Run: npm install -g ${packageJson.name}@latest`)}\n\n`,
  )
}
