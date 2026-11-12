import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
// Shopify caps app-block JavaScript at 10 KB. Keep readable source in scripts/.
const { code } = await transform(await readFile('scripts/shopify-consent/consent.js', 'utf8'), {
  minify: true, target: 'es2020', charset: 'utf8',
});
const path = 'extensions/whachat-consent/assets/consent.js';
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8') !== code) throw new Error('Run node scripts/build-shopify-consent.mjs');
} else await writeFile(path, code);
