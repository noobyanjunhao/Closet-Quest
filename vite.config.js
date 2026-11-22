import { defineConfig } from 'vite';
import { createApi } from './server/api.js';
import { createEventAvatar, EVENT_AVATAR_PATH } from './server/event-avatar.js';
// Development and the standalone build share the same durable local API.
export default defineConfig({plugins:[{name:'local-fashion-agents',configureServer(server){
  const api=createApi(),eventAvatar=createEventAvatar();
  // Mounted first so the public event route is not handled by the authenticated API.
  server.middlewares.use(EVENT_AVATAR_PATH,(req,res)=>eventAvatar.handle(req,res));
  server.middlewares.use('/api',api.middleware);
  server.httpServer?.once('close',()=>api.close());
}}]});
