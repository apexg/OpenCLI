#!/usr/bin/env node
/**
 * CDP Performance Analyzer - Standalone Script
 *
 * Connects directly to CDP endpoint without OpenCLI dependency.
 *
 * Usage:
 *   node performance-analyzer.js --cdp=http://localhost:9222 --url=https://example.com
 *   node performance-analyzer.js --cdp=http://localhost:9222 --reuse  (reuse existing page)
 *
 * Environment variables:
 *   CDP_ENDPOINT - CDP endpoint URL (default: http://localhost:9222)
 */

const WebSocket = require('ws');

// ============================================
// CLI Arguments Parser
// ============================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    cdp: process.env.CDP_ENDPOINT || 'http://localhost:9222',
    url: null,
    reuse: false,
    timeout: 30000,
    output: 'json'
  };

  for (const arg of args) {
    if (arg.startsWith('--cdp=')) result.cdp = arg.slice(6);
    else if (arg.startsWith('--url=')) result.url = arg.slice(6);
    else if (arg === '--reuse') result.reuse = true;
    else if (arg.startsWith('--timeout=')) result.timeout = parseInt(arg.slice(10));
    else if (arg === '--report') result.output = 'report';
    else if (!arg.startsWith('-') && !result.url) result.url = arg;
  }

  return result;
}

// ============================================
// CDP Client
// ============================================

class CDPClient {
  constructor() {
    this.ws = null;
    this.idCounter = 0;
    this.pending = new Map();
    this.targetId = null;
    this.shouldReuse = false;
  }

  async connect(endpoint) {
    // Get browser WebSocket URL
    const version = await this.fetchJson(`${endpoint}/json/version`);
    const browserWsUrl = version.webSocketDebuggerUrl;

    // Check for existing page to reuse
    if (this.shouldReuse) {
      const targets = await this.fetchJson(`${endpoint}/json`);
      const existingPage = targets.find(t => t.type === 'page' && t.url !== 'about:blank');
      if (existingPage) {
        this.targetId = existingPage.id;
        await this.connectPage(existingPage.webSocketDebuggerUrl);
        return;
      }
    }

    // Create new page
    const browserWs = await this.connectWs(browserWsUrl);
    const result = await this.sendOnWs(browserWs, 'Target.createTarget', { url: 'about:blank' });
    this.targetId = result.targetId;
    browserWs.close();

    // Connect to new page
    await new Promise(r => setTimeout(r, 100));
    const targets = await this.fetchJson(`${endpoint}/json`);
    const pageTarget = targets.find(t => t.id === this.targetId);
    if (!pageTarget) throw new Error('Failed to find created page target');

    await this.connectPage(pageTarget.webSocketDebuggerUrl);
  }

  async connectPage(wsUrl) {
    this.ws = await this.connectWs(wsUrl);
    this.setupMessageHandler();
    await this.send('Page.enable');
  }

  setupMessageHandler() {
    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject, timer } = this.pending.get(msg.id);
          clearTimeout(timer);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {}
    });
  }

  connectWs(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('WebSocket connection timeout')); }, 10000);
      ws.on('open', () => { clearTimeout(timeout); resolve(ws); });
      ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  }

  sendOnWs(ws, method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.idCounter;
      const timer = setTimeout(() => reject(new Error(`CDP command '${method}' timed out`)), timeout);
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            clearTimeout(timer);
            ws.off('message', handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        } catch (e) {}
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  send(method, params = {}, timeout = 30000) {
    if (!this.ws) throw new Error('Not connected');
    const id = ++this.idCounter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP command '${method}' timed out`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async fetchJson(url) {
    const response = await fetch(url);
    return response.json();
  }

  async close() {
    if (this.targetId) {
      try { await this.send('Target.closeTarget', { targetId: this.targetId }); } catch (e) {}
    }
    if (this.ws) this.ws.close();
  }
}

// ============================================
// Performance Analysis Script (injected into page)
// ============================================

const PERFORMANCE_SCRIPT = `
(function() {
  // Core Web Vitals collection with PerformanceObserver buffered:true
  // This captures metrics that may have already been dispatched during page load
  function getCoreWebVitals() {
    const timing = performance.timing;
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = performance.getEntriesByType('paint');

    const ttfb = nav.responseStart - nav.requestStart || timing.responseStart - timing.fetchStart;
    const fcp = paint.find(e => e.name === 'first-contentful-paint')?.startTime || 0;

    // LCP: Use PerformanceObserver with buffered:true to capture past entries
    // Note: LCP may be 0 for certain page types (SPAs, lazy-loaded content, cached pages)
    let lcp = 0;
    let lcpElement = null;
    try {
      const lcpEntries = [];
      const po = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach(entry => lcpEntries.push(entry));
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
      po.disconnect();

      if (lcpEntries.length > 0) {
        const lastLcp = lcpEntries[lcpEntries.length - 1];
        lcp = lastLcp.startTime;
        lcpElement = lastLcp.element?.tagName;
      }
    } catch (e) {
      // Fallback: try getEntriesByType
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        lcp = lcpEntries[lcpEntries.length - 1].startTime;
      }
    }

    // If LCP is still 0, estimate from largest visible image
    if (lcp === 0) {
      const images = document.querySelectorAll('img');
      let largestImgTime = 0;
      images.forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
          const rect = img.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 100) { // Only consider visible images
            const area = rect.width * rect.height;
            // Find resource timing for this image
            const resources = performance.getEntriesByType('resource');
            const imgResource = resources.find(r => img.src && r.name.includes(img.src.split('?')[0].split('/').pop()));
            if (imgResource && imgResource.responseEnd > largestImgTime) {
              largestImgTime = imgResource.responseEnd;
            }
          }
        }
      });
      if (largestImgTime > 0) {
        // Use image load time as LCP estimate (conservative estimate)
        // lcp = largestImgTime; // Commented out to keep original LCP=0 for transparency
      }
    }

    // CLS: Use PerformanceObserver with buffered:true
    let cls = 0;
    try {
      const clsEntries = [];
      const po = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach(entry => {
          if (!entry.hadRecentInput) clsEntries.push(entry);
        });
      });
      po.observe({ type: 'layout-shift', buffered: true });
      po.disconnect();
      cls = clsEntries.reduce((sum, e) => sum + e.value, 0);
    } catch (e) {
      performance.getEntriesByType('layout-shift').forEach(e => {
        if (!e.hadRecentInput) cls += e.value;
      });
    }

    // INP: Requires user interaction (click, key, pointer)
    // Will be 0 in automated testing without interaction simulation
    let inp = 0;
    try {
      const eventEntries = [];
      const po = new PerformanceObserver((entryList) => {
        entryList.getEntries().forEach(entry => eventEntries.push(entry));
      });
      po.observe({ type: 'event', buffered: true });
      po.disconnect();

      if (eventEntries.length > 0) {
        const eventMap = new Map();
        eventEntries.forEach(e => {
          if (e.interactionId) {
            if (!eventMap.has(e.interactionId)) eventMap.set(e.interactionId, []);
            eventMap.get(e.interactionId).push(e);
          }
        });
        eventMap.forEach(entries => {
          const max = Math.max(...entries.map(e => e.duration || 0));
          if (max > inp) inp = max;
        });
      }
    } catch (e) {}

    return {
      ttfb: Math.round(ttfb),
      fcp: Math.round(fcp),
      lcp: Math.round(lcp),
      cls: Math.round(cls * 1000) / 1000,
      inp: Math.round(inp),
      domContentLoaded: timing.domContentLoadedEventEnd - timing.fetchStart,
      loadComplete: timing.loadEventEnd - timing.fetchStart
    };
  }

  function getNetworkWaterfall() {
    const resources = performance.getEntriesByType('resource');
    const typeMap = { script: 'js', link: 'css', img: 'img', image: 'img', fetch: 'api', xmlhttprequest: 'xhr', video: 'video', audio: 'audio', font: 'font', other: 'other' };

    // By type statistics
    const byType = {};
    resources.forEach(r => {
      const type = typeMap[r.initiatorType] || 'other';
      if (!byType[type]) byType[type] = { count: 0, totalSize: 0, totalDuration: 0 };
      byType[type].count++;
      byType[type].totalSize += r.transferSize || 0;
      byType[type].totalDuration += r.duration;
    });

    const totalSize = resources.reduce((s, r) => s + (r.transferSize || 0), 0);

    // Top 10 by size
    const topBySize = resources.filter(r => r.transferSize > 0).sort((a, b) => b.transferSize - a.transferSize).slice(0, 10)
      .map(r => ({ url: r.name.split('?')[0].slice(-80), type: typeMap[r.initiatorType] || 'other', size: r.transferSize, sizeKB: Math.round(r.transferSize / 1024), duration: Math.round(r.duration), startTime: Math.round(r.startTime) }));

    // Top 10 slowest
    const topByDuration = resources.sort((a, b) => b.duration - a.duration).slice(0, 10)
      .map(r => ({ url: r.name.split('?')[0].slice(-80), type: typeMap[r.initiatorType] || 'other', duration: Math.round(r.duration), size: r.transferSize, startTime: Math.round(r.startTime) }));

    // Large images (> 100KB)
    const largeImages = resources.filter(r => (typeMap[r.initiatorType] === 'img' || typeMap[r.initiatorType] === 'image') && r.transferSize > 102400)
      .sort((a, b) => b.transferSize - a.transferSize).slice(0, 10)
      .map(r => ({ url: r.name.split('?')[0].slice(-80), size: r.transferSize, sizeKB: Math.round(r.transferSize / 1024), duration: Math.round(r.duration) }));

    // Large videos (> 500KB)
    const largeVideos = resources.filter(r => typeMap[r.initiatorType] === 'video' && r.transferSize > 512000)
      .sort((a, b) => b.transferSize - a.transferSize).slice(0, 10)
      .map(r => ({ url: r.name.split('?')[0].slice(-80), size: r.transferSize, sizeMB: Math.round(r.transferSize / 1024 / 1024 * 100) / 100, duration: Math.round(r.duration) }));

    // Waterfall timeline (grouped by 100ms intervals)
    const waterfall = [];
    const maxTime = Math.max(...resources.map(r => r.startTime + r.duration));
    const interval = 100;
    for (let t = 0; t < maxTime; t += interval) {
      const bucket = { start: t, end: t + interval, requests: 0, bytes: 0, types: {} };
      resources.forEach(r => {
        if (r.startTime >= t && r.startTime < t + interval) {
          bucket.requests++;
          bucket.bytes += r.transferSize || 0;
          const type = typeMap[r.initiatorType] || 'other';
          bucket.types[type] = (bucket.types[type] || 0) + 1;
        }
      });
      if (bucket.requests > 0) waterfall.push(bucket);
    }

    // Critical path (blocking JS/CSS in head)
    const criticalPath = resources.filter(r => (r.initiatorType === 'script' || r.initiatorType === 'link') && r.startTime < 1000)
      .sort((a, b) => a.startTime - b.startTime)
      .map(r => ({ url: r.name.split('?')[0].slice(-60), type: typeMap[r.initiatorType], startTime: Math.round(r.startTime), duration: Math.round(r.duration), blocking: r.initiatorType === 'script' }));

    return {
      totalRequests: resources.length,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { count: v.count, totalSizeKB: Math.round(v.totalSize / 1024), avgDuration: Math.round(v.totalDuration / v.count) }])),
      topBySize,
      topByDuration,
      largeImages,
      largeVideos,
      waterfall: waterfall.slice(0, 30),
      criticalPath
    };
  }

  function getMainThreadBlocking() {
    const longTasks = performance.getEntriesByType('longtask') || [];
    const tbt = longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
    return {
      longTasksCount: longTasks.length,
      totalBlockingTime: Math.round(tbt),
      topTasks: longTasks.sort((a, b) => b.duration - a.duration).slice(0, 5).map(t => ({ duration: Math.round(t.duration), name: t.name }))
    };
  }

  function getMemory() {
    if (!performance.memory) return { supported: false };
    return {
      supported: true,
      usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
      totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 100) / 100,
      limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024 * 100) / 100
    };
  }

  function getDOMStats() {
    const getDepth = (el, d) => {
      if (!el || !el.children || !el.children.length) return d;
      let max = d;
      for (let i = 0; i < Math.min(el.children.length, 50); i++) max = Math.max(max, getDepth(el.children[i], d + 1));
      return max;
    };
    return { totalElements: document.querySelectorAll('*').length, depth: getDepth(document.body, 0) };
  }

  function calculateScore(metrics) {
    const t = { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500] };
    const scores = {};
    for (const [k, v] of Object.entries(metrics)) {
      if (v === 0 || !t[k]) continue;
      const [good, needs] = t[k];
      scores[k] = v <= good ? 100 : v <= needs ? 50 + 40 * (needs - v) / (needs - good) : Math.max(0, 50 * (needs - v) / needs);
    }
    const weights = { ttfb: 0.1, fcp: 0.1, lcp: 0.25, cls: 0.25, inp: 0.3 };
    let sum = 0, w = 0;
    for (const [k, s] of Object.entries(scores)) { if (weights[k]) { sum += s * weights[k]; w += weights[k]; } }
    return { scores, overall: w > 0 ? Math.round(sum / w) : null };
  }

  const vitals = getCoreWebVitals();
  const network = getNetworkWaterfall();
  const mainThread = getMainThreadBlocking();
  const memory = getMemory();
  const dom = getDOMStats();
  const scoring = calculateScore(vitals);

  return {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    coreWebVitals: vitals,
    network,
    mainThread,
    memory,
    dom,
    scoring,
    summary: {
      score: scoring.overall,
      grade: scoring.overall >= 90 ? 'A' : scoring.overall >= 75 ? 'B' : scoring.overall >= 50 ? 'C' : 'D',
      issues: [
        vitals.lcp > 4000 ? 'LCP slow (' + vitals.lcp + 'ms)' : null,
        vitals.cls > 0.25 ? 'CLS high (' + vitals.cls + ')' : null,
        mainThread.totalBlockingTime > 300 ? 'MainThread blocked (' + mainThread.totalBlockingTime + 'ms)' : null,
        network.totalSizeMB > 5 ? 'Page large (' + network.totalSizeMB + 'MB)' : null,
        network.largeImages.length > 0 ? 'Large images: ' + network.largeImages.length : null,
        network.largeVideos.length > 0 ? 'Large videos: ' + network.largeVideos.length : null
      ].filter(Boolean)
    }
  };
})();
`;

// ============================================
// Report Printer
// ============================================

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log(' PERFORMANCE REPORT');
  console.log('='.repeat(70));
  console.log('\nURL: ' + report.url);
  console.log('Timestamp: ' + report.timestamp);

  console.log('\n' + '-'.repeat(70));
  console.log(' CORE WEB VITALS');
  console.log('-'.repeat(70));
  console.log('  TTFB: ' + report.coreWebVitals.ttfb + 'ms');
  console.log('  FCP:  ' + report.coreWebVitals.fcp + 'ms');
  console.log('  LCP:  ' + report.coreWebVitals.lcp + 'ms');
  console.log('  CLS:  ' + report.coreWebVitals.cls);
  console.log('  INP:  ' + report.coreWebVitals.inp + 'ms');

  console.log('\n' + '-'.repeat(70));
  console.log(' NETWORK OVERVIEW');
  console.log('-'.repeat(70));
  console.log('  Total Requests: ' + report.network.totalRequests);
  console.log('  Total Size: ' + report.network.totalSizeMB + ' MB');

  // By type
  console.log('\n  By Type:');
  for (const [type, data] of Object.entries(report.network.byType)) {
    console.log('    ' + type.toUpperCase() + ': ' + data.count + ' requests, ' + data.totalSizeKB + 'KB, avg ' + data.avgDuration + 'ms');
  }

  // Large images
  if (report.network.largeImages && report.network.largeImages.length > 0) {
    console.log('\n  Large Images (>100KB):');
    report.network.largeImages.forEach(function(img, i) {
      console.log('    [' + (i+1) + '] ' + img.sizeKB + 'KB - ' + img.url);
    });
  }

  // Large videos
  if (report.network.largeVideos && report.network.largeVideos.length > 0) {
    console.log('\n  Large Videos (>500KB):');
    report.network.largeVideos.forEach(function(vid, i) {
      console.log('    [' + (i+1) + '] ' + vid.sizeMB + 'MB - ' + vid.url);
    });
  }

  // Top by size
  if (report.network.topBySize && report.network.topBySize.length > 0) {
    console.log('\n  Top 5 Largest Resources:');
    report.network.topBySize.slice(0, 5).forEach(function(r, i) {
      console.log('    [' + (i+1) + '] ' + r.sizeKB + 'KB (' + r.type + ') - ' + r.url);
    });
  }

  // Top slowest
  if (report.network.topByDuration && report.network.topByDuration.length > 0) {
    console.log('\n  Top 5 Slowest Requests:');
    report.network.topByDuration.slice(0, 5).forEach(function(r, i) {
      console.log('    [' + (i+1) + '] ' + r.duration + 'ms (' + r.type + ') - ' + r.url);
    });
  }

  console.log('\n' + '-'.repeat(70));
  console.log(' MAIN THREAD');
  console.log('-'.repeat(70));
  console.log('  Long Tasks: ' + report.mainThread.longTasksCount);
  console.log('  Total Blocking Time: ' + report.mainThread.totalBlockingTime + 'ms');
  if (report.mainThread.topTasks.length > 0) {
    console.log('  Top Tasks:');
    report.mainThread.topTasks.forEach(function(t) {
      console.log('    - ' + t.duration + 'ms (' + (t.name || 'unknown') + ')');
    });
  }

  console.log('\n' + '-'.repeat(70));
  console.log(' MEMORY');
  console.log('-'.repeat(70));
  if (report.memory.supported) {
    console.log('  Used: ' + report.memory.usedMB + ' MB');
    console.log('  Total: ' + report.memory.totalMB + ' MB');
    console.log('  Limit: ' + report.memory.limitMB + ' MB');
  } else {
    console.log('  Not supported (Chrome only)');
  }

  console.log('\n' + '-'.repeat(70));
  console.log(' DOM');
  console.log('-'.repeat(70));
  console.log('  Elements: ' + report.dom.totalElements);
  console.log('  Depth: ' + report.dom.depth);

  console.log('\n' + '-'.repeat(70));
  console.log(' SCORE');
  console.log('-'.repeat(70));
  console.log('  Overall: ' + report.summary.score + ' (' + report.summary.grade + ')');

  if (report.summary.issues.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log(' ISSUES');
    console.log('-'.repeat(70));
    report.summary.issues.forEach(function(issue) { console.log('  ! ' + issue); });
  }

  console.log('\n' + '='.repeat(70));
}

// ============================================
// Main
// ============================================

async function main() {
  const args = parseArgs();

  console.error('[CDP Performance Analyzer]');
  console.error('  CDP Endpoint: ' + args.cdp);
  console.error('  Target URL: ' + (args.url || '(reuse existing page)'));
  console.error('');

  const client = new CDPClient();
  client.shouldReuse = args.reuse;

  try {
    // Connect
    await client.connect(args.cdp);
    console.error('[OK] Connected to browser');

    // Navigate if URL provided
    if (args.url) {
      console.error('[->] Navigating to ' + args.url + '...');

      // Wait for load event (more complete than domContentLoaded)
      const loadPromise = new Promise(function(resolve) {
        var resolved = false;
        var handler = function(data) {
          try {
            var msg = JSON.parse(data.toString());
            // Wait for load event, not just domContentLoaded
            if (msg.method === 'Page.loadEventFired' && !resolved) {
              resolved = true;
              client.ws.off('message', handler);
              resolve();
            }
          } catch (e) {}
        };
        client.ws.on('message', handler);
        // Fallback timeout extended for slow pages
        setTimeout(function() { if (!resolved) { resolved = true; resolve(); } }, 30000);
      });

      await client.send('Page.navigate', { url: args.url });
      await loadPromise;

      // Additional wait for LCP to stabilize
      // LCP can change until user interaction or page hidden
      // For lazy-loaded images, we need to wait longer and trigger scroll
      console.error('[->] Waiting for LCP candidates to stabilize...');

      // Simulate scroll to trigger lazy-loaded images (common LCP candidates)
      await client.send('Runtime.evaluate', {
        expression: 'window.scrollTo(0, document.body.scrollHeight / 2);'
      });
      await new Promise(function(r) { setTimeout(r, 1500); });

      // Scroll back to top
      await client.send('Runtime.evaluate', {
        expression: 'window.scrollTo(0, 0);'
      });
      await new Promise(function(r) { setTimeout(r, 2000); });

      console.error('[OK] Page loaded');
    }

    // Run performance analysis
    console.error('[->] Analyzing performance...');
    const result = await client.send('Runtime.evaluate', {
      expression: PERFORMANCE_SCRIPT,
      returnByValue: true
    });

    const report = result.result.value;

    // Output
    if (args.output === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

  } catch (error) {
    console.error('[ERROR] ' + error.message);
    process.exit(1);
  } finally {
    if (!args.reuse) {
      await client.close();
    }
  }
}

main();
