import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const testsDirectory = fileURLToPath(new URL('../tests/', import.meta.url));
const numberedShardPattern = /(?:^|[.-])part-\d+/;

const listFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

const files = listFiles(testsDirectory);
const violations = files.filter((path) =>
  numberedShardPattern.test(path.split('/tests/')[1] ?? path)
);

if (violations.length > 0) {
  console.error('Numbered test shards are not allowed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

const importOnlyAggregators = files.filter((path) => {
  if (!/\.test\.[cm]?[jt]sx?$/.test(path)) {
    return false;
  }
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0
    && lines.every((line) => /^import ['"]\.\/.*\.js['"];?$/.test(line));
});

if (importOnlyAggregators.length > 0) {
  console.error('Import-only test aggregators are not allowed:');
  for (const violation of importOnlyAggregators) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
