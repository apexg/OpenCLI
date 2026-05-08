#!/usr/bin/env node
/**
 * Sitemap Parser - 解析网站地图获取所有页面 URL
 *
 * Usage:
 *   node sitemap-parser.cjs https://example.com/sitemap.xml
 *   node sitemap-parser.cjs https://example.com --auto  # 自动发现 sitemap
 */

const https = require('https');
const http = require('http');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { url: null, auto: false, output: 'json', limit: 0 };
  for (const arg of args) {
    if (arg === '--auto') result.auto = true;
    else if (arg === '--urls') result.output = 'urls';
    else if (arg.startsWith('--limit=')) result.limit = parseInt(arg.slice(8));
    else if (!arg.startsWith('-')) result.url = arg;
  }
  return result;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseSitemapXml(xml) {
  const urls = [];

  // Standard sitemap
  const urlMatches = xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/gi);
  for (const match of urlMatches) {
    urls.push({ url: match[1].trim(), type: 'page' });
  }

  // Sitemap index (nested sitemaps)
  const sitemapMatches = xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi);
  for (const match of sitemapMatches) {
    urls.push({ url: match[1].trim(), type: 'sitemap' });
  }

  return urls;
}

async function discoverSitemap(baseUrl) {
  const urlObj = new URL(baseUrl);
  const candidates = [
    urlObj.origin + '/sitemap.xml',
    urlObj.origin + '/sitemap_index.xml',
    urlObj.origin + '/sitemap',
  ];

  for (const url of candidates) {
    try {
      const xml = await fetchUrl(url);
      if (xml.includes('<urlset') || xml.includes('<sitemapindex')) {
        return url;
      }
    } catch (e) {}
  }
  return null;
}

async function getAllUrls(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const xml = await fetchUrl(sitemapUrl);
  const items = parseSitemapXml(xml);
  const urls = [];

  for (const item of items) {
    if (item.type === 'sitemap') {
      // Recursively fetch nested sitemaps
      const nestedUrls = await getAllUrls(item.url, visited);
      urls.push(...nestedUrls);
    } else {
      urls.push(item.url);
    }
  }

  return urls;
}

async function main() {
  const args = parseArgs();

  if (!args.url) {
    console.error('Usage: node sitemap-parser.cjs <url>');
    console.error('  --auto     Auto-discover sitemap from base URL');
    console.error('  --urls     Output one URL per line');
    console.error('  --limit=N  Limit number of URLs');
    process.exit(1);
  }

  try {
    let sitemapUrl = args.url;

    // Auto-discover sitemap
    if (args.auto && !args.url.includes('sitemap')) {
      console.error('[*] Discovering sitemap...');
      sitemapUrl = await discoverSitemap(args.url);
      if (!sitemapUrl) {
        console.error('[!] No sitemap found, using base URL');
        sitemapUrl = args.url;
      } else {
        console.error('[+] Found: ' + sitemapUrl);
      }
    }

    console.error('[*] Fetching sitemap...');
    const urls = await getAllUrls(sitemapUrl);

    console.error('[+] Found ' + urls.length + ' URLs');

    // Apply limit
    const limitedUrls = args.limit > 0 ? urls.slice(0, args.limit) : urls;

    // Output
    if (args.output === 'urls') {
      limitedUrls.forEach(url => console.log(url));
    } else {
      console.log(JSON.stringify({
        sitemap: sitemapUrl,
        totalUrls: urls.length,
        returned: limitedUrls.length,
        urls: limitedUrls
      }, null, 2));
    }

  } catch (error) {
    console.error('[ERROR] ' + error.message);
    process.exit(1);
  }
}

main();
