const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const STOPS_FILE = path.join(__dirname, 'stops.json');

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
    // Handle API Save
    if (req.method === 'POST' && req.url === '/api/save') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                fs.writeFileSync(STOPS_FILE, body, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                console.log('✅ stops.json updated');
            } catch (err) {
                res.writeHead(500);
                res.end(err.message);
                console.error('❌ Failed to save stops.json:', err);
            }
        });
        return;
    }

    // Static File Server
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error(`❌ 404: ${pathname}`);
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
        res.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 WanderFlur Editor running at http://localhost:${PORT}`);
    console.log(`💾 Auto-save to ${STOPS_FILE} is active\n`);
});
