import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi} from './api.js';

const defaultRoot=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
const inside=(root,target)=>{const relative=path.relative(root,target);return relative!== '..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};

export async function createLocalServer({distDir=defaultRoot,apiOptions={}}={}) {
  const root=await realpath(distDir).catch(()=>{throw new Error('Build the client first with npm run build.');});
  await stat(path.join(root,'index.html')).catch(()=>{throw new Error('Build the client first with npm run build.');});
  const api=createApi(apiOptions);
  const server=http.createServer(async(req,res)=>{
    if(req.url?.startsWith('/api/')){req.url=req.url.slice(4);return api.middleware(req,res);}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    let requestPath;
    try{requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end('Invalid path');return;}
    const file=path.resolve(root,'.'+(requestPath==='/'?'/index.html':requestPath));
    if(!inside(root,file)||path.relative(root,file).split(path.sep).some(part=>part.startsWith('.'))){res.writeHead(403).end('Not allowed');return;}
    try{
      const actual=await realpath(file);
      if(!inside(root,actual)){res.writeHead(403).end('Not allowed');return;}
      const data=await readFile(actual);
      res.setHeader('Content-Type',types[path.extname(actual)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Length',data.length);
      res.setHeader('Cache-Control',path.basename(actual)==='index.html'?'no-cache':'public, max-age=3600');
      res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404).end('Not found');}
  });
  server.on('close',()=>api.close());
  server.on('error',()=>api.close());
  server.shutdown=()=>new Promise(resolve=>{
    api.close();
    if(!server.listening){resolve();return;}
    const timer=setTimeout(()=>server.closeAllConnections(),5000);timer.unref();
    server.close(()=>{clearTimeout(timer);resolve();});server.closeIdleConnections();
  });
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4173);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be between 1024 and 65535.');
  const server=await createLocalServer();
  server.listen(port,'127.0.0.1',()=>console.log(`Closet Quest app and local API: http://127.0.0.1:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.shutdown().then(()=>process.exit(0)));
}
