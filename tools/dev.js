#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const WATCH_TARGETS = [
  path.join(ROOT, 'server.js'),
  path.join(ROOT, 'public'),
  path.join(ROOT, 'data'),
];

let server = null;
let restarting = false;
let debounceTimer = null;

function log(...args) { console.log('[dev]', ...args); }

function start() {
  const env = { ...process.env, NODE_ENV: 'development' };
  server = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env });
  server.on('exit', (code, signal) => {
    if (restarting) return; // We requested it
    log(`Server exited with code=${code} signal=${signal}`);
  });
}

function stop(cb) {
  if (!server) return cb && cb();
  restarting = true;
  server.on('exit', () => {
    restarting = false;
    cb && cb();
  });
  try { server.kill('SIGTERM'); } catch (_) { /* ignore */ }
  setTimeout(() => { try { server.kill('SIGKILL'); } catch (_) {} }, 1000);
}

function restart() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    log('Changes detected — restarting...');
    stop(() => start());
  }, 150);
}

function walkDirs(dir, onDir) {
  let st;
  try { st = fs.statSync(dir); } catch { return; }
  if (!st.isDirectory()) return;
  onDir && onDir(dir);
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDirs(p, onDir);
  }
}

const watchers = new Map();
function watchDir(dir) {
  if (watchers.has(dir)) return;
  try {
    const w = fs.watch(dir, { persistent: true }, (evt, name) => {
      // Any change under watched dirs triggers restart
      restart();
      // If new subdirectories appear, start watching them too
      if (name) {
        const p = path.join(dir, name.toString());
        try {
          const st = fs.statSync(p);
          if (st.isDirectory()) watchDir(p);
        } catch {}
      }
    });
    watchers.set(dir, w);
    log('Watching', path.relative(ROOT, dir));
  } catch (e) {
    // ignore
  }
}

function initWatchers() {
  for (const target of WATCH_TARGETS) {
    try {
      const st = fs.statSync(target);
      if (st.isDirectory()) {
        walkDirs(target, watchDir);
      } else {
        // watch parent dir for file changes
        watchDir(path.dirname(target));
      }
    } catch {}
  }
}

process.on('SIGINT', () => {
  log('Shutting down...');
  if (server) server.kill('SIGINT');
  for (const w of watchers.values()) try { w.close(); } catch {}
  process.exit(0);
});

start();
initWatchers();
log('Dev mode running. Edit files to auto-restart.');
