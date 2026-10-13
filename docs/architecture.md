# 架构说明

[返回项目介绍](../README.zh-CN.md) · [开发指南](development.md) · [部署指南](deployment.md)

## 系统组成

项目使用同一套游戏规则支持本地和联机模式。React 负责界面和输入。联机模式由 Cloudflare Worker 接收请求，每个房间对应一个 Durable Object。它是一个持有房间状态与存储的服务对象，负责该房间的连接和命令处理。

例如，玩家点击“建造道路”后，浏览器发送位置和当前房间版本。房间对象确认调用者身份、回合、资源和位置是否合法。验证通过后，共享规则计算新状态，房间对象把状态写入数据库，再向每名玩家发送经过隐私处理的快照。各浏览器据此更新棋盘。验证失败时，服务器返回拒绝原因，已保存的游戏状态不变。

| 模块 | 职责 | 主要入口 |
| --- | --- | --- |
| 领域规则 | 棋盘、资源、建造、回合、交易、发展卡、计分和商业公会 | [src/domain](../src/domain/) |
| 对局命令 | 创建对局并执行类型化状态转换 | [createMatch.ts](../src/domain/match/createMatch.ts)、[applyMatchCommand.ts](../src/domain/match/applyMatchCommand.ts) |
| 本地应用 | 将界面意图转换为本地命令，生成桌面视图 | [gameReducer.ts](../src/app/gameReducer.ts)、[localGameState.ts](../src/app/localGameState.ts) |
| 联机客户端 | 席位凭据、连接、快照、操作权限和错误提示 | [src/online](../src/online/) |
| 共享界面 | 棋盘、操作面板、统计、规则说明和语言切换 | [GameTable.tsx](../src/ui/GameTable.tsx)、[src/ui/rulebook](../src/ui/rulebook/) |
| Worker 路由 | 静态文件、房间 HTTP 接口和同源检查 | [worker/index.ts](../worker/index.ts)、[worker/http.ts](../worker/http.ts) |
| 房间运行时 | WebSocket、房间生命周期和命令处理 | [RoomDurableObject.ts](../worker/room/RoomDurableObject.ts)、[commandPipeline.ts](../worker/room/commandPipeline.ts) |
| 存储 | 校验、迁移、事务和过期处理 | [roomStore.ts](../worker/room/roomStore.ts)、[roomMigration.ts](../worker/room/roomMigration.ts) |

领域模块不依赖 React 或 Cloudflare 运行时。随机结果、时间和日志标识通过执行上下文注入，因此相同输入可以用于规则测试。本地与联机适配器生成共享的 `GameTableView`，避免两套游戏界面分别实现规则。

## 状态与命令

### 本地模式

界面意图进入本地 reducer。reducer 调用共享对局命令，取得新状态，再生成界面视图。规则拒绝会转为可恢复提示。状态保存在浏览器内存中，不写入服务器数据库。

### 联机模式

客户端发送行动意图，不提交完整对局状态。服务器从连接绑定的席位确定行动者。客户端不能指定自己的身份、骰子结果或盲盒结果。

房间通过串行命令队列和存储事务处理并发。队列让消息依次进入处理，事务让相关存储更改一起提交。一次新命令的处理包括身份验证、格式与限流检查、版本检查、领域规则执行、视图校验、持久化和广播。服务器只在接受命令后递增 `roomVersion`，即房间状态版本。

命令携带唯一的 `commandId` 和客户端已知的 `expectedVersion`。最近接受的命令标识用于去重。重复提交已经接受的命令不会再次扣费或发奖。版本不匹配时，服务器拒绝命令，并返回调用者的最新快照。

拒绝命令不会提交游戏状态或递增房间版本。通过身份与格式校验的新命令尝试仍计入限流，包括版本冲突和规则拒绝。未持久化的尝试在房间实例内存中有界保存，因此这部分计数不保证跨实例重启延续。实现见 [commandAttemptLimiter.ts](../worker/room/commandAttemptLimiter.ts)。

## 数据库与数据模型

[wrangler.jsonc](../wrangler.jsonc) 使用 `new_sqlite_classes` 创建 SQLite 支持的 `RoomDurableObject`，并通过 `ROOMS` 绑定访问房间。应用通过 Durable Object 存储 API 的 `get`、`put` 和事务保存对象，没有独立数据库服务器，也没有自行设计关系表或 SQL 查询。

Cloudflare 的存储说明确认：这种对象的键值 API 把数据写入内部 SQLite 表 `__cf_kv`。因此，本项目采用数据库持久化，业务代码使用键值接口访问数据库。[Cloudflare SQLite 存储说明](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

每个房间对象以 `room` 键保存一份房间记录。`expired` 键记录过期标记。业务模型见 [roomTypes.ts](../worker/room/roomTypes.ts) 和 [match/types.ts](../src/domain/match/types.ts)。

| 数据 | 内容 |
| --- | --- |
| 房间 | 版本、生命周期、房主、创建与活动时间、到期时间 |
| 席位 | 昵称、玩家映射、凭据哈希、准备状态、加入顺序、近期命令记录 |
| 对局 | 地图种子、棋盘引用、玩家资源与卡牌、银行、建筑、道路、回合和计分所需状态 |
| 商业公会 | 交易位、代币相关状态、集会阶段、全桌冷却和兑换记录 |
| 密封拍卖 | 当前轮次和按席位保存的待结算出价 |
| 连接票据 | 票据哈希、所属席位和到期时间 |

生命周期依次为 `lobby`、`playing` 和 `finished`。过期后不再保留可恢复的对局记录。大厅退出可以转移房主，游戏开始后不支持退出并释放席位。

有效活动会更新到期时间。无活动房间在 24 小时后过期。活动 WebSocket 连接会延后过期，存储闹钟负责后续检查。游戏日志在命令转换和存储边界保留最近 200 条，防止随回合无限增长。实现见 [gameLog.ts](../src/domain/gameLog.ts)。

当前存储架构版本为 `3`。有效的旧版 v1、v2 房间通过迁移与完整校验后升级。v2 大厅不创建虚构对局，v2 对局保留进行中的集会状态并补充确定性的冷却基线。不兼容记录不会被部分覆盖。回滚约束见[部署指南](deployment.md)。

## 身份与隐私

创建或加入房间后，浏览器获得席位凭据。服务端只保存凭据哈希。客户端以 `Authorization: Bearer <seatToken>` 申请有效期为 30 秒的一次性连接票据，再用票据建立 WebSocket。票据在连接时被原子消费。实际凭据不进入 WebSocket URL。

浏览器通过站点 `localStorage` 保存席位凭据。存储不可用时退回页面内存。凭据的读取、更新和失效清理见 [sessionStorage.ts](../src/online/sessionStorage.ts) 与 [useOnlineRoom.ts](../src/online/useOnlineRoom.ts)。这套机制没有用户账户或跨设备恢复能力。

服务器为每名玩家生成独立快照，见 [projectRoomView.ts](../src/online/projectRoomView.ts)：

- 公共视图包含棋盘、建筑、道路、回合、公开分数、资源总数和出价提交状态。
- 私有视图包含自己的资源种类、发展卡和当前出价。
- 对手的发展卡身份、资源种类和未公开的胜利点贡献不会直接发送给调用者。
- 拍卖结算只公开允许展示的赢家、成交金额和结果。未胜出的出价仍不公开。
- 服务端快照不包含席位凭据、凭据哈希或连接票据。
- `allowedActions` 按调用席位生成。服务器在执行时仍独立验证权限和规则。

HTTP 请求执行来源检查和体积限制。响应提供内容安全策略等安全头。内部异常不会作为调用栈返回给客户端。具体控制见 [worker/http.ts](../worker/http.ts)。

## 房间接口

前端与 API 使用同一来源。HTTP 请求体与 WebSocket 文本消息使用 JSON，最大为 16 KiB。昵称和命令结构执行严格校验。联机协议版本为 `3`，类型与校验的事实来源是 [protocol.ts](../src/online/protocol.ts)。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 返回服务状态和协议版本 |
| POST | `/api/rooms` | 用昵称创建房间并取得房主席位凭据 |
| POST | `/api/rooms/{roomCode}/join` | 用昵称加入大厅并取得席位凭据 |
| DELETE | `/api/rooms/{roomCode}/seats/{seatId}` | 使用席位凭据退出大厅 |
| POST | `/api/rooms/{roomCode}/connection-ticket` | 使用席位凭据申请一次性连接票据 |
| GET | `/api/rooms/{roomCode}/connect?ticket={ticket}` | 升级为 WebSocket 连接 |

健康检查返回：

```json
{ "ok": true, "schemaVersion": 3 }
```

客户端的版本化消息包含 `room.ready`、`room.start`、`room.restart`、`match.command` 和 `auction.submitBid`。心跳消息 `connection.heartbeat` 不改变房间版本。重开模式为 `sameMap` 或 `fresh`。

命令示例：

```json
{
  "type": "match.command",
  "commandId": "8d86fc28-c428-4b77-b17a-dd31186d1d4d",
  "expectedVersion": 27,
  "command": { "type": "START_GATHERING" }
}
```

`commandId` 必须是有效 UUID。实际 `expectedVersion` 来自当前快照。`START_GATHERING` 不接受额外的玩家身份或冷却字段。重开请求也由服务器验证房主身份。

服务端消息包括 `room.snapshot`、`command.rejected`、`presence.changed`、`room.expired` 和 `protocol.incompatible`。快照包含协议版本、房间版本、生命周期、公共视图、私有视图、可用操作和在线状态。在线状态变化本身不递增房间版本。

| 错误 | 客户端处理 |
| --- | --- |
| `VERSION_CONFLICT` | 应用最新快照，检查状态后重新操作 |
| `RULE_VIOLATION`、`COMMAND_NOT_ALLOWED` | 显示提示，按当前规则和权限调整操作 |
| `RATE_LIMITED` | 等待后重新操作 |
| `CONNECTION_TICKET_EXPIRED` | 重新申请连接票据 |
| `SEAT_TOKEN_INVALID`、`ROOM_NOT_FOUND` | 清理失效的本地席位记录，允许返回首页 |
| `ROOM_EXPIRED` | 返回首页，创建或加入其他房间 |
| `PROTOCOL_INCOMPATIBLE` | 刷新客户端，确认前后端版本一致 |

完整错误集合、HTTP 状态和可重试属性由 `protocol.ts` 定义。界面翻译由 [notice.ts](../src/online/notice.ts) 和 [i18n.ts](../src/ui/i18n.ts) 提供。

## 地图兼容性

新地图的规范种子格式是 `M1-[0-9A-F]{16}`。同一个种子必须在浏览器、Node.js 和 Worker 中产生相同布局。地图包含 19 个地块、54 个顶点、72 条边和 9 个港口，并保持标准的地形、数字和港口数量组合。6 与 8 地块不能相邻，港口必须位于海岸且不能共用端点。

M1 固定随机流、几何顺序、洗牌顺序和标识分配。修改同一 M1 种子的生成结果属于兼容性破坏，需要新的种子版本。地图随机流不决定骰子、牌库、掠夺、拍卖结果或房间凭据。

`M0-STANDARD` 仅用于迁移完全匹配的旧固定地图，不用于新对局。旧地图引用必须保留，无法确认兼容的记录会被拒绝。解析与生成见 [mapSeed.ts](../src/domain/mapSeed.ts)、[randomBoard.ts](../src/domain/randomBoard.ts)。测试中的固定布局快照与 1,000 个种子检查保护这项约定。
