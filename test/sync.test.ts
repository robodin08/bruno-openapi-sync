/**
 * Comprehensive test suite for bruno-openapi-sync
 *
 * Uses Vitest (ESM-compatible).
 * Tests run with `--yes` flag (non-interactive) so they are fully automated.
 *
 * Fixtures:
 *   test/fixtures/simple/openapi.json   → title "Simple Test API"
 *                                         4 requests (Create user, Delete user, Get user by ID, List users)
 *   test/fixtures/simple-v2/openapi.json → title "Simple Test API"
 *                                         3 requests (Get user by ID, Health check, List users (v2))
 *   test/fixtures/auth/openapi.json     → title "Auth API"
 *                                         2 requests (Login, Logout)
 *   test/petstore/openapi.json          → title "Swagger Petstore"
 *                                         nested: pet/ + environments/
 *
 * bru import places files at:
 *   <outputPath>/<API title>/opencollection.yml
 *   <outputPath>/<API title>/<RequestName>.yml        (flat)
 *   <outputPath>/<API title>/<tag>/<RequestName>.yml  (when tags present)
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sync } from '../src/sync.js';

// ─── constants ───────────────────────────────────────────────────────────────

const FIXTURES = path.resolve('test/fixtures');
const PETSTORE = path.resolve('test/petstore/openapi.json');

// Collection names as bru uses them (derived from the spec info.title)
const SIMPLE_COL = 'Simple Test API';
const AUTH_COL = 'Auth API';
const PETSTORE_COL = 'Swagger Petstore';

// ─── helpers ─────────────────────────────────────────────────────────────────

function tmpOut(label: string): string {
  return path.join(os.tmpdir(), `bru-test-${label}-${Date.now()}`);
}

/** Recursively list all files under dir, returning relative paths. */
function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(full).map((f) => path.join(entry.name, f)));
    } else {
      result.push(entry.name);
    }
  }
  return result.sort();
}

// ─── state ───────────────────────────────────────────────────────────────────

let outputDir: string;

beforeEach(() => {
  outputDir = tmpOut('suite');
});

afterEach(() => {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  // Ensure tmp dir was cleaned up by sync itself
  const tmpDir = path.join(path.dirname(outputDir), '.bruno-sync-tmp');
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── test suite ──────────────────────────────────────────────────────────────

describe('sync() – fresh import (output dir does not exist)', () => {
  it('creates the output directory when it does not exist', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    expect(fs.existsSync(outputDir)).toBe(true);
  });

  it('creates collection subdirectory named after the API title', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, SIMPLE_COL))).toBe(true);
  });

  it('generates opencollection.yml inside the collection directory', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, SIMPLE_COL, 'opencollection.yml'))).toBe(true);
  });

  it('generates all expected request files for simple fixture', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, SIMPLE_COL));
    expect(files).toContain('opencollection.yml');
    expect(files).toContain('Create user.yml');
    expect(files).toContain('Delete user.yml');
    expect(files).toContain('Get user by ID.yml');
    expect(files).toContain('List users.yml');
  });

  it('generates valid YAML content in request files', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const content = fs.readFileSync(path.join(outputDir, SIMPLE_COL, 'List users.yml'), 'utf-8');
    expect(content).toContain('List users');
    expect(content).toContain('method: GET');
  });

  it('generates all expected request files for auth fixture', async () => {
    await sync({ source: path.join(FIXTURES, 'auth/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, AUTH_COL));
    expect(files).toContain('opencollection.yml');
    expect(files).toContain('Login.yml');
    expect(files).toContain('Logout.yml');
  });

  it('generates nested folder structure for petstore (tagged spec)', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, PETSTORE_COL));
    expect(files).toContain('opencollection.yml');
    expect(files.some((f) => f.startsWith('pet' + path.sep))).toBe(true);
  });

  it('generates environments folder for petstore', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, PETSTORE_COL));
    expect(files.some((f) => f.startsWith('environments' + path.sep))).toBe(true);
  });
});

describe('sync() – tmp dir lifecycle', () => {
  it('removes .bruno-sync-tmp after a successful sync', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const tmpDir = path.join(path.dirname(outputDir), '.bruno-sync-tmp');
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('does not leave .bruno-sync-tmp when source file does not exist', async () => {
    const badSource = path.join(FIXTURES, 'nonexistent.json');
    const tmpDir = path.join(path.dirname(outputDir), '.bruno-sync-tmp');
    await expect(sync({ source: badSource, output: outputDir, yes: true })).rejects.toThrow();
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  it('removes .bruno-sync-tmp on re-run', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const tmpDir = path.join(path.dirname(outputDir), '.bruno-sync-tmp');
    expect(fs.existsSync(tmpDir)).toBe(false);
  });
});

describe('sync() – idempotent re-run (same spec)', () => {
  it('produces identical file list on second run', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const firstRun = listFiles(outputDir);
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const secondRun = listFiles(outputDir);
    expect(secondRun).toEqual(firstRun);
  });

  it('does not duplicate files on re-run', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(outputDir);
    expect(files.length).toBe(new Set(files).size);
  });

  it('preserves file content on re-run with unchanged spec', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const colDir = path.join(outputDir, SIMPLE_COL);
    const contentBefore = fs.readFileSync(path.join(colDir, 'List users.yml'), 'utf-8');
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const contentAfter = fs.readFileSync(path.join(colDir, 'List users.yml'), 'utf-8');
    expect(contentAfter).toBe(contentBefore);
  });
});

describe('sync() – spec update (v1 → v2)', () => {
  it('adds new files that appear in v2 spec', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'simple-v2/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, SIMPLE_COL));
    expect(files).toContain('Health check.yml');
    expect(files).toContain('List users (v2).yml');
  });

  it('removes files that were deleted in v2 spec', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'simple-v2/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, SIMPLE_COL));
    // v2 drops POST /users and DELETE /users/{id}
    expect(files).not.toContain('Create user.yml');
    expect(files).not.toContain('Delete user.yml');
    expect(files).not.toContain('List users.yml');
  });

  it('keeps files that exist in both specs', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'simple-v2/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, SIMPLE_COL));
    expect(files).toContain('Get user by ID.yml');
    expect(files).toContain('opencollection.yml');
  });

  it('output contains only v2 files after upgrade', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'simple-v2/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, SIMPLE_COL));
    expect(files).toContain('opencollection.yml');
    expect(files).toContain('Get user by ID.yml');
    expect(files).toContain('Health check.yml');
    expect(files).toContain('List users (v2).yml');
    expect(files).not.toContain('Create user.yml');
    expect(files).not.toContain('Delete user.yml');
    expect(files).not.toContain('List users.yml');
  });

  it('updates changed file content between versions', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const colDir = path.join(outputDir, SIMPLE_COL);
    const contentBefore = fs.readFileSync(path.join(colDir, 'Get user by ID.yml'), 'utf-8');
    await sync({ source: path.join(FIXTURES, 'simple-v2/openapi.json'), output: outputDir, yes: true });
    const contentAfter = fs.readFileSync(path.join(colDir, 'Get user by ID.yml'), 'utf-8');
    // seq number changes: v1 has seq:3, v2 has seq:2
    expect(contentAfter).not.toBe(contentBefore);
  });
});

describe('sync() – subfolder collision (multi-spec in same output parent dir)', () => {
  /**
   * Bug scenario: two specs are synced to the same parent outputDir.
   * Since bru creates named subdirs per collection, they coexist without conflict.
   * But we also verify the tmpDir logic doesn't delete one collection when syncing another.
   */
  it('both collections coexist under the same output directory', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'auth/openapi.json'), output: outputDir, yes: true });

    const simpleFiles = listFiles(path.join(outputDir, SIMPLE_COL));
    expect(simpleFiles).toContain('opencollection.yml');
    expect(simpleFiles).toContain('List users.yml');

    const authFiles = listFiles(path.join(outputDir, AUTH_COL));
    expect(authFiles).toContain('Login.yml');
    expect(authFiles).toContain('Logout.yml');
  });

  it('re-syncing auth does not delete the simple collection', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    await sync({ source: path.join(FIXTURES, 'auth/openapi.json'), output: outputDir, yes: true });
    // Re-sync auth
    await sync({ source: path.join(FIXTURES, 'auth/openapi.json'), output: outputDir, yes: true });

    const simpleFiles = listFiles(path.join(outputDir, SIMPLE_COL));
    expect(simpleFiles).toContain('Create user.yml');
    expect(simpleFiles).toContain('Delete user.yml');
  });

  it('two specs with separate output dirs are fully independent', async () => {
    const parent = path.join(os.tmpdir(), `bru-collision-${Date.now()}`);
    const apiOut = path.join(parent, 'a');
    const authOut = path.join(parent, 'b');

    try {
      await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: apiOut, yes: true });
      await sync({ source: path.join(FIXTURES, 'auth/openapi.json'), output: authOut, yes: true });
      // Re-sync auth → must not affect a/
      await sync({ source: path.join(FIXTURES, 'auth/openapi.json'), output: authOut, yes: true });

      const apiFiles = listFiles(path.join(apiOut, SIMPLE_COL));
      expect(apiFiles).toContain('Create user.yml');
      expect(apiFiles).toContain('List users.yml');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('sync() – error handling', () => {
  it('throws when source file does not exist', async () => {
    await expect(
      sync({ source: path.join(FIXTURES, 'does-not-exist.json'), output: outputDir, yes: true }),
    ).rejects.toThrow('OpenAPI source file not found');
  });

  it('includes the missing path in the error message', async () => {
    const missing = path.join(FIXTURES, 'missing.json');
    await expect(sync({ source: missing, output: outputDir, yes: true })).rejects.toThrow(missing);
  });

  it('throws when output path is .bruno-sync-tmp', async () => {
    const parent = path.join(os.tmpdir(), `bru-guard-${Date.now()}`);
    const badOut = path.join(parent, '.bruno-sync-tmp');
    try {
      await expect(
        sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: badOut, yes: true }),
      ).rejects.toThrow('.bruno-sync-tmp');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('sync() – edge cases', () => {
  it('handles deeply nested output path (creates all parent directories)', async () => {
    const deep = path.join(outputDir, 'a', 'b', 'c');
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: deep, yes: true });
    expect(fs.existsSync(path.join(deep, SIMPLE_COL, 'opencollection.yml'))).toBe(true);
  });

  it('works with an absolute source path', async () => {
    const absSource = path.resolve(FIXTURES, 'simple/openapi.json');
    await sync({ source: absSource, output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, SIMPLE_COL, 'opencollection.yml'))).toBe(true);
  });

  it('simple fixture produces flat file layout (no request subfolders)', async () => {
    await sync({ source: path.join(FIXTURES, 'simple/openapi.json'), output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, SIMPLE_COL));
    const requestFiles = files.filter((f) => f.endsWith('.yml') && f !== 'opencollection.yml');
    // All request files should be directly at the collection root, not in subfolders
    expect(requestFiles.every((f) => !f.includes(path.sep))).toBe(true);
  });

  it('petstore re-run is idempotent', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const firstRun = listFiles(outputDir);
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const secondRun = listFiles(outputDir);
    expect(secondRun).toEqual(firstRun);
  });
});

describe('sync() – petstore (public domain OpenAPI fixture)', () => {
  it('completes without throwing', async () => {
    await expect(sync({ source: PETSTORE, output: outputDir, yes: true })).resolves.not.toThrow();
  });

  it('generates opencollection.yml', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const content = fs.readFileSync(path.join(outputDir, PETSTORE_COL, 'opencollection.yml'), 'utf-8');
    expect(content).toContain('opencollection');
  });

  it('generates environments/Environment 1.yml', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    expect(
      fs.existsSync(path.join(outputDir, PETSTORE_COL, 'environments', 'Environment 1.yml')),
    ).toBe(true);
  });

  it('generates pet/folder.yml', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    expect(fs.existsSync(path.join(outputDir, PETSTORE_COL, 'pet', 'folder.yml'))).toBe(true);
  });

  it('generates all pet request files', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const files = listFiles(path.join(outputDir, PETSTORE_COL));
    expect(files).toContain(path.join('pet', 'Add a new pet to the store.yml'));
    expect(files).toContain(path.join('pet', 'Finds Pets by status.yml'));
    expect(files).toContain(path.join('pet', 'Finds Pets by status (GET).yml'));
  });

  it('removes .bruno-sync-tmp after sync', async () => {
    await sync({ source: PETSTORE, output: outputDir, yes: true });
    const tmpDir = path.join(path.dirname(outputDir), '.bruno-sync-tmp');
    expect(fs.existsSync(tmpDir)).toBe(false);
  });
});
