/* Servidor local sencillo para probar el catálogo.
   Uso:  node servidor.js
   Luego abre: http://localhost:8080
*/

const http = require('http');
const fs = require('fs');
const path = require('path');

const raiz = __dirname;
const puerto = Number(process.env.PORT) || 8080;

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

http
  .createServer((peticion, respuesta) => {
    const url = decodeURIComponent((peticion.url || '/').split('?')[0]);
    const relativa = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const archivo = path.resolve(raiz, relativa);

    if (!archivo.startsWith(raiz + path.sep)) {
      respuesta.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('Prohibido');
      return;
    }

    fs.stat(archivo, (error, datos) => {
      if (error || !datos.isFile()) {
        respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        respuesta.end('No encontrado');
        return;
      }

      const extension = path.extname(archivo).toLowerCase();
      respuesta.writeHead(200, {
        'Content-Type': tipos[extension] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(archivo).pipe(respuesta);
    });
  })
  .listen(puerto, () => {
    console.log(`Catálogo disponible en http://localhost:${puerto}`);
  });
