#!/usr/bin/env node
/**
 * Sitemap Fetcher via CDP - 通过浏览器获取 sitemap（绕过反爬虫）
 *
 * Usage:
 *   node sitemap-fetcher.cjs --cdp=http://localhost:9222 https://example.com/sitemap.xml
 */

const WebSocket = require('ws');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { cdp: process.env.CDP_ENDPOINT || 'http://localhost:9222', sitemap: null, output: 'urls' };
  for (const arg of args) {
    if (arg.startsWith('--cdp=')) result.cdp = arg.slice(6);
    else if (arg === '--json') result.output = 'json';
    else if (!arg.startsWith('-')) result.sitemap = arg;
  }
  return result;
}

class CDPClient {
  constructor() {
    this.ws = null;
    this.idCounter = 0;
    this.pending = new Map();
  }

  async connect(endpoint) {
    const version = await (await fetch(`${endpoint}/json/version`)).json();
    const browserWs = await this.connectWs(version.webSocketDebuggerUrl);
    const result = await this.sendOnWs(browserWs, 'Target.createTarget', { url: 'about:blank' });
    this.targetId = result.targetId;
    browserWs.close();

    await new Promise(r => setTimeout(r, 100));
    const targets = await (await fetch(`${endpoint}/json`)).json();
    const pageTarget = targets.find(t => t.id === this.targetId);
    this.ws = await this.connectWs(pageTarget.webSocketDebuggerUrl);
    this.setupHandler();
    await this.send('Page.enable');
  }

  setupHandler() {
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }

  connectWs(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 10000);
      ws.on('open', () => { clearTimeout(timeout); resolve(ws); });
      ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  }

  sendOnWs(ws, method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.idCounter;
      const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), timeout);
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timer);
          ws.off('message', handler);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  send(method, params = {}, timeout = 30000) {
    const id = ++this.idCounter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function parseSitemap(xml) {
  const urls = [];
  const sitemaps = [];

  // Check if this is a sitemap index
  if (xml.includes('<sitemapindex')) {
    // Parse child sitemaps
    const sitemapMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
    for (const match of sitemapMatches) {
      sitemaps.push(match[1].trim());
    }
    return { urls, sitemaps, isIndex: true };
  }

  // Direct URLs
  const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of urlMatches) {
    if (match[1].includes('sitemap')) continue; // Skip nested sitemaps
    urls.push(match[1].trim());
  }
  return { urls, sitemaps: [], isIndex: false };
}

async function main() {
  const args = parseArgs();
  if (!args.sitemap) {
    console.error('Usage: node sitemap-fetcher.cjs <sitemap-url>');
    process.exit(1);
  }

  const client = new CDPClient();
  try {
    await client.connect(args.cdp);
    console.error('[*] Connected to browser');

    // Navigate to sitemap
    await client.send('Page.navigate', { url: args.sitemap });
    await new Promise(r => setTimeout(r, 2000));

    // Get page content
    const result = await client.send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    });

    const xml = result.result.value;
    const result_data = parseSitemap(xml || '');

    if (result_data.isIndex) {
      console.error(`[+] Found sitemap index with ${result_data.sitemaps.length} child sitemaps`);
      if (args.output === 'json') {
        console.log(JSON.stringify({ type: 'sitemapindex', sitemaps: result_data.sitemaps }, null, 2));
      } else {
        result_data.sitemaps.forEach(s => console.log(s));
      }
    } else {
      console.error(`[+] Found ${result_data.urls.length} URLs`);
      if (args.output === 'json') {
        console.log(JSON.stringify({ sitemap: args.sitemap, count: result_data.urls.length, urls: result_data.urls }, null, 2));
      } else {
        result_data.urls.forEach(url => console.log(url));
      }
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
