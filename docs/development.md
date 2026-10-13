# 开发指南

[返回项目介绍](../README.zh-CN.md) · [架构说明](architecture.md) · [部署指南](deployment.md)

## 环境与安装

项目要求 Node.js 22 或更新版本。包管理器版本为 pnpm 11.7.0，见 [package.json](../package.json)。先准备这些工具，再在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
```

依赖版本由 `pnpm-lock.yaml` 固定。浏览器测试还需要 Playwright 对应的 Chromium：

```bash
pnpm exec playwright install chromium
```

本地开发和测试不需要 Cloudflare 登录。线上部署需要具有目标 Worker 权限的账户，具体流程见部署指南。

## 启动服务

| 用途 | 命令 | 地址 |
| --- | --- | --- |
| 前端热更新与本地游戏 | `pnpm dev -- --port 5173` | `http://127.0.0.1:5173/` |
| 前后端组合服务与联机游戏 | `pnpm dev:worker` | `http://127.0.0.1:8787/` |
| 前端生产构建预览 | `pnpm build`，然后 `pnpm preview -- --port 4173` | `http://127.0.0.1:4173/` |

前端开发服务器与前端预览服务器不提供房间 API。需要测试联机房间时，使用组合服务。

`pnpm dev:worker` 先构建前端，再启动本地 Worker。修改前端后需要重新构建。Wrangler 的本地状态位于 `.wrangler/`，不写入线上数据库。

## 构建与检查

| 命令 | 检查范围 |
| --- | --- |
| `pnpm test` | 领域规则、应用状态、客户端协议、视图和组件测试 |
| `pnpm test:watch` | 监听模式的领域与客户端测试 |
| `pnpm build` | 前端类型检查与 Vite 构建，产物写入 `dist/` |
| `pnpm build:worker` | 前端构建与 Worker 类型检查 |
| `pnpm test:worker` | 先构建前端，再运行 Worker 运行时测试 |
| `pnpm test:e2e` | 先构建前端，再运行本地和联机浏览器测试 |
| `pnpm test:e2e:online` | 只运行联机浏览器项目 |
| `pnpm smoke:worker` | 本地组合服务的 HTTP、WebSocket 和静态资源冒烟检查 |
| `pnpm smoke:ui` | 已有前端构建产物的契约冒烟检查 |

`pnpm smoke:ui` 不构建前端，运行前应先执行 `pnpm build` 或 `pnpm build:worker`。常规完整检查顺序为：

```bash
pnpm test
pnpm build:worker
pnpm test:worker
pnpm test:e2e
pnpm smoke:worker
pnpm smoke:ui
```

部分脚本会重复构建前端，这是当前脚本的行为。检查结果以本次命令输出为准，文档不维护固定的通过数量。

## 浏览器测试

[playwright.config.ts](../playwright.config.ts) 会自动启动两个服务：

- `local-preview` 使用 `127.0.0.1:4173`，检查本地游戏和界面。
- `online-worker` 使用 `127.0.0.1:8799`，检查真实房间、WebSocket、隐私、版本一致性和重连。

运行前应停止占用这些端口的服务。测试使用独立的 [wrangler.e2e.jsonc](../wrangler.e2e.jsonc) 配置和 `.wrangler/state/playwright` 本地状态。测试配置提供确定性的场景入口，不用于生产部署。

UI 冒烟检查也默认使用 `4173`，应与浏览器测试顺序执行。单独运行时，可通过进程环境变量 `UI_SMOKE_PORT` 选择其他空闲端口。

浏览器用例覆盖桌面、平板和手机布局，以及中英文界面。联机用例使用独立浏览器上下文，避免多个玩家共用席位存储。失败截图、跟踪文件和报告位于 `test-results/` 与 `playwright-report/`。

## 目录结构

| 目录或文件 | 内容 |
| --- | --- |
| `src/domain/` | 与运行环境无关的领域规则和对局命令 |
| `src/app/` | 本地游戏状态、reducer 和操作可用性 |
| `src/online/` | 联机协议、连接、凭据、投影和界面适配 |
| `src/ui/` | 共享游戏界面、资源图标、规则说明和本地化 |
| `src/styles/` | 响应式样式 |
| `worker/` | HTTP 路由、房间对象、存储和服务器命令处理 |
| `test/domain/`、`test/online/` | 领域与客户端测试 |
| `test/worker/`、`test/e2e/` | Worker 运行时与浏览器测试 |
| `scripts/` | 构建产物和组合服务冒烟检查 |
| `docs/` | 当前版本的使用、架构、开发和部署指南 |
| `.github/` | 持续集成与协作模板 |

## 修改原则

游戏规则与状态转换集中在领域模块。界面通过类型化命令操作状态。修改规则时，应检查本地模式和联机模式共同使用的命令边界。

修改联机数据时，应同时检查协议类型、调用者视图、Worker 验证、持久化迁移和连接恢复。修改地图生成结果时，应遵守架构说明中的种子版本约定。

规则事实以实现和测试为依据。游戏内完整规则由 [RulebookContent.tsx](../src/ui/rulebook/RulebookContent.tsx) 和 [messages.ts](../src/ui/rulebook/messages.ts) 展示。更新文档时，应保留有效限制，并检查相对链接和中英文 README 的对应关系。

[持续集成配置](../.github/workflows/ci.yml) 在推送 `main` 和创建拉取请求时运行。它安装固定依赖，检查单元测试、前端与 Worker 构建、Worker 测试、浏览器测试和 UI 冒烟检查。
