#!/usr/bin/env node

/**
 * release.mjs  -  bump version, git commit + tag + push, then publish to npm
 *
 * Usage:
 *   node scripts/release.mjs patch                  (default)
 *   node scripts/release.mjs minor
 *   node scripts/release.mjs major
 *   node scripts/release.mjs 2.1.0                  (explicit version)
 *   node scripts/release.mjs patch --skip-tests     (skip tests)
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { eq, inc, valid } from 'semver'

import packageJson from '../package.json' with { type: 'json' }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, opts = {}) {
  console.log(chalk.dim(`  $ ${cmd}`))
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts })
}

function ensureNpmLogin() {
  try {
    run('npm whoami --registry=https://registry.npmjs.org/')
  } catch {
    console.log(
      chalk.yellow('  You are not logged in to npm. Starting npm login...\n'),
    )
    run('npm login --registry=https://registry.npmjs.org/')
  }
}

function bumpVersion(current, bump) {
  if (!valid(current)) {
    throw new Error(`Invalid current package version: "${current}"`)
  }

  if (bump === 'major' || bump === 'minor' || bump === 'patch') {
    const nextVersion = inc(current, bump)
    if (nextVersion) return nextVersion
  }

  const explicitVersion = valid(bump)
  if (explicitVersion) return explicitVersion

  throw new Error(
    `Invalid bump type or version: "${bump}". Use major | minor | patch | x.y.z`,
  )
}

const args = process.argv.slice(2)
const skipTests = args.includes('--skip-tests')
const bumpArg = args.find((arg) => !arg.startsWith('--')) ?? 'patch'

const oldVersion = packageJson.version
const newVersion = bumpVersion(oldVersion, bumpArg)

if (eq(newVersion, oldVersion)) {
  console.error(
    chalk.red(`Version is already ${oldVersion} - nothing to release.`),
  )
  process.exit(1)
}

console.log(
  chalk.cyan(
    `\nReleasing ${packageJson.name}  ${oldVersion} -> ${newVersion}\n`,
  ),
)

try {
  const status = execSync('git status --porcelain', { cwd: root })
    .toString()
    .trim()
  if (status) {
    console.log(
      chalk.yellow(
        'Warning: uncommitted changes detected - they will be included in the release commit.\n',
      ),
    )
  }
} catch {
  // git not available - proceed anyway
}

console.log(chalk.cyan('1/5  Running tests'))

if (skipTests) {
  console.log(chalk.yellow('  Warning: tests skipped (--skip-tests)'))
} else {
  run('npm test')
}

console.log(chalk.cyan('\n2/6  Checking npm authentication'))
ensureNpmLogin()

console.log(chalk.cyan('\n3/6  Bumping version'))
run(`npm version ${newVersion} --no-git-tag-version`)
console.log(chalk.green(`  package.json + package-lock.json -> ${newVersion}`))

console.log(chalk.cyan('\n4/6  Committing & tagging'))
run('git add -A')
run(`git commit -m "release: v${newVersion}"`)
run(`git tag v${newVersion}`)

console.log(chalk.cyan('\n5/6  Pushing to remote'))
run('git push -u origin main')
run('git push --tags')

console.log(chalk.cyan('\n6/6  Publishing to npm'))
run('npm run publish:npm')

console.log(chalk.green(`\nSuccessfully released v${newVersion}\n`))
