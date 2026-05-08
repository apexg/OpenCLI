#!/usr/bin/env node
/**
 * Batch Performance Analyzer - 批量分析网站所有页面性能
 *
 * 功能：
 * 1. 从 sitemap 获取所有页面 URL
 * 2. 逐个采集性能数据
 * 3. 按 5 个页面一组汇总
 * 4. 输出供大模型分析的报告
 *
 * Usage:
 *   node batch-analyzer.cjs --sitemap=https://example.com/sitemap.xml --cdp=http://localhost:9222
 *   node batch-analyzer.cjs --base=https://example.com --cdp=http://localhost:9222
 *   node batch-analyzer.cjs --urls=urls.txt --cdp=http://localhost:9222
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    sitemap: null,
    base: null,
    urls: null,
    cdp: process.env.CDP_ENDPOINT || 'http://localhost:9222',
    groupSize: 5,
    output: 'report',
    outputDir: './performance-reports',
    limit: 0,
    delay: 1000  // 页面之间的延迟(ms)
  };

  for (const arg of args) {
    if (arg.startsWith('--sitemap=')) result.sitemap = arg.slice(10);
    else if (arg.startsWith('--base=')) result.base = arg.slice(7);
    else if (arg.startsWith('--urls=')) result.urls = arg.slice(7);
    else if (arg.startsWith('--cdp=')) result.cdp = arg.slice(6);
    else if (arg.startsWith('--group=')) result.groupSize = parseInt(arg.slice(8));
    else if (arg.startsWith('--output=')) result.outputDir = arg.slice(9);
    else if (arg.startsWith('--limit=')) result.limit = parseInt(arg.slice(8));
    else if (arg.startsWith('--delay=')) result.delay = parseInt(arg.slice(8));
  }

  return result;
}

// 动态导入 sitemap-parser 和 performance-analyzer
async function getUrlsFromSitemap(sitemapUrl) {
  const { execSync } = require('child_process');
  const scriptDir = __dirname;
  const output = execSync(`node "${scriptDir}/sitemap-parser.cjs" --urls "${sitemapUrl}"`, { encoding: 'utf8' });
  return output.trim().split('\n').filter(Boolean);
}

function getUrlsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.trim().split('\n').filter(Boolean);
}

async function analyzePage(cdpEndpoint, url) {
  const { execSync } = require('child_process');
  const scriptDir = __dirname;
  const output = execSync(
    `node "${scriptDir}/performance-analyzer.cjs" --cdp="${cdpEndpoint}" --url="${url}"`,
    { encoding: 'utf8', timeout: 60000 }
  );
  return JSON.parse(output);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createGroupReport(pages, groupIndex) {
  // 计算汇总指标
  const summary = {
    totalPages: pages.length,
    avgTTFB: 0,
    avgFCP: 0,
    avgLCP: 0,
    avgCLS: 0,
    avgRequests: 0,
    avgSizeMB: 0,
    avgScore: 0,
    slowPages: [],
    largePages: [],
    issues: []
  };

  let validPages = pages.filter(p => p.coreWebVitals);
  if (validPages.length === 0) return { pages, summary };

  // 计算平均值
  summary.avgTTFB = Math.round(validPages.reduce((s, p) => s + p.coreWebVitals.ttfb, 0) / validPages.length);
  summary.avgFCP = Math.round(validPages.reduce((s, p) => s + p.coreWebVitals.fcp, 0) / validPages.length);
  summary.avgLCP = Math.round(validPages.reduce((s, p) => s + (p.coreWebVitals.lcp || 0), 0) / validPages.length);
  summary.avgCLS = Math.round(validPages.reduce((s, p) => s + p.coreWebVitals.cls, 0) / validPages.length * 1000) / 1000;
  summary.avgRequests = Math.round(validPages.reduce((s, p) => s + p.network.totalRequests, 0) / validPages.length);
  summary.avgSizeMB = Math.round(validPages.reduce((s, p) => s + p.network.totalSizeMB, 0) / validPages.length * 100) / 100;
  summary.avgScore = Math.round(validPages.reduce((s, p) => s + (p.summary.score || 0), 0) / validPages.length);

  // 找出慢页面
  validPages.forEach(p => {
    if (p.coreWebVitals.lcp > 4000 || p.coreWebVitals.fcp > 3000) {
      summary.slowPages.push({
        url: p.url,
        lcp: p.coreWebVitals.lcp,
        fcp: p.coreWebVitals.fcp,
        score: p.summary.score
      });
    }
    if (p.network.totalSizeMB > 3) {
      summary.largePages.push({
        url: p.url,
        sizeMB: p.network.totalSizeMB,
        requests: p.network.totalRequests
      });
    }
    if (p.summary.issues.length > 0) {
      p.summary.issues.forEach(issue => {
        if (!summary.issues.includes(issue)) summary.issues.push(issue);
      });
    }
  });

  return { pages, summary };
}

function generateAnalysisPrompt(groupReport, groupIndex) {
  const { pages, summary } = groupReport;

  return `# 性能分析报告 (第 ${groupIndex + 1} 组)

## 汇总数据

| 指标 | 平均值 | 说明 |
|------|--------|------|
| TTFB | ${summary.avgTTFB}ms | 服务器响应时间 |
| FCP | ${summary.avgFCP}ms | 首次内容绘制 |
| LCP | ${summary.avgLCP}ms | 最大内容绘制 |
| CLS | ${summary.avgCLS} | 布局偏移 |
| 请求 | ${summary.avgRequests}个 | 网络请求数 |
| 体积 | ${summary.avgSizeMB}MB | 页面体积 |
| 评分 | ${summary.avgScore}分 | 综合评分 |

## 慢页面 (${summary.slowPages.length}个)

${summary.slowPages.map(p => `- ${p.url}: LCP=${p.lcp}ms, FCP=${p.fcp}ms, 评分=${p.score}`).join('\n') || '无'}

## 大页面 (${summary.largePages.length}个)

${summary.largePages.map(p => `- ${p.url}: ${p.sizeMB}MB, ${p.requests}个请求`).join('\n') || '无'}

## 发现的问题

${summary.issues.map(i => '- ' + i).join('\n') || '无'}

## 详细数据

\`\`\`json
${JSON.stringify(pages.map(p => ({
  url: p.url,
  vitals: p.coreWebVitals,
  network: { requests: p.network.totalRequests, sizeMB: p.network.totalSizeMB },
  score: p.summary.score,
  grade: p.summary.grade,
  issues: p.summary.issues,
  topResources: p.network.topBySize?.slice(0, 3),
  slowResources: p.network.topByDuration?.slice(0, 3)
})), null, 2)}
\`\`\`

---

请分析以上数据，回答：
1. 哪些页面性能较差？原因是什么？
2. 主要性能瓶颈在哪里？（网络、渲染、主线程）
3. 有什么优化建议？按优先级排序。
`;
}

async function main() {
  const args = parseArgs();

  console.error('='.repeat(60));
  console.error(' Batch Performance Analyzer');
  console.error('='.repeat(60));

  // 获取 URL 列表
  let urls = [];

  if (args.sitemap) {
    console.error('[*] Fetching URLs from sitemap: ' + args.sitemap);
    urls = await getUrlsFromSitemap(args.sitemap);
  } else if (args.urls) {
    console.error('[*] Reading URLs from file: ' + args.urls);
    urls = getUrlsFromFile(args.urls);
  } else if (args.base) {
    console.error('[*] Discovering sitemap from: ' + args.base);
    const sitemapParser = require('./sitemap-parser.cjs');
    // 简化处理，直接调用命令
    const { execSync } = require('child_process');
    const output = execSync(`node "${__dirname}/sitemap-parser.cjs" --auto --urls "${args.base}"`, { encoding: 'utf8' });
    urls = output.trim().split('\n').filter(Boolean);
  }

  if (urls.length === 0) {
    console.error('[ERROR] No URLs found');
    process.exit(1);
  }

  // 限制数量
  if (args.limit > 0) {
    urls = urls.slice(0, args.limit);
  }

  console.error('[+] Found ' + urls.length + ' URLs to analyze');
  console.error('[*] Group size: ' + args.groupSize);
  console.error('[*] Output directory: ' + args.outputDir);
  console.error('');

  // 创建输出目录
  if (!fs.existsSync(args.outputDir)) {
    fs.mkdirSync(args.outputDir, { recursive: true });
  }

  // 批量分析
  const allResults = [];
  const errors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.error(`[${i + 1}/${urls.length}] Analyzing: ${url}`);

    try {
      const result = await analyzePage(args.cdp, url);
      allResults.push(result);
      console.error(`  -> Score: ${result.summary.score} (${result.summary.grade}), Requests: ${result.network.totalRequests}, Size: ${result.network.totalSizeMB}MB`);
    } catch (error) {
      console.error(`  -> ERROR: ${error.message}`);
      errors.push({ url, error: error.message });
    }

    // 延迟
    if (i < urls.length - 1 && args.delay > 0) {
      await sleep(args.delay);
    }
  }

  console.error('');
  console.error('='.repeat(60));
  console.error(' Analysis Complete');
  console.error('='.repeat(60));
  console.error(`  Success: ${allResults.length}`);
  console.error(`  Errors: ${errors.length}`);
  console.error('');

  // 分组输出
  const groupCount = Math.ceil(allResults.length / args.groupSize);

  for (let i = 0; i < groupCount; i++) {
    const start = i * args.groupSize;
    const end = Math.min(start + args.groupSize, allResults.length);
    const groupPages = allResults.slice(start, end);

    const groupReport = createGroupReport(groupPages, i);
    const prompt = generateAnalysisPrompt(groupReport, i);

    // 保存原始数据
    const dataFile = path.join(args.outputDir, `group-${i + 1}-data.json`);
    fs.writeFileSync(dataFile, JSON.stringify(groupReport, null, 2));

    // 保存分析提示
    const promptFile = path.join(args.outputDir, `group-${i + 1}-prompt.md`);
    fs.writeFileSync(promptFile, prompt);

    console.error(`[Group ${i + 1}] Pages ${start + 1}-${end}`);
    console.error(`  Data: ${dataFile}`);
    console.error(`  Prompt: ${promptFile}`);
    console.error(`  Avg Score: ${groupReport.summary.avgScore}`);
    console.error('');
  }

  // 保存汇总
  const summary = {
    timestamp: new Date().toISOString(),
    totalUrls: urls.length,
    analyzed: allResults.length,
    errors: errors.length,
    avgScore: Math.round(allResults.reduce((s, p) => s + (p.summary.score || 0), 0) / allResults.length),
    avgTTFB: Math.round(allResults.reduce((s, p) => s + p.coreWebVitals.ttfb, 0) / allResults.length),
    avgFCP: Math.round(allResults.reduce((s, p) => s + p.coreWebVitals.fcp, 0) / allResults.length),
    avgLCP: Math.round(allResults.reduce((s, p) => s + (p.coreWebVitals.lcp || 0), 0) / allResults.length),
    avgSizeMB: Math.round(allResults.reduce((s, p) => s + p.network.totalSizeMB, 0) / allResults.length * 100) / 100,
    errorList: errors
  };

  const summaryFile = path.join(args.outputDir, 'summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  console.error('Summary: ' + summaryFile);
}

main().catch(console.error);
