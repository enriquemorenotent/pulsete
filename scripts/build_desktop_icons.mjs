import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const source = await readFile(new URL('../public/favicon.svg', import.meta.url));
const output = new URL('../build-resources/icons/', import.meta.url);
await mkdir(output, { recursive: true });

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const icon = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  }).render();
  await writeFile(new URL(`${size}x${size}.png`, output), icon.asPng());
}
console.log('Desktop icons exported from public/favicon.svg.');
