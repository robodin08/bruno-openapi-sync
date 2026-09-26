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

Node.js 24 or newer is required. The Bruno CLI is installed automatically as a runtime dependency when you install this package; no global Bruno installation is needed.

Git is used to render diffs for changed files. The sync can still copy and delete files without Git, but changed-file diffs will not be displayed.

## Usage

```
Usage: bruno-openapi-sync [options]

Options:
  -V, --version                            output the version number
  -s, --source <path-or-url>               Path to the source file or URL (required)
  -o, --output <path>                      Path to the Bruno output directory (required)
  -n, --name <name>                        name for the imported collection
  -i, --insecure                           disable SSL certificate verification when fetching from URLs
  -y, --yes                                auto-accept all changes without prompting
  -h, --help                               display help for command
```

### Examples

```bash
# Interactive sync
bruno-openapi-sync -s ./openapi.json -o ./bruno

# Sync a remote YAML spec directly into a collection directory
bruno-openapi-sync -s https://example.com/openapi.yaml -o ./bruno/public-api

# Override the collection name in opencollection.yml
bruno-openapi-sync -s ./openapi.json -o ./bruno -n "OpenAPI definition"

# Auto-accept all changes
bruno-openapi-sync -s ./openapi.json -o ./bruno --yes

# Allow insecure TLS when fetching a remote spec
bruno-openapi-sync -s https://internal.example.com/openapi.yaml -o ./bruno --insecure
```

### Interactive prompts

For each changed file you'll be prompted:

```
Apply this change? [y/N/a/q]
```

- **y** — apply this change
- **n** — skip this change
- **a** — apply this and all remaining changes
- **q** — quit without applying further changes

New files are always added automatically. Deleted files (removed from the imported spec) prompt for confirmation. Files in directories not produced by the current import are left untouched. Each sync uses a unique temporary directory beside the output directory, removes it when the sync finishes, and cleans it up when the import fails. Do not use `.bruno-sync-tmp` itself as the output directory.

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

`source` accepts local JSON/YAML files and HTTP(S) URLs supported by the Bruno CLI. `output` is the Bruno collection directory, and generated files are written directly into it. The `insecure` option disables TLS certificate verification for remote sources.

## License

MIT
