import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import manifest from '../app/manifest.ts';
test('installation identifies one standalone app and provides valid home-screen and maskable icons',async()=>{
 const m=manifest();assert.equal(m.start_url,'/');assert.equal(m.scope,'/');assert.equal(m.display,'standalone');
 for(const icon of m.icons){const image=await sharp('public'+icon.src).metadata();assert.equal(`${image.width}x${image.height}`,icon.sizes);assert.equal(image.format,'png');}
 assert(m.icons.some(i=>i.purpose==='maskable'));
});
test('service worker caches only public assets and never intercepts financial APIs, photos or authentication',async()=>{
 const handlers=new Map(),stored=[],deleted=[];
 const offline=new Response('public offline screen');
 const context={URL,Response,Promise,self:{location:{origin:'https://alagua.dog'},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>({addAll:async paths=>stored.push(...paths)}),keys:async()=>['unrelated-cache','alagua-shell-old'],delete:async key=>deleted.push(key),match:async key=>key==='/offline.html'?offline.clone():undefined},fetch:async()=>{throw Error('offline');}};
 vm.runInNewContext(await fs.readFile('public/sw.js','utf8'),context);
 const tasks=[];handlers.get('install')({waitUntil:p=>tasks.push(p)});handlers.get('activate')({waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
 assert(stored.every(path=>path==='/offline.html'||path.startsWith('/app-icons/')));assert.deepEqual(deleted,['alagua-shell-old']);
 for(const [url,method,mode] of [['https://alagua.dog/api/operations','GET','cors'],['https://alagua.dog/api/workday','POST','cors'],['https://alagua.dog/api/service-photos/a','GET','cors'],['https://clerk.alagua.dog/session','GET','cors'],['https://alagua.dog/sign-in','POST','navigate']]){
  let intercepted=false;handlers.get('fetch')({request:{url,method,mode},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
 }
 let fallback;handlers.get('fetch')({request:{url:'https://alagua.dog/',method:'GET',mode:'navigate'},respondWith:p=>fallback=p});
 assert.equal(await(await fallback).text(),'public offline screen');
});
