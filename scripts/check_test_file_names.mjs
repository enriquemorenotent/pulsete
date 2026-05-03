import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const testsDirectory = fileURLToPath(new URL('../tests/', import.meta.url));
const numberedShardPattern = /(?:^|[.-])part-\d+/;

const listFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

const violations = listFiles(testsDirectory).filter((path) =>
  numberedShardPattern.test(path.split('/tests/')[1] ?? path)
);

if (violations.length > 0) {
  console.error('Numbered test shards are not allowed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}
