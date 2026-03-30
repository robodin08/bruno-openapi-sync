#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { sync } from './sync.js';

const { values } = parseArgs({
  options: {
    source: { type: 'string', short: 's' },
    output: { type: 'string', short: 'o' },
    yes: { type: 'boolean', short: 'y' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Usage: bruno-openapi-sync [options]

Sync OpenAPI spec to Bruno collection with git-style diffs.

Options:
  -s, --source <path>  Path to OpenAPI JSON file (required)
  -o, --output <path>  Path to Bruno output directory (required)
  -y, --yes            Auto-accept all changes without prompting
  -h, --help           Show this help message

Examples:
  bruno-openapi-sync -s ./openapi.json -o ./bruno
  bruno-openapi-sync --source api/spec.json --output collections/api --yes
`);
  process.exit(0);
}

if (!values.source) {
  console.error('Error: --source is required');
  process.exit(1);
}

if (!values.output) {
  console.error('Error: --output is required');
  process.exit(1);
}

sync({
  source: values.source,
  output: values.output,
  yes: values.yes,
}).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
