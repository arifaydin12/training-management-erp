// Minimal static file server used to preview the demo build under a sub-path,
// the way GitHub Pages serves it.
// Usage: node scripts/serve-static.js <dir> <port> <prefix>
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const [dirArg = 'docs', portArg = '4173', prefixArg = '/'] = process.argv.slice(2);
const dir = path.resolve(dirArg);
const prefix = prefixArg.endsWith('/') ? prefixArg : `${prefixArg}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel === prefix.slice(0, -1)) {
      res.writeHead(301, { Location: prefix }).end();
      return;
    }
    if (!rel.startsWith(prefix)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found (outside the base path)');
      return;
    }
    rel = rel.slice(prefix.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  })
  .listen(Number(portArg), () => console.log(`Serving ${dir} at http://localhost:${portArg}${prefix}`));
