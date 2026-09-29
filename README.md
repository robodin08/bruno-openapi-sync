# bruno-openapi-sync

[![npm version](https://img.shields.io/npm/v/bruno-openapi-sync.svg)](https://www.npmjs.com/package/bruno-openapi-sync)
[![npm downloads](https://img.shields.io/npm/dm/bruno-openapi-sync.svg)](https://www.npmjs.com/package/bruno-openapi-sync)

Sync an OpenAPI spec into a Bruno collection with interactive git-style diffs.

When your API spec changes, this tool imports the new spec into a unique temporary directory, diffs each generated file against your existing Bruno collection, and lets you review, accept, or skip changes one by one — just like `git add -p`.

## Installation

```bash
npm install -g bruno-openapi-sync
```

Or run without installing:

```bash
npx bruno-openapi-sync -s ./openapi.json -o ./bruno
```

## Prerequisites

Node.js 22.12.0 or newer is required. The Bruno CLI is installed automatically as a runtime dependency when you install this package; no global Bruno installation is needed.

Git is used to render diffs for changed files. The sync can still copy and delete files without Git, but changed-file diffs will not be displayed.

## Usage

```
Usage: bruno-openapi-sync [options]

Options:
  -V, --version               output the version number
  -s, --source <path-or-url>  Path to the source file or URL (required)
  -o, --output <path>         Path to the Bruno output root directory (required)
  -n, --name <name>           name for the imported collection
  -i, --insecure              disable SSL certificate verification when fetching from URLs
  -y, --yes                   auto-accept all non-conflicting changes without prompting
  --dry-run                   show what would change without modifying anything
  --check                     exit non-zero if sync would change or conflict (implies --dry-run)
  --json                      emit machine-readable JSON results (implies non-interactive)
  -h, --help                  display help for command
```

### Examples

```bash
# Interactive sync — the collection is written to ./bruno/<collection-name>/
bruno-openapi-sync -s ./openapi.json -o ./bruno

# Sync a remote YAML spec into a collection directory
bruno-openapi-sync -s https://example.com/openapi.yaml -o ./bruno

# Sync the Swagger Petstore example
bruno-openapi-sync -s https://petstore.swagger.io/v2/swagger.json -o ./bruno

# Override the collection name (used as the collection directory name)
bruno-openapi-sync -s ./openapi.json -o ./bruno -n "OpenAPI definition"
# → ./bruno/OpenAPI definition/

# Auto-accept all changes
bruno-openapi-sync -s ./openapi.json -o ./bruno --yes

# Allow insecure TLS when fetching a remote spec
bruno-openapi-sync -s https://internal.example.com/openapi.yaml -o ./bruno --insecure
```

`--output` is the root directory: the generated collection is always written to a subdirectory named after the collection (`--name` when given, otherwise the OpenAPI spec title, sanitized by the Bruno CLI). This lets you sync multiple collections into one root, e.g. `./bruno/Backend API/` and `./bruno/Public API/`.

### Three-way synchronization

After the first sync, the tool stores the state of the last successful import in a sibling directory named `<output>/<collection>.bruno-openapi-sync/` (containing `state.json` and a `base/` snapshot). On later runs it compares three versions of each file:

- **BASE** — the last successful sync
- **CURRENT** — the files currently on disk
- **NEW** — the freshly generated collection from OpenAPI

| Situation                               | Behavior                        |
| --------------------------------------- | ------------------------------- |
| Only OpenAPI changed                    | Apply the OpenAPI change        |
| Only you changed                        | Preserve your change            |
| Both changed different things           | Merge them automatically        |
| Both changed the same thing differently | Show a conflict and never guess |

Conflicts prompt with `keep current` / `accept OpenAPI` / `abort`. Under `--yes`, conflicts are resolved by keeping your current version. New operations are added automatically; removed operations are confirmed before deletion; a locally modified removed operation is never silently deleted. Operations moved between folders are detected as moves.

## Interactive prompts

For each changed file you'll be prompted:

```
Apply this change? [y/N/a/q]
```

- **y** — apply this change
- **n** — skip this change
- **a** — apply this and all remaining changes
- **q** — quit without applying further changes

New files are always added automatically. Deleted files (removed from the imported spec) prompt for confirmation. Files in directories not produced by the current import are left untouched. Each sync uses a unique temporary directory beside the output directory, removes it when the sync finishes, and cleans it up when the import fails. Do not use `.bruno-sync-tmp` itself as the output directory.

The synchronization state lives in `<output>/<collection>.bruno-openapi-sync/`. You'll likely want to gitignore it (e.g. `bruno/**/*.bruno-openapi-sync/`).

## Programmatic API

```ts
import { sync } from "bruno-openapi-sync";

await sync({
  source: "./openapi.json",
  output: "./bruno",
  name: "OpenAPI definition",
  yes: true,
});
```

`source` accepts local JSON/YAML files and HTTP(S) URLs supported by the Bruno CLI. `output` is the root directory, and the generated collection is written to `<output>/<collection-name>/`, where the collection name comes from `name` or the spec title. The `insecure` option disables TLS certificate verification for remote sources. Set `dryRun: true` to preview changes without modifying files, or `check: true` to preview changes and report a non-zero status through the CLI when changes or conflicts are found. Set `json: true` for non-interactive operation with machine-readable CLI output; it also keeps the current version when a conflict is encountered.

The `sync` function returns a `SyncResult` containing the planned or applied changes, whether changes were found, and whether conflicts were detected.

## License

MIT
