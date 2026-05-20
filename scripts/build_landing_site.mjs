import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const sourceRoot = resolve(process.env.SITE_SOURCE_ROOT ?? 'site');
const outputRoot = resolve(process.env.SITE_OUT_DIR ?? process.env.APT_SITE_ROOT ?? 'pages');

await buildLandingSite();

async function buildLandingSite() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(sourceRoot, outputRoot, { recursive: true });
  await cp('public/favicon.svg', join(outputRoot, 'favicon.svg'));
  await cp('public/pulsete-logo.svg', join(outputRoot, 'pulsete-logo.svg'));
  await writeFile(join(outputRoot, '.nojekyll'), '');
  console.log(`Landing site written to ${outputRoot}`);
}
