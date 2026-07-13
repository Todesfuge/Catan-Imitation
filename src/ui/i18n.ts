import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { AuctionSummaryData, BlindBoxOutcome } from "../domain/expansion/commerceGuild";
import {
  resources,
  type DevelopmentCardKind,
  type GameLogEntry,
  type ResourceMap
} from "../domain/types";

export type Locale = "en" | "zh-CN";
type MessageParams = Record<string, string | number>;

const messages = {
  "mode.language": { en: "Language", "zh-CN": "语言" },
  "mode.eyebrow": { en: "Choose how to play", "zh-CN": "选择游戏方式" },
  "mode.title": { en: "Catan Imitation", "zh-CN": "卡坦岛仿制版" },
  "mode.intro": { en: "Play together on one screen or invite friends to a private online room.", "zh-CN": "可在同一屏幕游玩，也可邀请朋友加入私人联机房间。" },
  "mode.local": { en: "Local Game", "zh-CN": "本地游戏" },
  "mode.localAria": { en: "Play Local Game", "zh-CN": "开始本地游戏" },
  "mode.localDescription": { en: "One browser, shared table, no connection required.", "zh-CN": "共用一个浏览器，无需网络连接。" },
  "mode.online": { en: "Online Game", "zh-CN": "联机游戏" },
  "mode.onlineAria": { en: "Play Online Game", "zh-CN": "开始联机游戏" },
  "mode.onlineDescription": { en: "Create or join a private room for three or four players.", "zh-CN": "创建或加入三至四人的私人房间。" },
  "online.back": { en: "Back", "zh-CN": "返回" },
  "online.eyebrow": { en: "Private multiplayer", "zh-CN": "私人联机" },
  "online.title": { en: "Online Game", "zh-CN": "联机游戏" },
  "online.intro": { en: "Use a nickname and a private room code. No account is required.", "zh-CN": "使用昵称和私人房间代码即可游玩，无需注册账号。" },
  "online.createTitle": { en: "Create a room", "zh-CN": "创建房间" },
  "online.createDescription": { en: "You become the host and can share the new room code.", "zh-CN": "你将成为房主，并可分享新房间代码。" },
  "online.joinTitle": { en: "Join a room", "zh-CN": "加入房间" },
  "online.joinDescription": { en: "Enter the six-character code shared by the host.", "zh-CN": "输入房主分享的六位房间代码。" },
  "online.nickname": { en: "Nickname", "zh-CN": "昵称" },
  "online.createNicknameAria": { en: "Create nickname", "zh-CN": "创建房间昵称" },
  "online.createRoomAria": { en: "Create room", "zh-CN": "创建房间" },
  "online.joinRoomCodeAria": { en: "Join room code", "zh-CN": "加入房间代码" },
  "online.joinNicknameAria": { en: "Join nickname", "zh-CN": "加入房间昵称" },
  "online.joinRoomAria": { en: "Join room", "zh-CN": "加入房间" },
  "online.roomCode": { en: "Room code", "zh-CN": "房间代码" },
  "online.create": { en: "Create private room", "zh-CN": "创建私人房间" },
  "online.join": { en: "Join private room", "zh-CN": "加入私人房间" },
  "online.working": { en: "Working…", "zh-CN": "处理中…" },
  "online.or": { en: "or", "zh-CN": "或" },
  "online.roomTitle": { en: "Private online room", "zh-CN": "私人联机房间" },
  "online.copy": { en: "Copy code", "zh-CN": "复制代码" },
  "online.copied": { en: "Copied", "zh-CN": "已复制" },
  "online.copyCodeAria": { en: "Copy room code", "zh-CN": "复制房间代码" },
  "online.copySuccess": { en: "Room code copied.", "zh-CN": "房间代码已复制。" },
  "online.copyFailed": { en: "Copy failed. Try again.", "zh-CN": "复制失败，请重试。" },
  "online.players": { en: "Players", "zh-CN": "玩家" },
  "online.playerCount": { en: "{count} of 4 seats filled", "zh-CN": "已加入 {count} / 4 席" },
  "online.you": { en: "You", "zh-CN": "你" },
  "online.host": { en: "Host", "zh-CN": "房主" },
  "online.player": { en: "Player", "zh-CN": "玩家" },
  "online.ready": { en: "Ready", "zh-CN": "已准备" },
  "online.notReady": { en: "Not ready", "zh-CN": "未准备" },
  "online.presenceOnline": { en: "Online", "zh-CN": "在线" },
  "online.presenceOffline": { en: "Offline", "zh-CN": "离线" },
  "online.waitingForPlayers": { en: "At least three players are needed to start.", "zh-CN": "至少需要三名玩家才能开始。" },
  "online.setReady": { en: "I'm ready", "zh-CN": "我已准备" },
  "online.setNotReady": { en: "Cancel ready", "zh-CN": "取消准备" },
  "online.setReadyAria": { en: "Set ready", "zh-CN": "设为已准备" },
  "online.setNotReadyAria": { en: "Set not ready", "zh-CN": "取消准备" },
  "online.start": { en: "Start game", "zh-CN": "开始游戏" },
  "online.startAria": { en: "Start online game", "zh-CN": "开始联机游戏" },
  "online.leave": { en: "Leave room", "zh-CN": "离开房间" },
  "online.reconnect": { en: "Reconnect", "zh-CN": "重新连接" },
  "online.returnHome": { en: "Return to game modes", "zh-CN": "返回游戏方式" },
  "online.gameStarting": { en: "Game is starting", "zh-CN": "游戏即将开始" },
  "online.gameBoundary": { en: "The online table will appear here when its projection adapter is ready.", "zh-CN": "在线桌面将在投影视图适配完成后显示于此。" },
  "online.status.connecting": { en: "Connecting", "zh-CN": "正在连接" },
  "online.status.connected": { en: "Connected", "zh-CN": "已连接" },
  "online.status.reconnecting": { en: "Reconnecting", "zh-CN": "正在重连" },
  "online.status.offline": { en: "Offline", "zh-CN": "离线" },
  "online.status.expired": { en: "Room expired", "zh-CN": "房间已过期" },
  "online.status.incompatible": { en: "Update required", "zh-CN": "需要更新" },
  "online.tableStatus": { en: "Online game status", "zh-CN": "联机游戏状态" },
  "online.roomShort": { en: "Room {code}", "zh-CN": "房间 {code}" },
  "online.privacyNote": { en: "Only you can see your cards and resource types.", "zh-CN": "仅你可查看自己的卡牌与资源类型。" },
  "online.presenceSummary": { en: "Seat presence", "zh-CN": "席位在线状态" },
  "online.playerOffline": { en: "{name} is offline", "zh-CN": "{name} 已离线" },
  "online.everyoneOnline": { en: "Everyone is online", "zh-CN": "所有玩家均在线" },
  "online.waitingFor": { en: "Waiting for {names}", "zh-CN": "正在等待 {names}" },
  "online.activePlayer": { en: "{name} is taking the turn", "zh-CN": "{name} 正在行动" },
  "online.gameWinner": { en: "{name} won the game", "zh-CN": "{name} 赢得了游戏" },
  "online.noOptimisticChanges": { en: "Online actions apply only after the server confirms them.", "zh-CN": "联机操作仅在服务器确认后生效。" },
  "online.protocolViewInvalid": { en: "This game view is incompatible", "zh-CN": "游戏视图不兼容" },
  "online.protocolViewInvalidDetail": { en: "The server projection could not be displayed safely. Return and refresh after updating.", "zh-CN": "服务器投影无法安全显示，请返回并在更新后刷新。" },
  "online.statisticsUnavailable": { en: "Yield statistics are unavailable in privacy-safe online views.", "zh-CN": "隐私安全的联机视图暂不提供产量统计。" },
  "online.resourceCardCount": { en: "Resources: {count}", "zh-CN": "资源卡：{count}" },
  "online.developmentCardCount": { en: "Development: {count}", "zh-CN": "发展卡：{count}" },
  "online.auctionOwnBid": { en: "Your sealed bid: {bid}", "zh-CN": "你的密封出价：{bid}" },
  "online.auctionYourTurn": { en: "Your bid has not been submitted", "zh-CN": "你尚未提交出价" },
  "online.auctionSubmitted": { en: "{name} submitted", "zh-CN": "{name} 已提交" },
  "online.auctionWaiting": { en: "Waiting for {name}", "zh-CN": "等待 {name} 提交" },
  "online.auctionBidLabel": { en: "Your sealed bid", "zh-CN": "你的密封出价" },
  "online.auctionSubmit": { en: "Submit sealed bid", "zh-CN": "提交密封出价" },
  "online.auctionDevelopmentCardGeneric": { en: "one development card", "zh-CN": "一张发展卡" },
  "online.error.nicknameRequired": { en: "Enter a nickname.", "zh-CN": "请输入昵称。" },
  "online.error.nicknameTooLong": { en: "Nickname must be 20 characters or fewer.", "zh-CN": "昵称不能超过 20 个字符。" },
  "online.error.roomCodeInvalid": { en: "Enter a valid six-character room code.", "zh-CN": "请输入有效的六位房间代码。" },
  "online.error.roomNotFound": { en: "Room not found. Check the code and try again.", "zh-CN": "未找到房间，请检查代码后重试。" },
  "online.error.roomFull": { en: "This room already has four players.", "zh-CN": "该房间已有四名玩家。" },
  "online.error.roomStarted": { en: "This game has already started.", "zh-CN": "该游戏已经开始。" },
  "online.error.rateLimited": { en: "Too many requests. Wait a moment and try again.", "zh-CN": "请求过于频繁，请稍后重试。" },
  "online.error.ruleViolation": { en: "That nickname cannot be used in this room.", "zh-CN": "该昵称无法在此房间使用。" },
  "online.error.internal": { en: "Online service is unavailable. Try again.", "zh-CN": "联机服务暂不可用，请重试。" },
  "online.error.actionFailed": { en: "The room action was not sent. Check the connection and try again.", "zh-CN": "房间操作未能发送，请检查连接后重试。" },
  "online.error.leaveFailed": { en: "Could not leave the room. Try again.", "zh-CN": "无法离开房间，请重试。" },
  "online.error.seatInvalid": { en: "This browser no longer has a valid seat for the room.", "zh-CN": "此浏览器已没有该房间的有效席位。" },
  "online.error.connectionExpired": { en: "The connection ticket expired. Reconnecting…", "zh-CN": "连接凭证已过期，正在重连…" },
  "online.error.versionConflict": { en: "The room changed before that action arrived. Review the latest state and try again.", "zh-CN": "操作到达前房间状态已变化，请查看最新状态后重试。" },
  "online.error.commandNotAllowed": { en: "That action is not allowed in the current room state.", "zh-CN": "当前房间状态不允许该操作。" },
  "online.error.roomExpired": { en: "This room has expired.", "zh-CN": "该房间已过期。" },
  "online.error.protocolIncompatible": { en: "This game version is incompatible. Refresh after updating.", "zh-CN": "游戏版本不兼容，请更新后刷新页面。" },
  "language.label": { en: "Language", "zh-CN": "语言" },
  "language.english": { en: "English", "zh-CN": "英文" },
  "language.chinese": { en: "Simplified Chinese", "zh-CN": "简体中文" },
  "resource.wood": { en: "Wood", "zh-CN": "木材" },
  "resource.brick": { en: "Brick", "zh-CN": "砖块" },
  "resource.wool": { en: "Wool", "zh-CN": "羊毛" },
  "resource.grain": { en: "Grain", "zh-CN": "粮食" },
  "resource.ore": { en: "Ore", "zh-CN": "矿石" },
  "nav.openSettings": { en: "Open settings", "zh-CN": "打开设置" },
  "nav.openRulebook": { en: "Open rulebook", "zh-CN": "打开规则说明" },
  "nav.toggleFullscreen": { en: "Toggle fullscreen", "zh-CN": "切换全屏" },
  "nav.openInfo": { en: "Open info", "zh-CN": "打开项目信息" },
  "board.label": { en: "Catan board", "zh-CN": "卡坦岛棋盘" },
  "board.map": { en: "Catan board map", "zh-CN": "卡坦岛棋盘地图" },
  "board.ports": { en: "Standard maritime ports", "zh-CN": "标准海上贸易港口" },
  "board.portLabel": { en: "{label} port", "zh-CN": "{label} 港口" },
  "board.utilityControls": { en: "Utility controls", "zh-CN": "工具控制" },
  "board.robber": { en: "Robber", "zh-CN": "强盗" },
  "board.players": { en: "Players", "zh-CN": "玩家" },
  "board.takingTurn": { en: "Taking turn", "zh-CN": "行动中" },
  "board.waiting": { en: "Waiting", "zh-CN": "等待中" },
  "board.placeSetupRoad": { en: "Place setup road {id}", "zh-CN": "放置初始道路 {id}" },
  "board.placeSetupSettlement": { en: "Place setup settlement {id}", "zh-CN": "放置初始村庄 {id}" },
  "board.buildRoad": { en: "Build road {id}", "zh-CN": "建造道路 {id}" },
  "board.buildSettlement": { en: "Build settlement {id}", "zh-CN": "建造村庄 {id}" },
  "board.upgradeCity": { en: "Upgrade city {id}", "zh-CN": "升级城市 {id}" },
  "terrain.forest": { en: "Forest", "zh-CN": "森林" },
  "terrain.hill": { en: "Hill", "zh-CN": "丘陵" },
  "terrain.pasture": { en: "Pasture", "zh-CN": "牧场" },
  "terrain.field": { en: "Field", "zh-CN": "农田" },
  "terrain.mountain": { en: "Mountain", "zh-CN": "山地" },
  "terrain.desert": { en: "Desert", "zh-CN": "沙漠" },
  "log.title": { en: "Game Log", "zh-CN": "游戏日志" },
  "activity.title": { en: "Activity", "zh-CN": "动态" },
  "activity.complete": { en: "Game complete", "zh-CN": "游戏已结束" },
  "activity.events": { en: "{count} logged events", "zh-CN": "已记录 {count} 条事件" },
  "stats.title": { en: "Yield Statistics", "zh-CN": "产出统计" },
  "stats.player": { en: "player", "zh-CN": "玩家" },
  "stats.dice": { en: "dice", "zh-CN": "骰点" },
  "stats.diceHeader": { en: "Dice", "zh-CN": "骰点" },
  "stats.matrix": { en: "matrix", "zh-CN": "矩阵" },
  "stats.playerLabel": { en: "Statistics player", "zh-CN": "统计玩家" },
  "stats.diceLabel": { en: "Statistics dice total", "zh-CN": "统计骰点总和" },
  "stats.incomeList": { en: "Income by player for selected dice total", "zh-CN": "所选骰点下各玩家的产出" },
  "stats.chance": { en: "Chance", "zh-CN": "概率" },
  "stats.gainNow": { en: "Gain now", "zh-CN": "当前产出" },
  "stats.expected": { en: "Expected", "zh-CN": "期望值" },
  "stats.noGain": { en: "no gain", "zh-CN": "无产出" },
  "stats.totalEv": { en: "Total EV", "zh-CN": "总期望" },
  "trade.playerTab": { en: "Player Trade", "zh-CN": "玩家交易" },
  "trade.commerceTab": { en: "Commerce Guild", "zh-CN": "商业公会" },
  "trade.panelsLabel": { en: "Trade panels", "zh-CN": "交易面板" },
  "trade.noOffer": { en: "No public offer is active.", "zh-CN": "当前没有公开报价。" },
  "trade.offer": { en: "Offer", "zh-CN": "提供" },
  "trade.request": { en: "Request", "zh-CN": "索取" },
  "trade.publish": { en: "Publish Public Offer", "zh-CN": "发布公开报价" },
  "trade.summary": { en: "{name} offers {offered} for {requested}", "zh-CN": "{name} 提供 {offered}，索取 {requested}" },
  "trade.acceptAs": { en: "Accept as {name}", "zh-CN": "由 {name} 接受" },
  "trade.cancel": { en: "Cancel Offer", "zh-CN": "取消报价" },
  "action.rollDice": { en: "Roll Dice", "zh-CN": "掷骰子" },
  "action.road": { en: "Road", "zh-CN": "道路" },
  "action.settlement": { en: "Settlement", "zh-CN": "村庄" },
  "action.city": { en: "City", "zh-CN": "城市" },
  "action.devCard": { en: "Dev Card", "zh-CN": "发展卡" },
  "action.maritime": { en: "Maritime", "zh-CN": "海上贸易" },
  "action.endTurn": { en: "End Turn", "zh-CN": "结束回合" },
  "action.noRoll": { en: "No roll", "zh-CN": "尚未掷骰" },
  "action.giveResource": { en: "Give resource", "zh-CN": "交出资源" },
  "action.receiveResource": { en: "Receive resource", "zh-CN": "获得资源" },
  "action.maritimeGiveLabel": { en: "Maritime give resource", "zh-CN": "海上贸易交出资源" },
  "action.maritimeReceiveLabel": { en: "Maritime receive resource", "zh-CN": "海上贸易获得资源" },
  "action.unavailable": { en: "unavailable", "zh-CN": "不可用" },
  "turn.number": { en: "Turn {turn} · Round {round}", "zh-CN": "第 {turn} 回合 · 第 {round} 轮" },
  "turn.gameWon": { en: "{name} has won the game", "zh-CN": "{name} 赢得了游戏" },
  "turn.setupRoad": { en: "Place the connected setup road", "zh-CN": "放置与村庄相连的初始道路" },
  "turn.setupSettlement": { en: "Place the next settlement", "zh-CN": "放置下一个初始村庄" },
  "turn.guildRedemption": { en: "Guild redemption is open: choose a player and spend tokens", "zh-CN": "公会兑换已开启：选择玩家并花费代币" },
  "turn.guildAuction": { en: "Resolve Commerce Guild auction round {round}", "zh-CN": "结算商业公会第 {round} 轮拍卖" },
  "turn.awaitingRoll": { en: "{name} must roll or play a development card", "zh-CN": "{name} 必须掷骰子或使用发展卡" },
  "turn.awaitingDiscards": { en: "Players with more than seven cards must choose their discards", "zh-CN": "持有超过七张资源卡的玩家必须选择弃牌" },
  "turn.awaitingRobber": { en: "{name} must move the robber", "zh-CN": "{name} 必须移动强盗" },
  "turn.awaitingVictim": { en: "{name} must choose a robber victim", "zh-CN": "{name} 必须选择强盗掠夺对象" },
  "turn.freeRoad": { en: "Choose the next free road", "zh-CN": "选择下一条免费道路" },
  "turn.bankResources": { en: "Choose resources from the bank", "zh-CN": "从银行选择资源" },
  "turn.monopolyResource": { en: "Choose a resource for Monopoly", "zh-CN": "为垄断选择一种资源" },
  "turn.action": { en: "Choose an action or end the turn", "zh-CN": "选择一项操作或结束回合" },
  "turn.discardRequired": { en: "{name} must discard {count}", "zh-CN": "{name} 必须弃掉 {count} 张资源卡" },
  "turn.selected": { en: "{selected} / {required} selected", "zh-CN": "已选择 {selected} / {required}" },
  "turn.submitDiscard": { en: "Submit Discard", "zh-CN": "确认弃牌" },
  "turn.moveRobber": { en: "Move the robber to a different hex", "zh-CN": "将强盗移动到另一个地块" },
  "turn.selectHex": { en: "Select an available board hex to continue.", "zh-CN": "选择一个可用地块以继续。" },
  "turn.chooseVictim": { en: "Choose a player to steal from", "zh-CN": "选择一名掠夺对象" },
  "development.knight": { en: "Knight", "zh-CN": "骑士" },
  "development.victoryPoint": { en: "Victory Point", "zh-CN": "胜利点" },
  "development.roadBuilding": { en: "Road Building", "zh-CN": "道路建设" },
  "development.yearOfPlenty": { en: "Year of Plenty", "zh-CN": "丰收年" },
  "development.monopoly": { en: "Monopoly", "zh-CN": "垄断" },
  "development.chooseRoad": { en: "Choose a highlighted road", "zh-CN": "选择一条高亮道路" },
  "development.roadsRemaining": { en: "{count} free road(s) remaining", "zh-CN": "还可免费放置 {count} 条道路" },
  "development.chooseResource": { en: "Choose {count} resource", "zh-CN": "选择 {count} 份资源" },
  "development.chooseResources": { en: "Choose {count} resources", "zh-CN": "选择 {count} 份资源" },
  "development.chooseMonopoly": { en: "Choose a resource to monopolize", "zh-CN": "选择要垄断的资源" },
  "development.placeFreeRoad": { en: "Place free road {edgeId}", "zh-CN": "放置免费道路 {edgeId}" },
  "commerce.round": { en: "Round {round}", "zh-CN": "第 {round} 轮" },
  "commerce.tokens": { en: "{count} tokens", "zh-CN": "{count} 枚代币" },
  "commerce.trade": { en: "Trade", "zh-CN": "交易" },
  "commerce.tokenRecipient": { en: "Token recipient", "zh-CN": "代币接收者" },
  "commerce.tokenAmount": { en: "Token amount", "zh-CN": "代币数量" },
  "commerce.send": { en: "Send", "zh-CN": "发送" },
  "commerce.startGathering": { en: "Start Gathering", "zh-CN": "开始集会" },
  "commerce.gatheringPlayer": { en: "Gathering player", "zh-CN": "集会玩家" },
  "commerce.redemptions": { en: "{count} redemptions remaining", "zh-CN": "还可兑换 {count} 次" },
  "commerce.bank": { en: "{count} bank", "zh-CN": "银行剩余 {count}" },
  "commerce.openAuctions": { en: "Open Auctions", "zh-CN": "开启拍卖" },
  "commerce.auctionRound": { en: "Round {round} / 3", "zh-CN": "第 {round} / 3 轮" },
  "commerce.resolveBlindBox": { en: "Resolve Blind Box", "zh-CN": "结算盲盒" },
  "commerce.redeemPrize": { en: "Redeem Prize", "zh-CN": "兑换奖品" },
  "commerce.auctionResult": { en: "{winnerName} won auction round {round} with {bid} token(s): {outcome}.", "zh-CN": "{winnerName} 以 {bid} 枚代币赢得第 {round} 轮拍卖：{outcome}。" },
  "commerce.outcome.voucher": { en: "voucher", "zh-CN": "1 张兑换券" },
  "commerce.outcome.developmentCard": { en: "{cardKind} development card", "zh-CN": "1 张{cardKind}发展卡" },
  "commerce.outcome.resources": { en: "resources: {resources}", "zh-CN": "资源：{resources}" },
  "commerce.outcome.empty": { en: "no resources (bank stock exhausted)", "zh-CN": "无资源（银行库存已耗尽）" },
  "commerce.phase.idle": { en: "idle", "zh-CN": "空闲" },
  "commerce.phase.redemption": { en: "redemption", "zh-CN": "兑换" },
  "commerce.phase.auction": { en: "auction", "zh-CN": "拍卖" },
  "commerce.phase.complete": { en: "complete", "zh-CN": "完成" },
  "dialog.settings": { en: "Settings", "zh-CN": "设置" },
  "dialog.rulebook": { en: "Rulebook", "zh-CN": "规则说明" },
  "dialog.info": { en: "Project Info", "zh-CN": "项目信息" },
  "dialog.close": { en: "Close utility panel", "zh-CN": "关闭工具面板" },
  "dialog.activePlayer": { en: "Active player", "zh-CN": "当前玩家" },
  "dialog.targetScore": { en: "Target score", "zh-CN": "目标分数" },
  "dialog.round": { en: "Round", "zh-CN": "轮次" },
  "dialog.guildPhase": { en: "Guild phase", "zh-CN": "公会阶段" },
  "dialog.recovery": { en: "Invalid actions are reported as toast messages so the local turn can recover without a page reload.", "zh-CN": "无效操作会以提示消息显示，本地回合无需刷新页面即可继续。" },
  "settings.mapSeed": { en: "Map Seed", "zh-CN": "地图种子" },
  "settings.copySeed": { en: "Copy Seed", "zh-CN": "复制种子" },
  "settings.copySeedSuccess": { en: "Map seed copied.", "zh-CN": "地图种子已复制。" },
  "settings.copySeedFailed": { en: "Copy failed. Select the seed and copy it manually.", "zh-CN": "复制失败，请选择种子并手动复制。" },
  "settings.restartTitle": { en: "Restart Match", "zh-CN": "重新开始比赛" },
  "settings.restartDescription": { en: "Keep the current players and begin again from setup.", "zh-CN": "保留当前玩家，并从初始设置阶段重新开始。" },
  "settings.newRandomMap": { en: "New Random Map", "zh-CN": "新随机地图" },
  "settings.replayCurrentMap": { en: "Replay Current Map", "zh-CN": "重玩当前地图" },
  "settings.restartConfirmFresh": { en: "Restart with a new random map? Current match progress will be cleared.", "zh-CN": "要使用新的随机地图重新开始吗？当前比赛进度将被清除。" },
  "settings.restartConfirmSameMap": { en: "Replay the current map from setup? Current match progress will be cleared.", "zh-CN": "要从初始设置阶段重玩当前地图吗？当前比赛进度将被清除。" },
  "settings.restartConfirm": { en: "Confirm Restart", "zh-CN": "确认重新开始" },
  "settings.restartCancel": { en: "Cancel", "zh-CN": "取消" },
  "dialog.rule1": { en: "Roll dice to produce resources from matching terrain with settlements and cities.", "zh-CN": "掷骰子后，与点数匹配的地块会向相邻村庄和城市产出资源。" },
  "dialog.rule2": { en: "Build roads, settlements, and cities by spending the standard resource costs.", "zh-CN": "支付标准资源费用来建造道路、村庄和城市。" },
  "dialog.rule3": { en: "Use maritime trades, development cards, the robber, longest road, and largest army to reach the target score.", "zh-CN": "利用海上贸易、发展卡、强盗、最长道路和最大骑士团达到目标分数。" },
  "dialog.rule4": { en: "Commerce Guild trades convert listed resources into tokens, then gatherings let tokens buy resources or blind boxes.", "zh-CN": "商业公会交易可将指定资源换成代币，集会期间可用代币兑换资源或盲盒。" },
  "dialog.info1": { en: "Catan Imitation is a TypeScript local-table implementation with deterministic rules, statistics, and an original Commerce Guild expansion.", "zh-CN": "卡坦岛仿制版是使用 TypeScript 实现的本地同屏游戏，包含确定性规则、统计功能和原创商业公会扩展。" },
  "dialog.info2": { en: "The interface prioritizes reviewable product behavior: visible state, direct commands, and recoverable errors.", "zh-CN": "界面强调可检查的产品行为：状态可见、操作直接，并能从错误中恢复。" },
  "game.welcome": { en: "Welcome to Catan Imitation.", "zh-CN": "欢迎来到卡坦岛仿制版。" },
  "setup.started": { en: "Setup started. Place settlements and roads in snake order.", "zh-CN": "初始设置已开始，请按蛇形顺序放置村庄和道路。" },
  "setup.newGameStarted": { en: "New game setup started.", "zh-CN": "新游戏的初始设置已开始。" },
  "dice.rolled": { en: "{playerName} rolled {total}; {eventCount} production events resolved.", "zh-CN": "{playerName} 掷出了 {total}；已结算 {eventCount} 次资源产出。" },
  "robber.sevenRolled": { en: "A 7 was rolled; resolve discards and the robber.", "zh-CN": "掷出了 7；请处理弃牌并移动强盗。" },
  "robber.discardCompleted": { en: "{playerName} completed a seven-roll discard.", "zh-CN": "{playerName} 已完成点数 7 的弃牌。" },
  "robber.moved": { en: "Robber moved to {hexId}.", "zh-CN": "强盗已移动到 {hexId}。" },
  "robber.stolen": { en: "{playerName} stole one random resource from {victimName}.", "zh-CN": "{playerName} 从 {victimName} 随机夺取了 1 份资源。" },
  "development.played": { en: "{playerName} played {cardKind}.", "zh-CN": "{playerName} 使用了{cardKind}。" },
  "development.bought": { en: "{playerName} bought a development card.", "zh-CN": "{playerName} 购买了一张发展卡。" },
  "development.knightPlayed": { en: "{playerName} played a knight card; move the robber.", "zh-CN": "{playerName} 使用了骑士卡；请移动强盗。" },
  "development.freeRoadPlaced": { en: "{playerName} placed a free road.", "zh-CN": "{playerName} 免费放置了一条道路。" },
  "development.yearOfPlentyLog": { en: "Year of Plenty supplied {resource}.", "zh-CN": "丰收年提供了{resource}。" },
  "development.monopolyLog": { en: "Monopoly collected all opponent {resource}.", "zh-CN": "垄断收取了所有对手的{resource}。" },
  "trade.maritime": { en: "{playerName} completed a maritime trade: {give} for {receive}.", "zh-CN": "{playerName} 完成海上贸易：用{give}换取{receive}。" },
  "trade.player.published": { en: "{proposerName} published a public player trade.", "zh-CN": "{proposerName} 发布了一项公开玩家交易。" },
  "trade.player.cancelled": { en: "{proposerName} cancelled the public player trade.", "zh-CN": "{proposerName} 取消了公开玩家交易。" },
  "trade.player.accepted": { en: "{acceptingPlayerName} accepted {proposerName}'s public player trade.", "zh-CN": "{acceptingPlayerName} 接受了 {proposerName} 的公开玩家交易。" },
  "guild.gatheringAutoStarted": { en: "The Commerce Guild gathering has started automatically.", "zh-CN": "商业公会集会已自动开始。" },
  "guild.slotCompleted": { en: "Commerce Guild trade completed and the slot refreshed.", "zh-CN": "商业公会交易已完成，交易位已刷新。" },
  "guild.tokensTransferred": { en: "{fromName} transferred {amount} guild token(s) to {toName}.", "zh-CN": "{fromName} 向 {toName} 转移了 {amount} 枚公会代币。" },
  "guild.gatheringStarted": { en: "The Commerce Guild gathering has started.", "zh-CN": "商业公会集会已开始。" },
  "guild.auctionOpened": { en: "The Commerce Guild auction phase is open.", "zh-CN": "商业公会拍卖阶段已开启。" },
  "guild.auctionNoEligibleBidders": { en: "The Commerce Guild auction ended because no player has guild tokens.", "zh-CN": "没有玩家持有公会代币，商业公会拍卖已结束。" },
  "guild.auctionRoundNoBids": { en: "No bids were placed in Commerce Guild auction round {round}.", "zh-CN": "商业公会第 {round} 轮拍卖无人出价。" },
  "guild.redeemedResources": { en: "{playerName} redeemed guild tokens for resources.", "zh-CN": "{playerName} 使用公会代币兑换了资源。" },
  "guild.auctionResolved": { en: "{winnerName} won auction round {round} with {bid} token(s): {outcome}.", "zh-CN": "{winnerName} 以 {bid} 枚代币赢得第 {round} 轮拍卖：{outcome}。" },
  "guild.prizeRedeemed": { en: "{playerName} redeemed vouchers for prize cards.", "zh-CN": "{playerName} 使用兑换券换取了奖品卡。" }
} as const;

export type MessageKey = keyof typeof messages;

export function translate(
  locale: Locale,
  key: MessageKey,
  params: MessageParams = {}
): string {
  const template = messages[key]?.[locale] ?? messages[key]?.en ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? `{${name}}`));
}

export function formatAuctionOutcome(outcome: BlindBoxOutcome, locale: Locale): string {
  if (outcome.kind === "voucher") return translate(locale, "commerce.outcome.voucher");
  if (outcome.kind === "developmentCard") {
    const cardKind = locale === "en"
      ? outcome.card
      : translate(locale, `development.${outcome.card}`);
    return translate(locale, "commerce.outcome.developmentCard", { cardKind });
  }
  const bundle = resources
    .filter((resource) => outcome.resources[resource] > 0)
    .map((resource) => {
      const label = locale === "en" ? resource : translate(locale, `resource.${resource}`);
      return `${label} ${outcome.resources[resource]}`;
    })
    .join(", ");
  return bundle
    ? translate(locale, "commerce.outcome.resources", { resources: bundle })
    : translate(locale, "commerce.outcome.empty");
}

export function formatAuctionSummary(summary: AuctionSummaryData, locale: Locale): string {
  return translate(locale, "commerce.auctionResult", {
    winnerName: summary.winnerName,
    round: summary.round,
    bid: summary.winningBid,
    outcome: formatAuctionOutcome(summary.outcome, locale)
  });
}

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

const localeStorageKey = "catan.locale";

export function readStoredLocale(storage?: LocaleStorage): Locale {
  if (!storage) return "en";
  try {
    const value = storage.getItem(localeStorageKey);
    return value === "zh-CN" || value === "en" ? value : "en";
  } catch {
    return "en";
  }
}

function browserStorage(): LocaleStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (key, params) => translate("en", key, params)
});

export function I18nProvider({
  children,
  initialLocale
}: {
  children?: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(
    () => initialLocale ?? readStoredLocale(browserStorage())
  );
  useEffect(() => {
    try {
      browserStorage()?.setItem?.(localeStorageKey, locale);
    } catch {
      // Storage is optional; the in-memory locale remains usable.
    }
  }, [locale]);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale]
  );
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

function localizedLogParams(locale: Locale, params: MessageParams): MessageParams {
  const localized = { ...params };
  for (const name of ["resource", "give", "receive"]) {
    const value = params[name];
    const key = `resource.${value}` as MessageKey;
    if (typeof value === "string" && key in messages) localized[name] = translate(locale, key);
  }
  const cardKind = params.cardKind;
  const cardKey = `development.${cardKind}` as MessageKey;
  if (typeof cardKind === "string" && cardKey in messages) {
    localized.cardKind = translate(locale, cardKey);
  }
  if (params.outcomeKind === "voucher") {
    localized.outcome = formatAuctionOutcome({ kind: "voucher" }, locale);
  } else if (params.outcomeKind === "developmentCard" && typeof params.cardKind === "string") {
    localized.outcome = formatAuctionOutcome(
      { kind: "developmentCard", card: params.cardKind as DevelopmentCardKind },
      locale
    );
  } else if (params.outcomeKind === "resources") {
    const resourceMap = Object.fromEntries(
      resources.map((resource) => [resource, Number(params[resource] ?? 0)])
    ) as ResourceMap;
    localized.outcome = formatAuctionOutcome({ kind: "resources", resources: resourceMap }, locale);
  }
  return localized;
}

export function formatGameLogEntry(entry: GameLogEntry, locale: Locale): string {
  if (!entry.messageKey || !(entry.messageKey in messages)) return entry.message;
  return translate(
    locale,
    entry.messageKey as MessageKey,
    localizedLogParams(locale, entry.params ?? {})
  );
}

const exactRuleTranslations: Record<string, string> = {
  "Roll the dice before using normal turn actions.": "执行常规回合操作前请先掷骰子。",
  "Only the active player may perform this action.": "只有当前玩家可以执行此操作。",
  "This action is unavailable during setup.": "初始设置期间无法执行此操作。",
  "The game is already over.": "游戏已经结束。",
  "The active player has already rolled this turn.": "当前玩家本回合已经掷过骰子。",
  "Player trades are available only during the action phase.": "玩家交易仅在行动阶段可用。",
  "Only the active player may publish a player trade.": "只有当前玩家可以发布玩家交易。",
  "Only one public player trade may be active at a time.": "同一时间只能存在一项公开玩家交易。",
  "The active player cannot afford the offered resources.": "当前玩家无法支付所提供的资源。",
  "The active player cannot accept their own offer.": "当前玩家不能接受自己的报价。",
  "The proposer can no longer afford the offered resources.": "报价方已无法支付所提供的资源。",
  "Player trade quantities must be non-negative whole numbers.": "玩家交易数量必须是非负整数。",
  "Offered bundle must contain at least one resource.": "提供的资源组合至少要包含一种资源。",
  "Requested bundle must contain at least one resource.": "索取的资源组合至少要包含一种资源。",
  "There is no public player trade to accept.": "当前没有可接受的公开玩家交易。",
  "There is no public player trade to cancel.": "当前没有可取消的公开玩家交易。",
  "Auction requires at least one affordable positive bid.": "拍卖至少需要一个可支付的正数出价。",
  "Player does not have enough resources for this maritime trade.": "玩家没有足够资源完成此次海上贸易。",
  "A better maritime trade ratio requires an owned port.": "更优惠的海上贸易比例需要拥有相应港口。",
  "Fullscreen exit is not available in this browser.": "此浏览器不支持退出全屏。",
  "Fullscreen exit was blocked by the browser.": "浏览器阻止了退出全屏。",
  "Fullscreen is not available in this browser.": "此浏览器不支持全屏。",
  "Complete setup placement before using turn actions.": "完成初始放置后才能执行回合操作。",
  "Start a new game to use turn actions.": "开始新游戏后才能执行回合操作。",
  "Complete all required discards before using turn actions.": "完成所有必需的弃牌后才能执行回合操作。",
  "Move the robber before using turn actions.": "移动强盗后才能执行回合操作。",
  "Choose a robber victim before using turn actions.": "选择强盗掠夺对象后才能执行回合操作。",
  "Complete the current development-card effect first.": "请先完成当前发展卡效果。",
  "No legal target is available.": "当前没有合法目标。",
  "Complete setup before rolling.": "完成初始设置后才能掷骰子。",
  "Start a new game before rolling.": "开始新游戏后才能掷骰子。",
  "Only the active player may roll.": "只有当前玩家可以掷骰子。",
  "The dice have already been rolled for this turn.": "本回合已经掷过骰子。",
  "The development deck is empty.": "发展卡牌库已空。",
  "A development card cannot be played during the current phase.": "当前阶段不能使用发展卡。",
  "No eligible card of this type is available.": "没有可用的此类发展卡。",
  "No affordable maritime trade is available.": "当前没有可支付的海上贸易。",
  "A Commerce Guild trade was already completed this turn.": "本回合已经完成过一次商业公会交易。",
  "No guild tokens are available to send.": "没有可发送的公会代币。",
  "A gathering is available only during normal play.": "只有正常游戏阶段可以开启集会。",
  "A gathering is already in progress.": "集会已经在进行中。",
  "Auctions are available only during normal play.": "只有正常游戏阶段可以进行拍卖。",
  "Resource redemption is not open.": "资源兑换尚未开启。",
  "Three vouchers are required to redeem a prize.": "兑换奖品需要三张兑换券。",
  "A player may complete a Commerce Guild trade only once per turn.": "每名玩家每回合只能完成一次商业公会交易。",
  "Player does not have the required resources for this trade.": "玩家没有完成此次交易所需的资源。",
  "Token transfer requires two different players.": "代币必须在两名不同玩家之间转移。",
  "Player does not have enough guild tokens.": "玩家没有足够的公会代币。",
  "Guild gathering is not in resource redemption phase.": "公会集会当前不在资源兑换阶段。",
  "The gathering redemption cap has already been reached.": "已经达到集会兑换次数上限。",
  "The player has no guild tokens available for redemption.": "该玩家没有可用于兑换的公会代币。",
  "The bank does not have enough stock for this gathering redemption.": "银行库存不足，无法完成此次集会兑换。",
  "Guild gathering is not in auction phase.": "公会集会当前不在拍卖阶段。",
  "Development card deck is empty.": "发展卡牌库已空。",
  "The selected development card is not owned by this player.": "所选发展卡不属于该玩家。",
  "Victory-point development cards remain hidden and are not played.": "胜利点发展卡保持隐藏，不能主动使用。",
  "Non-victory development cards cannot be played on the same turn they were purchased.": "非胜利点发展卡不能在购买当回合使用。",
  "A knight card is required.": "此操作需要骑士卡。",
  "Maritime trade must exchange two different resources.": "海上贸易必须交换两种不同资源。",
  "Robber victim has no resource cards to steal.": "强盗掠夺对象没有可夺取的资源卡。",
  "A development card cannot be played during the current turn phase.": "当前回合阶段不能使用发展卡。",
  "Only one non-victory development card may be played per turn.": "每回合只能使用一张非胜利点发展卡。",
  "No seven-roll discards are currently pending.": "当前没有点数 7 引发的待处理弃牌。",
  "This player does not owe a seven-roll discard.": "该玩家无需处理点数 7 的弃牌。",
  "Discard quantities must be non-negative whole numbers.": "弃牌数量必须是非负整数。",
  "A player cannot discard more resources than they hold.": "玩家不能弃掉超过持有数量的资源。",
  "No robber interaction is pending.": "当前没有待处理的强盗操作。",
  "The robber cannot be moved during the current turn phase.": "当前回合阶段不能移动强盗。",
  "The robber must move to a different hex.": "强盗必须移动到另一个地块。",
  "No robber victim selection is pending.": "当前没有待处理的强盗掠夺对象选择。",
  "The selected player is not an eligible robber victim.": "所选玩家不是合法的强盗掠夺对象。",
  "Only the active player who published the offer may cancel it.": "只有发布报价的当前玩家可以取消报价。"
};

export function translateRuleText(locale: Locale, message: string | null | undefined): string {
  if (!message || locale === "en") return message ?? "";
  if (exactRuleTranslations[message]) return exactRuleTranslations[message];
  const cannotAfford = message.match(/^(.+) cannot afford the requested resources\.$/);
  if (cannotAfford) return `${cannotAfford[1]} 无法支付所索取的资源。`;
  const buildAfford = message.match(/^(.+) cannot afford (?:this build|a development card)\.$/);
  if (buildAfford) return `${buildAfford[1]} 无法支付所需资源。`;
  const bidExceeds = message.match(/^(.+) bid exceeds available guild tokens\.$/);
  if (bidExceeds) return `${bidExceeds[1]} 的出价超过了可用公会代币。`;
  const rollBefore = message.match(/^Roll the dice before (.+)\.$/);
  if (rollBefore) return `请先掷骰子，再${rollBefore[1] === "building" ? "进行建造" : "执行此操作"}。`;
  const cannotAffordList = message.match(/^Cannot afford: need (.+)\.$/);
  if (cannotAffordList) {
    const localizedResources = cannotAffordList[1]
      .split(", ")
      .map((resource) => {
        const key = `resource.${resource}` as MessageKey;
        return key in messages ? translate(locale, key) : resource;
      })
      .join("、");
    return `无法支付：还需要${localizedResources}。`;
  }
  const exactDiscard = message.match(/^This player must discard exactly (\d+) resource cards\.$/);
  if (exactDiscard) return `该玩家必须正好弃掉 ${exactDiscard[1]} 张资源卡。`;
  const bankEmpty = message.match(/^Bank has no (.+) available for maritime trade\.$/);
  if (bankEmpty) return `银行没有可用于海上贸易的 ${bankEmpty[1]}。`;
  return message;
}
