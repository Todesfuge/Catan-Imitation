# 卡坦岛仿制版

[English](README.md)

这是一个使用 TypeScript、React、Vite 和 Cloudflare Workers 开发的卡坦岛风格浏览器游戏，并包含原创的“商业公会”扩展。界面默认使用英文，可在“设置”中切换为简体中文；语言选择会在当前浏览器会话内保留。

## 项目范围

- “本地游戏”支持四名玩家热座游玩；“联机游戏”支持三至四名玩家加入匿名私人房间。
- 使用 19 个六边形地块的固定标准棋盘，包含骰子产出、银行库存、分阶段强盗流程、建造费用、计分和严格的回合推进。
- 支持蛇形顺序的初始村庄与道路放置。
- 支持全部标准发展卡效果，包括骑士、道路建设、丰收年、垄断和胜利点。
- 支持最长道路、最大骑士团和 10 分胜利条件。
- 包含 9 个确定性海岸港口，并根据玩家建筑计算 4:1、3:1 和 2:1 海上贸易比例。
- 支持公开的玩家间多资源组合报价；当前玩家可发布一项报价，任何资源足够的对手都可接受。
- 提供按玩家、按骰点以及完整期望值矩阵三种产出统计视图。
- 商业公会扩展包含三个共享交易位、资源换代币、代币转移、集会兑换、三轮盲盒拍卖和奖品卡兑换。

当前版本不包含用户账户、公开匹配、跨设备席位找回、长期存档、AI 玩家、通用随机棋盘生成或任何专有美术资源。

## 安装与启动

需要 Node.js 和 pnpm。克隆仓库后执行：

```bash
pnpm install
pnpm dev -- --port 5173
```

开发服务器默认访问地址为 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。

生产构建与本地预览：

```bash
pnpm build
pnpm preview -- --port 4173
```

## 游戏玩法

1. 新游戏按蛇形顺序为每位玩家放置两组村庄和相连道路。
2. 当前玩家掷两枚骰子；匹配点数且未被强盗阻挡的地块向相邻村庄或城市产出资源。
3. 掷出 7 时，资源卡超过七张的玩家先选择并提交一半弃牌，随后当前玩家移动强盗并在有合法对象时随机夺取一份资源。
4. 掷骰后的行动阶段可以建造道路、村庄或城市，购买或使用发展卡，进行海上贸易，发布或取消玩家交易，并使用商业公会功能。
5. 公开玩家报价可以同时包含多种“提供”资源和多种“索取”资源；任何非当前玩家只要资源足够即可接受，交换会一次性完成。
6. 结束回合会清除尚未成交的玩家报价，并将行动权交给下一名玩家。
7. 首位达到目标分数（默认 10 分）的玩家获胜。

设置、规则说明和项目信息可通过棋盘左侧的工具按钮打开。强盗、弃牌和发展卡的待处理效果会显示明确的阶段提示。

## 测试

```bash
pnpm test          # Vitest 领域、reducer 与组件测试
pnpm test:worker   # Cloudflare Workers 运行时测试
pnpm test:e2e      # 生产构建 + Playwright 浏览器流程
pnpm build         # TypeScript 与默认 Vite 生产构建
pnpm build:worker  # 构建 SPA 与 Worker
pnpm smoke:worker  # 组合 Worker 的 API、WebSocket 与 SPA 冒烟测试
pnpm smoke:ui      # 构建产物契约冒烟测试
```

浏览器测试覆盖回合恢复、初始放置、建造目标、海上贸易、商业公会交互、强盗提示对比度、日志与统计滚动、玩家交易、语言切换和响应式布局。

## 在线游玩

[打开生产环境](https://catan-imitation.catan-imitation.workers.dev/)。进入页面后可选择“本地游戏”或“联机游戏”；界面默认使用英文，并可在“设置”中切换为简体中文。

联机房间为匿名私人房间。房主创建六位房间码，三至四名玩家通过房间码加入后开始游戏；系统不提供用户账户或公开匹配。每个席位使用浏览器保存的、仅限当前站点来源的 Bearer 凭据，因此可以在同一浏览器来源重新打开房间并连接到服务器保存的最新状态。清除站点数据会丢失席位凭据，匿名首版也不支持跨设备找回席位。房间无活动 24 小时后过期；存在活动连接时会延后过期。

## Cloudflare 部署

Cloudflare Workers Builds 从 GitHub `main` 部署。Worker 在同一来源提供 SPA 与房间 API，每个房间由一个 Durable Object 负责权威状态和 WebSocket 连接。

```bash
pnpm build:worker
pnpm exec wrangler deploy
pnpm exec wrangler deploy --name catan-imitation-preview
```

本项目将预览版本部署到独立的 `catan-imitation-preview` Worker，因为版本预览 URL 不适合该项目的 Durable Object 绑定。需要回滚生产环境时，在 Cloudflare Worker 的部署/版本历史中重新提升上一个已验证版本。GitHub Pages 发布已退役，生产环境只保留一个主机；原 Pages 地址现返回 HTTP 404。

## 项目文档

- [功能规格](specs/001-catan-imitation/spec.md)
- [实施计划](specs/001-catan-imitation/plan.md)
- [任务列表](specs/001-catan-imitation/tasks.md)
- [快速开始](specs/001-catan-imitation/quickstart.md)
- [联机多人游戏快速开始](specs/002-cloudflare-online-multiplayer/quickstart.md)
- [路线图](docs/roadmap.md)
- [项目章程](.specify/memory/constitution.md)

游戏规则位于 `src/domain` 下的纯 TypeScript 模块中。React 组件只展示状态，并通过 `src/app/gameReducer.ts` 分派类型化命令。联机模式下，Cloudflare Worker 和每房间一个的 Durable Object 会验证命令、持久化短期房间状态，并返回按调用席位裁剪的视图。玩家交易规则独立位于 `src/domain/rules/playerTrade.ts`，本地化目录位于 `src/ui/i18n.ts`。
