import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const sourceRoot = resolve(process.env.SITE_SOURCE_ROOT ?? 'site');
const outputRoot = resolve(process.env.SITE_OUT_DIR ?? process.env.APT_SITE_ROOT ?? 'pages');
const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const releaseVersion = packageJson.version;

if (typeof releaseVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(releaseVersion)) {
  throw new Error('package.json must contain a valid release version');
}

await buildLandingSite();

async function buildLandingSite() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(sourceRoot, outputRoot, { recursive: true });
  await cp('public/favicon.svg', join(outputRoot, 'favicon.svg'));
  await cp('public/pulsete-logo.svg', join(outputRoot, 'pulsete-logo.svg'));
  await copySiteFonts();

  const indexPath = join(outputRoot, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, indexHtml.replaceAll('{{VERSION}}', releaseVersion));
  await writeFile(join(outputRoot, '.nojekyll'), '');
  console.log(`Landing site written to ${outputRoot}`);
}

async function copySiteFonts() {
  const fontOutput = join(outputRoot, 'fonts');
  await mkdir(fontOutput, { recursive: true });

  const fontFiles = [
    ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 'ibm-plex-sans-400.woff2'],
    ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 'ibm-plex-sans-500.woff2'],
    ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', 'ibm-plex-sans-600.woff2'],
    ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-400.woff2'],
  ];

  await Promise.all(
    fontFiles.map(async ([modulePath, outputName]) => {
      const sourcePath = import.meta.resolve(modulePath);
      await cp(new URL(sourcePath), join(fontOutput, outputName));
    }),
  );
}
