import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distDir = resolve(root, 'dist');
const distHtmlPath = resolve(distDir, 'index.html');
const outPath = resolve(root, 'index.offline.html');

const html = readFileSync(distHtmlPath, 'utf8');

const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/i);
const jsMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/i);

if (!cssMatch || !jsMatch) {
  throw new Error('Cannot locate built CSS/JS asset references in dist/index.html');
}

const cssPath = resolve(distDir, cssMatch[1].replace(/^\//, ''));
const jsPath = resolve(distDir, jsMatch[1].replace(/^\//, ''));

const css = readFileSync(cssPath, 'utf8');
const js = readFileSync(jsPath, 'utf8');

const offlineHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Snapdata (Offline)</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${js}</script>
  </body>
</html>
`;

writeFileSync(outPath, offlineHtml, 'utf8');
console.log(`Generated ${outPath}`);
