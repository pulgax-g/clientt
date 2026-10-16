import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8085;
const ASSETS_REMOTE = 'https://assets.clutcher.io/';
const CLUTCHER_REMOTE = 'https://www.clutcher.io/';

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.gz': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

async function fetchRemoteAndCache(remoteUrl, localPath) {
  const dir = path.dirname(localPath);
  fs.mkdirSync(dir, { recursive: true });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://www.clutcher.io',
    'Referer': 'https://www.clutcher.io/'
  };

  const resp = await fetch(remoteUrl, { headers });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${remoteUrl}: ${resp.status} ${resp.statusText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(localPath, buffer);

  return {
    buffer,
    contentType: resp.headers.get('content-type') || MIME_TYPES[path.extname(localPath)] || 'application/octet-stream'
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    let reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    const cleanPath = pathname.replace(/^\//, '');
    const localFilePath = path.join(__dirname, cleanPath);

    // 1. Check local filesystem directly
    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
      const ext = path.extname(localFilePath);
      const isGz = ext === '.gz' || localFilePath.endsWith('.bin.gz');
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileData = fs.readFileSync(localFilePath);

      const headers = {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      };

      if (isGz) {
        headers['Content-Encoding'] = 'gzip';
      }

      res.writeHead(200, headers);
      res.end(fileData);
      return;
    }

    // 2. Fallback to remote servers based on path
    let remoteUrl = '';
    if (cleanPath.startsWith('models/cs2/')) {
      const sub = cleanPath.slice('models/cs2/'.length);
      remoteUrl = ASSETS_REMOTE + 'z/models/cs2/' + sub;
    } else if (cleanPath.startsWith('models/')) {
      const sub = cleanPath.slice('models/'.length);
      remoteUrl = ASSETS_REMOTE + 'models/' + sub;
    } else if (cleanPath.startsWith('assets/z/')) {
      const sub = cleanPath.slice('assets/z/'.length);
      remoteUrl = ASSETS_REMOTE + 'z/' + sub;
    } else if (cleanPath.startsWith('assets/')) {
      const sub = cleanPath.slice('assets/'.length);
      remoteUrl = ASSETS_REMOTE + sub;
    } else {
      remoteUrl = CLUTCHER_REMOTE + cleanPath;
    }

    console.log(`[Cache Miss] Fetching remote file: ${remoteUrl}`);
    try {
      const result = await fetchRemoteAndCache(remoteUrl, localFilePath);
      const ext = path.extname(localFilePath);
      const isGz = ext === '.gz' || localFilePath.endsWith('.bin.gz');

      const headers = {
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=86400'
      };

      if (isGz) {
        headers['Content-Encoding'] = 'gzip';
      }

      res.writeHead(200, headers);
      res.end(result.buffer);
      return;
    } catch (err) {
      console.warn(`File not found remotely or locally: ${pathname} (${err.message})`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Counter-Strike 1.6 Web server running at http://localhost:${PORT}`);
});
