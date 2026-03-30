# @sayedameer/bruno-openapi-sync

Sync an OpenAPI spec into a Bruno collection with interactive git-style diffs.

When your API spec changes, this tool imports the new spec into a temp dir, diffs each file against your existing Bruno collection, and lets you review/accept/skip changes one by one — just like `git add -p`.

## Installation

```bash
npm install -g @sayedameer/bruno-openapi-sync
```

Or run without installing:

```bash
npx @sayedameer/bruno-openapi-sync -s ./openapi.json -o ./bruno
```

## Prerequisites

`@usebruno/cli` must be available. Install it globally or as a project dependency:

```bash
npm install -g @usebruno/cli
# or
npm install --save-dev @usebruno/cli
```

## Usage

```
bruno-openapi-sync [options]

Options:
  -s, --source <path>  Path to OpenAPI JSON file (required)
  -o, --output <path>  Path to Bruno output directory (required)
  -y, --yes            Auto-accept all changes without prompting
  -h, --help           Show help
```

### Examples

```bash
# Interactive sync
bruno-openapi-sync -s ./openapi.json -o ./bruno

# Auto-accept all changes
bruno-openapi-sync -s ./openapi.json -o ./bruno --yes
```

### Interactive prompts

For each changed file you'll be prompted:

```
Apply this change? [y/n/a(all)/q(quit)]
```

- **y** — apply this change
- **n** — skip this change
- **a** — apply this and all remaining changes
- **q** — quit without applying further changes

New files are always added automatically. Deleted files (removed from spec) prompt for confirmation.

## Programmatic API

```ts
import { sync } from '@sayedameer/bruno-openapi-sync';

await sync({
  source: './openapi.json',
  output: './bruno',
  yes: true, // optional, auto-accept all
});
```

## License

MIT
