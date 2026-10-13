# 部署指南

[返回项目介绍](../README.zh-CN.md) · [开发指南](development.md) · [架构说明](architecture.md)

## 部署结构

生产地址为 [https://catan-imitation.catan-imitation.workers.dev/](https://catan-imitation.catan-imitation.workers.dev/)。Cloudflare Workers Builds 连接 GitHub `main`，使用以下命令构建和部署：

```bash
pnpm build:worker
pnpm exec wrangler deploy
```

生产配置是 [wrangler.jsonc](../wrangler.jsonc)。Worker 名称为 `catan-imitation`，入口为 `worker/index.ts`。`ASSETS` 绑定提供 `dist/` 中的前端文件，`ROOMS` 绑定提供 `RoomDurableObject`。迁移配置创建 SQLite 支持的房间对象。

前端和 Worker 必须作为同一次发布部署。单独部署静态文件不能提供联机房间功能。GitHub Actions 负责验证，Cloudflare Workers Builds 负责生产部署。两个检查独立运行，应同时确认结果。

## 部署权限

本地构建与测试不需要 Cloudflare 账户。预览和生产部署需要目标账户的 Worker 与 Durable Object 部署权限。交互式认证可以使用：

```bash
pnpm exec wrangler login
```

自动部署使用平台配置的凭据。账户标识、API 令牌、席位凭据和连接票据不应写入仓库或公开报告。

## 预览部署

使用独立的预览 Worker：

```bash
pnpm build:worker
pnpm exec wrangler deploy --name catan-imitation-preview
```

应使用部署命令实际返回的地址验证预览。预览 Worker 与生产 Worker 的房间存储相互独立。不要用浏览器中已有的生产席位凭据测试预览，因为凭据按站点来源保存。

本项目采用独立 Worker 承载预览，不使用版本预览 URL 作为房间测试入口。生产部署使用 `wrangler.jsonc`，不能使用浏览器测试专用的 `wrangler.e2e.jsonc`。

## 发布验证

发布前运行[开发指南](development.md)中的完整检查。随后在预览或生产站点确认：

1. 首页、静态资源、本地游戏和中英文设置可以打开。
2. `/api/health` 返回 `ok: true` 与 `schemaVersion: 3`。
3. 三个独立浏览器可以创建、加入、准备并开始同一房间。
4. 完成初始放置和至少一个正常回合后，各浏览器状态一致。
5. 各玩家只收到自己的私密手牌和密封出价。
6. 非法命令被拒绝，界面显示原因，房间版本不变。
7. 断线后恢复连接和刷新页面可以返回原席位。
8. 桌面与手机界面可以操作，页面没有意外横向溢出。

检查应使用专门创建的测试房间，避免操作其他玩家的对局。记录部署提交、检查结果和实际限制。测试通过数量应引用具体运行结果，不应作为固定版本能力声明。

## 存储迁移与回滚

当前房间存储架构和联机协议均为 v3。有效的 v1、v2 房间在加载时迁移到 v3。迁移过程会校验完整记录，兼容规则见 [roomMigration.ts](../worker/room/roomMigration.ts)。

一旦存在已迁移的 v3 房间，不得回滚到只支持 v1 或 v2 存储的程序。恢复时应选择已验证的 v3 兼容部署，或发布修正版本。仅恢复旧前端也会造成协议不一致。

`M0-STANDARD` 是旧固定地图的迁移标识。新对局使用 `M1-` 种子。回滚或修正地图实现时，应继续保持已支持种子对应的布局和几何标识。

部署记录不能替代长期存档。无活动房间在 24 小时后过期，活动连接会延后过期。当前项目不提供房间备份、跨设备席位找回或长期对局恢复界面。
