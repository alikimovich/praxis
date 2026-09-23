import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const testing = process.argv.includes('--test');
const urlIndex = process.argv.indexOf('--url');
const requestedURL = urlIndex >= 0 ? process.argv[urlIndex + 1] : undefined;
if (urlIndex >= 0 && !requestedURL) throw new Error('--url requires a URL');
if (requestedURL && !['http:', 'https:'].includes(new URL(requestedURL).protocol)) throw new Error('Expected HTTP(S) preview URL');
await mkdir(`${root}/artifacts`, { recursive: true });
const subscribers = new Set<ReadableStreamDefaultController>();
const server = requestedURL ? null : Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/events') {
      let client: ReadableStreamDefaultController;
      return new Response(new ReadableStream({ start(c) { client = c; subscribers.add(c); c.enqueue(': connected\n\n'); }, cancel() { subscribers.delete(client); } }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    }
    if (path === '/') return new Response(Bun.file(`${root}/fixture/index.html`), { headers: { 'Cache-Control':'no-store' } });
    return new Response('Not found', { status: 404 });
  }
});
const watcher = server ? watch(`${root}/fixture`, () => { for (const c of subscribers) { try { c.enqueue('data: reload\n\n'); } catch { subscribers.delete(c); } } }) : null;
const url = requestedURL || `http://127.0.0.1:${server!.port}/`;
const child = Bun.spawn([`${root}/build/Praxis Runtime.app/Contents/MacOS/PraxisHost`, `${root}/src/selection.js`], { stdin:'pipe', stdout:'pipe', stderr:'inherit' });
let id = 0;
function send(method: string, payload = {}) { child.stdin.write(JSON.stringify({ id: ++id, method, ...payload }) + '\n'); child.stdin.flush(); }
let selections = 0, loaded = 0, isolated = false, passed = false;
const timeout = testing ? setTimeout(() => { console.error('FAIL: native integration test timed out'); child.kill(); }, 25000) : null;
const stop = () => { child.kill(); watcher?.close(); server?.stop(true); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log(`Preview: ${url}`);
console.log('Native host + Bun. Closing the window stops the backend.');
let buffer = '';
const decoder = new TextDecoder();
try {
  for await (const chunk of child.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.event === 'ready') send('load', { url });
      if (event.event === 'loaded') {
        loaded++;
        if (testing) { send('probeIsolation'); send('inspect', { selector:'#demo-button' }); }
      }
      if (event.event === 'isolation') isolated = event.isolated;
      if (event.event === 'selection') {
        console.log('Selected:', event.element);
        await Bun.write(`${root}/artifacts/selection.json`, JSON.stringify(event.element, null, 2));
        if (testing) {
          if (event.element.id !== 'demo-button' || event.element.source !== 'fixture/index.html:15:1' || event.element.bounds.width <= 0) throw new Error('Selection contract failed');
          selections++;
          if (selections === 1) send('reload');
          else send('capture', { path:`${root}/artifacts/preview.png` });
        }
      }
      if (event.event === 'captureRequested') send('capture', { path:`${root}/artifacts/preview.png` });
      if (event.event === 'captured') {
        console.log(`Screenshot: ${event.path}`);
        if (testing) {
          if (!isolated || loaded < 2 || selections < 2 || (await Bun.file(event.path).size) < 1000) throw new Error('Isolation/reload/capture check failed');
          passed = true; console.log('PASS: real WKWebView load, isolated source selection, navigation reinjection, PNG capture.'); send('quit');
        }
      }
      if (event.event === 'error') { console.error(event.message); if (testing) throw new Error(event.message); }
    }
  }
} finally {
  if (timeout) clearTimeout(timeout);
  child.kill(); watcher?.close(); server?.stop(true);
}
const exitCode = await child.exited;
if (testing && !passed) process.exit(1);
if (!testing && exitCode !== 0) process.exit(exitCode);
