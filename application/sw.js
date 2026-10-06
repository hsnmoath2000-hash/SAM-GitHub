'use strict';
const PREFIX='sam-pwa-',VERSION='20261005-onboarding-3',CACHE=PREFIX+VERSION;
const root=new URL('./',self.registration.scope),offline=new URL('offline.html',root).href;
const seed=['offline.html','manifest.json','assets/img/icon-192.png','assets/img/icon-512.png','assets/img/icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(seed.map(x=>new URL(x,root).href))));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith(PREFIX)||k.startsWith('network-manager-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 // No API, credentials, pages, downloads, reports or business data are stored offline.
 if(req.mode==='navigate'){
  e.respondWith(fetch(req).catch(async()=>await caches.match(offline)||new Response('Offline',{status:503})));return;
 }
 const assetPath=url.pathname.slice(root.pathname.length);
 const staticFile=/^assets\/(js|css)\/[^?]+\.(js|css)$/.test(assetPath)||/^assets\/fonts\/[^?]+\.(woff2?|ttf)$/.test(assetPath)||seed.some(x=>url.pathname===new URL(x,root).pathname);
 if(!staticFile&&url.href!==new URL('manifest.json',root).href&&url.href!==offline)return;
 // The version query remains part of the cache key: old code cannot replace a new release.
 e.respondWith((async()=>{
  const c=await caches.open(CACHE),cached=await c.match(req);
  if(cached)return cached;
  try{const res=await fetch(req);if(res.ok&&res.type==='basic'){
   const len=Number(res.headers.get('content-length')||0);
   if(len>0&&len<2000000){try{await c.put(req,res.clone());const keys=await c.keys();if(keys.length>160)await c.delete(keys.find(k=>!seed.some(x=>k.url===new URL(x,root).href))||keys[0]);}catch(cacheError){/* Storage pressure must not interrupt online use. */}}
  }return res;}catch(error){return new Response('',{status:503,statusText:'Offline'});}
 })());
});
