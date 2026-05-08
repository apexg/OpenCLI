---
name: cdp-performance-analyzer
description: Use when analyzing website performance via CDP protocol. Measures Core Web Vitals (LCP, FCP, TTFB, CLS, INP), identifies network bottlenecks, detects long tasks, and generates both a technical report for developers and a management summary for stakeholders. Triggered when user mentions performance analysis, speed test, Core Web Vitals, load time optimization, or CDP-based web profiling.
allowed-tools: Bash(opencli:*), Read, Write
---

# CDP Performance Analyzer

通过 CDP 协议分析网页性能，测量 Core Web Vitals，识别网络瓶颈，生成技术报告和管理摘要。

---

## 快速开始

### 1. 启动 Chrome CDP 模式

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-debug"
```

### 2. 运行性能分析

```bash
# 分析指定网站
node scripts/performance-analyzer.cjs --url=https://example.com

# 复用已打开的页面
node scripts/performance-analyzer.cjs --reuse

# 指定 CDP 端点
node scripts/performance-analyzer.cjs --cdp=http://localhost:9222 --url=https://example.com
```

---

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--cdp=<url>` | CDP 端点地址 | `http://localhost:9222` 或 `CDP_ENDPOINT` 环境变量 |
| `--url=<url>` | 要分析的目标 URL | 无 (需指定或使用 --reuse) |
| `--reuse` | 复用浏览器中已打开的页面 | false |
| `--report` | 输出人类可读的报告格式 | 默认输出 JSON |
| `--timeout=<ms>` | 超时时间 | 30000 |

### 环境变量

```bash
export CDP_ENDPOINT=http://localhost:9222
node scripts/performance-analyzer.cjs https://example.com
```

---

## 输出示例

### JSON 格式（默认）

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "url": "https://example.com",
  "coreWebVitals": {
    "ttfb": 320,
    "fcp": 964,
    "lcp": 2500,
    "cls": 0.05,
    "inp": 100,
    "domContentLoaded": 3100,
    "loadComplete": 5000
  },
  "network": {
    "totalRequests": 161,
    "totalSizeMB": 1.06,
    "byType": {
      "js": { "count": 63, "totalSize": 178987 },
      "css": { "count": 16, "totalSize": 1888 },
      "api": { "count": 26, "totalSize": 931878 }
    },
    "topBySize": [
      { "url": "https://example.com/api/data", "size": 272226, "duration": 1178 }
    ]
  },
  "mainThread": {
    "longTasksCount": 5,
    "totalBlockingTime": 350,
    "topTasks": [
      { "duration": 500, "name": "script" }
    ]
  },
  "memory": {
    "supported": true,
    "usedMB": 22.93,
    "totalMB": 28.01,
    "limitMB": 1120
  },
  "dom": {
    "totalElements": 4990,
    "depth": 19
  },
  "scoring": {
    "scores": {
      "ttfb": 100,
      "fcp": 100,
      "lcp": 85
    },
    "overall": 92
  },
  "summary": {
    "score": 92,
    "grade": "A",
    "issues": []
  }
}
```

### 报告格式（--report）

```
============================================================
 PERFORMANCE REPORT
============================================================

URL: https://example.com/
Timestamp: 2024-01-01T00:00:00.000Z

-- Core Web Vitals --
  TTFB: 320ms
  FCP:  964ms
  LCP:  2500ms
  CLS:  0.05
  INP:  100ms

-- Network --
  Requests: 161
  Size: 1.06 MB

-- Main Thread --
  Long Tasks: 5
  Total Blocking Time: 350ms

-- Memory --
  Used: 22.67 MB / 1120 MB

-- DOM --
  Elements: 4992
  Depth: 19

-- Score --
  Overall: 92 (A)

============================================================
```

---

## 性能指标说明

### Core Web Vitals

| 指标 | 全称 | 好的阈值 | 说明 |
|------|------|----------|------|
| TTFB | Time to First Byte | < 800ms | 服务器响应时间 |
| FCP | First Contentful Paint | < 1800ms | 首次内容绘制时间 |
| LCP | Largest Contentful Paint | < 2500ms | 最大内容绘制时间 |
| CLS | Cumulative Layout Shift | < 0.1 | 累积布局偏移 |
| INP | Interaction to Next Paint | < 200ms | 交互响应时间 |

### 评分标准（基于 Lighthouse）

| 分数 | 等级 | 说明 |
|------|------|------|
| 90-100 | A | 优秀 |
| 75-89 | B | 良好 |
| 50-74 | C | 需改进 |
| 0-49 | D | 较差 |

---

## 分析结果解读

### 网络分析 (Network)

- **totalRequests**: 总请求数，超过 100 个需关注
- **totalSizeMB**: 页面总体积，超过 3MB 需优化
- **byType**: 按资源类型分组（js/css/img/api）
- **topBySize**: 体积最大的 10 个资源

### 主线程分析 (MainThread)

- **longTasksCount**: 超过 50ms 的任务数量
- **totalBlockingTime**: 总阻塞时间（TBT），超过 300ms 影响用户体验
- **topTasks**: 最耗时的 5 个任务

### DOM 分析

- **totalElements**: DOM 节点数量，超过 1500 影响性能
- **depth**: DOM 树深度，超过 15 层需优化

### 内存分析

- **usedMB**: 当前 JS 堆内存使用量
- **limitMB**: 浏览器内存限制
- 使用率超过 80% 需关注内存泄漏

---

## 报告生成指南

### 技术报告模板

```markdown
## 性能分析报告

### 核心指标
| 指标 | 值 | 阈值 | 状态 |
|------|-----|------|------|
| TTFB | 320ms | < 800ms | ✅ |
| FCP | 964ms | < 1800ms | ✅ |
| LCP | 2500ms | < 2500ms | ✅ |

### 网络瓶颈
| 资源 | 类型 | 大小 | 耗时 |
|------|------|------|------|
| /api/data | API | 266KB | 1178ms |

### 优化建议
1. [高优先级] 减少首屏 API 请求体积
2. [中优先级] 启用资源压缩

### 预期收益
- LCP 降低 500ms
- 页面体积减少 30%
```

### 管理摘要模板

```markdown
## 性能概要

### 评分
- 性能评分: **92分 (A级)**
- 核心指标全部达标

### 关键发现
1. 页面加载快速，用户体验良好
2. 无主线程阻塞问题
3. DOM 结构合理

### 建议
- 持续监控 LCP 指标
- 关注 API 响应时间
```

---

## 依赖要求

### 必需

- Node.js 14+
- Chrome 浏览器（以 CDP 模式启动）
- `ws` npm 包

### 安装依赖

```bash
npm install ws
```

---

## 常见问题

### Q: LCP 为 0 怎么办？

A: LCP 为 0 有几种常见原因：

1. **SPA 或懒加载页面**：某些单页应用（SPA）或使用懒加载的网站，首屏没有大型内容元素。这种情况下以 FCP 为主要参考指标。

2. **Shopify 等电商平台**：某些 Shopify 主题的产品图片虽然 `loading="eager"` 且 `fetchPriority="high"`，但由于图片从缓存加载或使用特殊的渲染方式，浏览器可能不触发 LCP 事件。这是已知的浏览器 API 限制。

3. **缓存加载**：当图片从浏览器缓存加载时（`transferSize: 0`），某些情况下 LCP API 不会捕获到条目。

**解决方案**：使用 `PerformanceObserver` 的 `buffered: true` 选项已集成到脚本中。如果 LCP 仍为 0，建议：
- 使用 FCP + 最大图片加载时间作为替代指标
- 结合 Lighthouse 或 WebPageTest 获取更全面的性能数据

### Q: CLS 为 0 是否正常？

A: CLS 为 0 通常表示页面布局稳定，是良好表现。但如果怀疑采集不完整，可以检查页面是否在加载后有足够的用户交互时间（滚动、点击等触发布局变化）。

### Q: INP 为 0 是否正常？

A: INP 需要用户交互（点击、键盘输入、触摸）才能测量。在自动化测试中没有模拟用户交互，INP 为 0 是正常的。如需测量 INP，请在页面加载后模拟用户交互。

### Q: 如何复用已登录的页面？

A: 使用 `--reuse` 参数，脚本会连接到浏览器中已打开的非空白页面。

### Q: 如何分析需要登录的页面？

A: 先在浏览器中手动登录，然后使用 `--reuse` 参数复用该页面。

### Q: 内存信息显示 unsupported？

A: `performance.memory` 仅在 Chrome 中可用，其他浏览器不支持。

---

## 技术原理

脚本通过 WebSocket 连接 Chrome DevTools Protocol (CDP)，执行以下步骤：

1. 连接到 CDP 端点 (`/json/version`)
2. 创建或复用页面目标
3. 导航到目标 URL（如果指定）
4. 通过 `Runtime.evaluate` 注入 Performance API 脚本
5. 收集并返回性能数据

### 核心代码逻辑

```javascript
// 连接 CDP
const ws = new WebSocket(webSocketDebuggerUrl);

// 启用 Page 域
await send('Page.enable');

// 导航
await send('Page.navigate', { url });

// 执行性能脚本
const result = await send('Runtime.evaluate', {
  expression: performanceScript,
  returnByValue: true
});
```

---

## 文件结构

```
skills/cdp-performance-analyzer/
├── SKILL.md                      # 本文档
└── scripts/
    ├── performance-analyzer.cjs  # 单页面性能分析
    ├── sitemap-fetcher.cjs       # 通过CDP获取sitemap（绕过反爬虫）
    ├── fetch-all-urls.cjs        # 递归获取网站所有URL
    ├── sitemap-parser.cjs        # 网站地图解析（直接HTTP请求）
    └── batch-analyzer.cjs        # 批量分析 + 分组输出
```

---

## 批量分析

### 场景

当需要分析整个网站的性能时，使用批量分析工具：

1. 从 sitemap.xml 或 URL 列表获取所有页面
2. 逐个采集性能数据
3. 按 N 个页面一组汇总（默认 5 个）
4. 生成大模型分析 prompt

### 使用方式

```bash
# 从 sitemap 分析
node scripts/batch-analyzer.cjs --sitemap=https://example.com/sitemap.xml --cdp=http://localhost:9222

# 从 URL 列表文件分析
node scripts/batch-analyzer.cjs --urls=urls.txt --cdp=http://localhost:9222

# 自定义参数
node scripts/batch-analyzer.cjs \
  --urls=urls.txt \
  --cdp=http://localhost:9222 \
  --group=5 \
  --limit=20 \
  --delay=2000 \
  --output=./reports
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--sitemap=<url>` | sitemap.xml 地址 | - |
| `--urls=<file>` | URL 列表文件（每行一个） | - |
| `--cdp=<url>` | CDP 端点 | http://localhost:9222 |
| `--group=<n>` | 每组页面数 | 5 |
| `--limit=<n>` | 限制分析的 URL 数量 | 0（不限制） |
| `--delay=<ms>` | 页面之间的延迟 | 1000 |
| `--output=<dir>` | 输出目录 | ./performance-reports |

### 输出文件

```
performance-reports/
├── summary.json           # 总体汇总
├── group-1-data.json      # 第 1 组原始数据
├── group-1-prompt.md      # 第 1 组分析 prompt
├── group-2-data.json      # 第 2 组原始数据
├── group-2-prompt.md      # 第 2 组分析 prompt
└── ...
```

### 生成的 Prompt 示例

每组会生成一个 markdown 文件，包含：

- 汇总数据表格（平均 TTFB、FCP、LCP 等）
- 慢页面列表
- 大页面列表
- 发现的问题
- 详细 JSON 数据
- 分析问题提示

可直接发送给大模型进行深度分析。

### 工作流程

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  sitemap.xml    │────▶│  batch-analyzer  │────▶│  group-N-prompt │
│  或 urls.txt    │     │  批量采集数据     │     │  大模型分析      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ performance-      │
                        │ analyzer.cjs      │
                        │ 单页面采集        │
                        └──────────────────┘
```

### URL 列表文件格式

```
https://example.com/
https://example.com/page1
https://example.com/page2
# 注释行会被忽略
https://example.com/page3
```

---

## 获取网站所有 URL

### 方法一：通过 CDP 获取（推荐，绕过反爬虫）

当网站的 sitemap.xml 有反爬虫保护时，使用 CDP 方式获取：

```bash
# 启动 Chrome CDP 模式
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-debug"

# 递归获取所有 URL
node scripts/fetch-all-urls.cjs --cdp=http://localhost:9222 https://example.com/sitemap.xml

# 保存到文件
node scripts/fetch-all-urls.cjs --cdp=http://localhost:9222 https://example.com/sitemap.xml --output=urls.txt

# 自定义请求间隔
node scripts/fetch-all-urls.cjs --cdp=http://localhost:9222 https://example.com/sitemap.xml --delay=500
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--cdp=<url>` | CDP 端点 | http://localhost:9222 |
| `--output=<file>` | 输出文件路径 | 直接输出到 stdout |
| `--delay=<ms>` | 子 sitemap 之间的延迟 | 1000 |

### 工作流程

```
sitemap.xml (sitemapindex)
    │
    ├─▶ sitemap_products_1.xml ─▶ [URL列表]
    ├─▶ sitemap_pages_1.xml ────▶ [URL列表]
    ├─▶ sitemap_collections_1.xml ▶ [URL列表]
    └─▶ ...

最终合并去重输出所有 URL
```

### 方法二：直接 HTTP 请求（无反爬虫保护时）

```bash
# 解析 sitemap 并输出 URL
node scripts/sitemap-parser.cjs https://example.com/sitemap.xml --urls

# 限制数量
node scripts/sitemap-parser.cjs https://example.com/sitemap.xml --limit=100

# 自动发现 sitemap
node scripts/sitemap-parser.cjs https://example.com --auto
```

### 实际示例

```bash
# 获取 jaliza.com 所有 URL
node scripts/fetch-all-urls.cjs \
  --cdp=http://localhost:9222 \
  https://www.jaliza.com/sitemap.xml \
  --output=/tmp/jaliza-urls.txt

# 输出示例：
# [*] Connected to browser
# [*] Fetching: https://www.jaliza.com/sitemap.xml
# [+] Found 6 child sitemaps
# [*] Fetching: https://www.jaliza.com/sitemap_products_1.xml...
# [+] Found 237 URLs
# ...
# [*] Total URLs: 910
# [+] Saved to /tmp/jaliza-urls.txt
```
