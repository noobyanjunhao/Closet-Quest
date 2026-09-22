import { defineConfig } from 'vite';
import { createApi } from './server/api.js';
// Development and the standalone build share the same durable local API.
export default defineConfig({plugins:[{name:'local-fashion-agents',configureServer(server){
  const api=createApi();
  server.middlewares.use('/api',api.middleware);
  server.httpServer?.once('close',()=>api.close());
}}]});
