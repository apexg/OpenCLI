# OpenCLI CDP增强版安装指南

本文档描述如何打包、发布、下载和安装CDP增强版OpenCLI。

---

## 1. 打包

从源码构建并打包：

```bash
# 克隆仓库
git clone https://github.com/apexg/OpenCLI.git
cd OpenCLI

# 安装依赖
npm install

# 构建项目
npm run build

# 打包成tgz文件
npm pack

# 生成的文件: jackwener-opencli-1.7.6.tgz (约1.2MB)
ls -lh *.tgz
```

---

## 2. 推送到GitHub Release

### 方式1：通过gh CLI推送

```bash
# 设置代理（如需要）
export http_proxy="http://172.56.35.167:7890/"
export https_proxy="http://172.56.35.167:7890/"

# 创建release并上传tgz文件
gh release create v1.7.6-cdp \
  --title "v1.7.6 CDP增强版" \
  --notes "支持直接CDP连接，无需浏览器扩展" \
  jackwener-opencli-1.7.6.tgz

# 或上传到已有release
gh release upload v1.7.6-cdp jackwener-opencli-1.7.6.tgz
```

### 方式2：通过GitHub网页上传

1. 访问 https://github.com/apexg/OpenCLI/releases
2. 点击 "Draft a new release"
3. 填写版本号：`v1.7.6-cdp`
4. 填写标题和说明
5. 在 "Attach binaries" 区域拖入 `jackwener-opencli-1.7.6.tgz`
6. 点击 "Publish release"

---

## 3. 下载

从GitHub Release下载：

```bash
# 设置代理（如需要）
export http_proxy="http://172.56.35.167:7890/"
export https_proxy="http://172.56.35.167:7890/"

# 下载tgz文件
curl -L -o opencli-cdp.tgz \
  https://github.com/apexg/OpenCLI/releases/download/v1.7.6-cdp/jackwener-opencli-1.7.6.tgz

# 或使用gh CLI
gh release download v1.7.6-cdp \
  --repo apexg/OpenCLI \
  --pattern "*.tgz"
```

---

## 4. 安装

### 方式1：从tgz文件安装（推荐）

```bash
# 卸载原有版本（如有）
npm uninstall -g @jackwener/opencli

# 从tgz文件安装
npm install -g opencli-cdp.tgz

# 验证安装
opencli --version
# 输出: 1.7.6
```

### 方式2：从GitHub仓库安装

```bash
# 注意：需要仓库包含dist/目录
npm install -g github:apexg/OpenCLI#main
```

### 方式3：从源码本地安装

```bash
git clone https://github.com/apexg/OpenCLI.git
cd OpenCLI
npm install
npm run build
npm link  # 创建全局符号链接

opencli --version
```

---

## 5. 日常使用

### 5.1 启动Chrome（CDP模式）

```bash
# 创建独立配置目录（避免干扰日常Chrome使用）
mkdir -p ~/chrome-debug-profile

# 启动Chrome并开启CDP端口
google-chrome --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile"

# 或使用Chromium
chromium --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile"
```

### 5.2 配置环境变量

**临时配置（单次使用）**
```bash
export OPENCLI_CDP_ENDPOINT=http://localhost:9222
export OPENCLI_CDP_STEALTH=false  # Chrome已有隐身时设为false
```

**永久配置（添加到shell配置文件）**
```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
echo 'export OPENCLI_CDP_ENDPOINT=http://localhost:9222' >> ~/.bashrc
echo 'export OPENCLI_CDP_STEALTH=false' >> ~/.bashrc
source ~/.bashrc
```

### 5.3 登录网站

在启动的Chrome窗口中手动登录目标网站：
- B站：https://bilibili.com
- 小红书：https://xiaohongshu.com
- 微博：https://weibo.com
- 其他需要登录的网站...

登录后，OpenCLI会自动使用Chrome中的Cookie。

### 5.4 运行命令

**检查连接状态**
```bash
opencli doctor
```
输出：
```
[CDP] Mode: direct Chrome DevTools Protocol connection
  Endpoint: http://localhost:9222
[OK] Connectivity: connected in 0.0s

CDP connection healthy. Chrome is accepting commands.
```

**B站热门**
```bash
opencli bilibili hot --limit 10 -f json
```

**小红书搜索**
```bash
opencli xiaohongshu search "美食" --limit 5 -f json
```

**小红书首页推荐**
```bash
opencli xiaohongshu feed --limit 10 -f table
```

**浏览器操作**
```bash
# 打开网页
opencli browser open https://bilibili.com

# 获取页面状态
opencli browser state

# 截图
opencli browser screenshot

# 列出标签页
opencli browser tab list

# 新建标签页
opencli browser tab new https://xiaohongshu.com

# 关闭标签页（支持数字索引）
opencli browser tab close 2

# 执行JS
opencli browser eval "document.title"

# 点击元素
opencli browser click ".search-input"

# 输入文本
opencli browser type ".search-input" "关键词"

# 获取网络请求
opencli browser network

# 等待XHR请求
opencli browser wait xhr "/api/search"
```

### 5.5 常用输出格式

```bash
# JSON格式（适合程序处理）
opencli bilibili hot -f json

# 表格格式（适合查看）
opencli bilibili hot -f table

# YAML格式
opencli bilibili hot -f yaml

# CSV格式
opencli bilibili hot -f csv

# Markdown格式
opencli bilibili hot -f md
```

### 5.6 调试模式

```bash
# 开启详细日志
export OPENCLI_VERBOSE=1
opencli bilibili hot -v

# 保持浏览器窗口打开（调试时有用）
export OPENCLI_LIVE=1
opencli bilibili hot

# 前台窗口模式
export OPENCLI_WINDOW_FOCUSED=1
opencli browser open https://bilibili.com
```

---

## 6. 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLI_CDP_ENDPOINT` | CDP端点地址 | 无（必须设置） |
| `OPENCLI_CDP_STEALTH` | 是否注入隐身脚本 | `true` |
| `OPENCLI_CDP_TARGET` | 目标页面过滤（URL/标题匹配） | 无 |
| `OPENCLI_VERBOSE` | 详细日志 | `false` |
| `OPENCLI_LIVE` | 保持窗口打开 | `false` |
| `OPENCLI_BROWSER_TIMEOUT` | 浏览器超时（秒） | `30` |
| `OPENCLI_BROWSER_CONNECT_TIMEOUT` | 连接超时（秒） | `30` |

---

## 7. 与原版同步更新

当原仓库有新版本时：

```bash
# 添加原仓库为remote
git remote add upstream https://github.com/jackwener/OpenCLI.git

# 拉取原仓库更新
git fetch upstream

# 合并更新
git merge upstream/main

# 重新构建
npm run build
npm pack

# 推送到fork
git push origin main

# 上传新release
gh release create v1.7.7-cdp jackwener-opencli-1.7.7.tgz
```

---

## 8. 常见问题

### Q: Chrome启动失败
```bash
# 检查Chrome路径
which google-chrome || which chromium

# 使用完整路径
/opt/google/chrome/google-chrome --remote-debugging-port=9222
```

### Q: 连接失败
```bash
# 检查端口是否被占用
lsof -i :9222

# 检查CDP是否正常
curl http://localhost:9222/json/version

# 运行doctor诊断
opencli doctor
```

### Q: Cookie未生效
确保在CDP模式启动的Chrome窗口中登录，而不是普通Chrome。

### Q: 被网站检测
```bash
# 开启隐身注入（默认已开启）
export OPENCLI_CDP_STEALTH=true

# 或确保Chrome已安装隐身扩展
```

### Q: 多个Chrome实例冲突
使用独立的 `--user-data-dir` 避免与日常Chrome冲突：
```bash
google-chrome --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile"
```

---

## 9. 快速启动脚本

创建启动脚本方便日常使用：

```bash
# 创建 ~/start-cdp-chrome.sh
cat > ~/start-cdp-chrome.sh << 'EOF'
#!/bin/bash
mkdir -p ~/chrome-debug-profile
google-chrome --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile" &
sleep 2
export OPENCLI_CDP_ENDPOINT=http://localhost:9222
export OPENCLI_CDP_STEALTH=false
echo "Chrome CDP ready at http://localhost:9222"
echo "Run: opencli doctor"
EOF

chmod +x ~/start-cdp-chrome.sh

# 使用
~/start-cdp-chrome.sh
```

---

## 10. 相关链接

- 增强版仓库：https://github.com/apexg/OpenCLI
- 原版仓库：https://github.com/jackwener/OpenCLI
- Chrome CDP文档：https://chromedevtools.github.io/devtools-protocol/