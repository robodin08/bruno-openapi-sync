#!/usr/bin/env node
/**
 * release.mjs  –  bump version, git commit + tag + push, then publish to npm
 *
 * Usage:
 *   node scripts/release.mjs patch   (default)
 *   node scripts/release.mjs minor
 *   node scripts/release.mjs major
 *   node scripts/release.mjs 2.1.0   (explicit version)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  // Explicit semver string – validate format
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  throw new Error(`Invalid bump type or version: "${bump}". Use major | minor | patch | x.y.z`);
}

// ── main ─────────────────────────────────────────────────────────────────────

const bumpArg = process.argv[2] ?? 'patch';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bumpArg);

if (newVersion === oldVersion) {
  console.error(`Version is already ${oldVersion} – nothing to release.`);
  process.exit(1);
}

console.log(`\n🚀  Releasing ${pkg.name}  ${oldVersion} → ${newVersion}\n`);

// 1. Ensure working tree is clean (staged or unstaged changes are OK as long
//    as we commit them all below, but untracked conflicts would be a problem)
try {
  const status = execSync('git status --porcelain', { cwd: root }).toString().trim();
  if (status) {
    console.log('⚠  Uncommitted changes detected – they will be included in the release commit.\n');
  }
} catch {
  // git not available – proceed anyway
}

// 2. Run tests
console.log('── 1/5  Running tests ──────────────────────────────────────────');
run('npm test');

// 3. Bump version in package.json
console.log('\n── 2/5  Bumping version ────────────────────────────────────────');
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`  package.json → ${newVersion}`);

// 4. Commit, tag, push
console.log('\n── 3/5  Committing & tagging ───────────────────────────────────');
run('git add -A');
run(`git commit -m "release: v${newVersion}"`);
run(`git tag v${newVersion}`);

console.log('\n── 4/5  Pushing to remote ──────────────────────────────────────');
run('git push');
run('git push --tags');

// 5. Publish to npm
console.log('\n── 5/5  Publishing to npm ──────────────────────────────────────');
run('npm publish --access public');

console.log(`\n✅  Successfully released v${newVersion}\n`);
