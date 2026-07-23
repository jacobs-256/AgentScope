# 开发指南

> Language: [English](../../DEVELOPMENT.md) | zh-CN

## 环境要求

- Node.js
- npm
- Python 3，仅用于可选的 Codex 导出辅助脚本

## 安装

```bash
npm install
```

## 本地运行

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## 测试

```bash
npm test
```

测试套件会验证导入器 fixtures、必需 trace shape、导入器特定 metadata、tool-result 配对、token 提取和 schema versioning。

## 预览生产构建

```bash
npm run preview
```

## CLI

运行本地 AgentScope CLI：

```bash
npm run agentscope -- --help
npm run agentscope -- record -- npm run build
npm run agentscope -- list
```

## 主要文件

```text
src/main.jsx                  React 应用、导入器、trace viewer
src/styles.css                应用样式
scripts/agentscope.js         本地实时捕获 CLI
scripts/codex-rollout-to-trace.py
docs/TRACE_FORMAT.md
docs/SCHEMA_VERSIONING.md
docs/IMPORTERS.md
docs/LIVE_CAPTURE.md
```

## UI 布局

AgentScope 使用固定高度的桌面式布局：

- 左列：trace filters
- 中列：run overview、metrics、选中事件内容
- 右列：review controls 和按日期分组的事件时间线

页面本身不做全局滚动。只有相关面板会滚动。

## 隐私与分享开发

Sanitized JSON 导出和静态 HTML 报告生成逻辑位于 `src/main.jsx`。

修改隐私行为时：

- 保持所有脱敏逻辑在浏览器本地执行。
- 不要把 trace 内容发送到外部服务。
- 修改脱敏规则时更新 `docs/PRIVACY.md`。
- 静态 HTML 报告应自包含且无依赖。
- 将内容插入生成的 HTML 前必须转义。

## 导入器开发

添加导入器支持时：

- 保持解析容错。
- 扫描文件夹时静默跳过无关文件。
- 保留时间戳。
- 注意私有数据处理。
- 在 `docs/IMPORTERS.md` 中补充文档。
- 导入器行为变化时，在 `data/fixtures/` 中添加或更新合成 fixtures。

## CI

GitHub Actions 会在 push 和面向 `main` 的 Pull Request 上运行 `npm ci`、`npm test` 和 `npm run build`。

## 实时捕获开发

实时捕获 CLI 位于 `scripts/agentscope.js`。

修改实时捕获时：

- 保持捕获本地优先、基于文件。
- 默认将生成的 trace 写入 `.agentscope/traces/`。
- `record` 必须保留被包装命令的退出码。
- MCP proxy mode 必须透明：转发 stdio 时不修改协议字节。
- 当请求/响应 id 可用时，跟踪工具状态和耗时。
- trace metadata 变化时更新 `docs/LIVE_CAPTURE.md` 和 `docs/TRACE_FORMAT.md`。

## 发布检查清单

- 运行 `npm run build`。
- 检查生成的 trace 是否包含私有数据。
- 更新 `CHANGELOG.md`。
- 如果用户可见行为发生变化，更新 `README.md`。
