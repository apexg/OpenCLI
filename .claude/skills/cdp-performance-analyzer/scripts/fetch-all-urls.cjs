#!/usr/bin/env node
/**
 * Fetch All URLs via CDP - 递归获取网站所有URL
 *
 * Usage:
 *   node fetch-all-urls.cjs --cdp=http://localhost:9222 https://example.com/sitemap.xml
 *   node fetch-all-urls.cjs --cdp=http://localhost:9222 https://example.com/sitemap.xml --output=urls.txt
 */

const WebSocket = require('ws');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    cdp: process.env.CDP_ENDPOINT || 'http://localhost:9222',
    sitemap: null,
    output: null,
    delay: 1000
  };
  for (const arg of args) {
    if (arg.startsWith('--cdp=')) result.cdp = arg.slice(6);
    else if (arg.startsWith('--output=')) result.output = arg.slice(9);
    else if (arg.startsWith('--delay=')) result.delay = parseInt(arg.slice(8));
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

  if (xml.includes('<sitemapindex')) {
    const sitemapMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
    for (const match of sitemapMatches) {
      sitemaps.push(match[1].trim());
    }
    return { urls, sitemaps, isIndex: true };
  }

  const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of urlMatches) {
    if (match[1].includes('sitemap')) continue;
    urls.push(match[1].trim());
  }
  return { urls, sitemaps: [], isIndex: false };
}

async function fetchSitemap(client, url) {
  await client.send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 2000));

  const result = await client.send('Runtime.evaluate', {
    expression: 'document.body.innerText',
    returnByValue: true
  });

  return parseSitemap(result.result.value || '');
}

async function main() {
  const args = parseArgs();
  if (!args.sitemap) {
    console.error('Usage: node fetch-all-urls.cjs <sitemap-url>');
    process.exit(1);
  }

  const allUrls = new Set();
  const client = new CDPClient();

  try {
    await client.connect(args.cdp);
    console.error('[*] Connected to browser');

    // Queue of sitemaps to process
    const queue = [args.sitemap];
    const processed = new Set();

    while (queue.length > 0) {
      const sitemapUrl = queue.shift();
      if (processed.has(sitemapUrl)) continue;
      processed.add(sitemapUrl);

      console.error(`[*] Fetching: ${sitemapUrl}`);
      try {
        const result = await fetchSitemap(client, sitemapUrl);

        if (result.isIndex) {
          console.error(`[+] Found ${result.sitemaps.length} child sitemaps`);
          queue.push(...result.sitemaps);
        } else {
          console.error(`[+] Found ${result.urls.length} URLs`);
          result.urls.forEach(url => allUrls.add(url));
        }

        if (args.delay > 0) await new Promise(r => setTimeout(r, args.delay));
      } catch (err) {
        console.error(`[!] Failed: ${err.message}`);
      }
    }

    console.error(`\n[*] Total URLs: ${allUrls.size}`);

    const output = Array.from(allUrls).sort();
    if (args.output) {
      fs.writeFileSync(args.output, output.join('\n') + '\n');
      console.error(`[+] Saved to ${args.output}`);
    } else {
      output.forEach(url => console.log(url));
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
