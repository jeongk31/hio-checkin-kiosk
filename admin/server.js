const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Check if SSL certificates exist
const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');

const useHttps = fs.existsSync(keyPath) && fs.existsSync(certPath);

if (!useHttps) {
  console.log('\n⚠️  SSL certificates not found!');
  console.log('Running in HTTP mode. To enable HTTPS:');
  console.log('\n1. Install mkcert: https://github.com/FiloSottile/mkcert');
  console.log('2. Run these commands:');
  console.log('   mkdir certs');
  console.log('   cd certs');
  console.log('   mkcert -install');
  console.log('   mkcert localhost 192.168.1.* *.local 127.0.0.1 ::1');
  console.log('   Rename files to: localhost-key.pem and localhost.pem');
  console.log('\n3. Restart the server\n');
  
  // Fall back to regular HTTP server
  const { createServer: createHttpServer } = require('http');
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    createHttpServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    }).listen(port, (err) => {
      if (err) throw err;
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  });
} else {
  // HTTPS configuration
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    createServer(httpsOptions, async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    }).listen(port, (err) => {
      if (err) throw err;
      console.log(`> Ready on https://${hostname}:${port}`);
      console.log(`> Also accessible at https://192.168.1.* (your network IP)`);
      console.log('\n✅ HTTPS enabled - Camera/microphone will work over network!');
    });
  });
}
