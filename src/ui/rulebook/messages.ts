type RulebookMessage = {
  readonly en: string;
  readonly "zh-CN": string;
};

export const rulebookMessages = {
  "rulebook.chapter.quickStart": { en: "Quick Start", "zh-CN": "快速开始" },
  "rulebook.chapter.baseRules": { en: "Base Rules", "zh-CN": "基础规则" },
  "rulebook.chapter.commerceGuild": { en: "Commerce Guild", "zh-CN": "商业公会" },
  "rulebook.chapter.quickReference": { en: "Quick Reference", "zh-CN": "速查表" },
  "rulebook.navigationLabel": { en: "Rulebook chapters", "zh-CN": "规则说明章节" },
  "rulebook.languageLabel": { en: "Rulebook language", "zh-CN": "规则说明语言" },

  "rulebook.quick.title": { en: "Learn your first game", "zh-CN": "学会第一局游戏" },
  "rulebook.quick.intro": {
    en: "Follow this chapter from top to bottom once. It covers the objective, setup, a normal turn, the robber, and how the game ends.",
    "zh-CN": "第一次游玩时请从上到下阅读本章。这里会说明目标、初始设置、正常回合、强盗和游戏结束方式。"
  },
  "rulebook.quick.objectiveTitle": { en: "1. Objective", "zh-CN": "一、游戏目标" },
  "rulebook.quick.objectiveBody": {
    en: "Build a connected network and be the first player to reach the target score shown by the game. Settlements, cities, awards, hidden Victory Point cards, and Commerce Guild prize cards can all add points.",
    "zh-CN": "建立相连的道路与建筑，并率先达到游戏显示的目标分数。村庄、城市、奖励、隐藏的胜利点卡和商业公会奖品卡都能提供分数。"
  },
  "rulebook.quick.resourcesTitle": { en: "2. Resources and terrain", "zh-CN": "二、资源与地形" },
  "rulebook.quick.resourcesIntro": {
    en: "Five producing terrain types supply the five resources. The desert produces nothing.",
    "zh-CN": "五种产出地形分别提供五种资源；沙漠不产出任何资源。"
  },
  "rulebook.quick.setupTitle": { en: "3. Set up the board", "zh-CN": "三、完成初始设置" },
  "rulebook.quick.setupStep1": {
    en: "Players place in snake order: first player to last player, then last player back to first player.",
    "zh-CN": "玩家按蛇形顺序放置：先从第一名玩家到最后一名玩家，再从最后一名玩家反向回到第一名玩家。"
  },
  "rulebook.quick.setupStep2": {
    en: "On each setup turn, place one settlement first, then place one road connected to that settlement.",
    "zh-CN": "每次设置回合先放置一座村庄，再放置一条与该村庄相连的道路。"
  },
  "rulebook.quick.setupStep3": {
    en: "A settlement must obey the distance rule: no building may occupy either neighboring intersection.",
    "zh-CN": "村庄必须遵守距离规则：相邻的两个交叉点都不能已有建筑。"
  },
  "rulebook.quick.setupStep4": {
    en: "Your first settlement grants no starting resources. After placing your second settlement, gain one resource from every adjacent producing hex; desert contributes nothing.",
    "zh-CN": "第一座村庄不会提供初始资源。放置第二座村庄后，从它相邻的每个产出地块获得一份资源；沙漠不提供资源。"
  },
  "rulebook.quick.setupExampleTitle": { en: "Setup example", "zh-CN": "设置示例" },
  "rulebook.quick.setupExampleBody": {
    en: "Your second settlement touches a forest, a field, and the desert. You gain one wood and one grain, then place its connected road.",
    "zh-CN": "你的第二座村庄邻接森林、农田和沙漠。你获得一份木材和一份粮食，然后放置与村庄相连的道路。"
  },
  "rulebook.quick.turnTitle": { en: "4. Take a normal turn", "zh-CN": "四、进行正常回合" },
  "rulebook.quick.turnStep1": { en: "Roll the dice, unless you first play an eligible development card.", "zh-CN": "掷骰子；如果有符合条件的发展卡，也可以先使用发展卡。" },
  "rulebook.quick.turnStep2": {
    en: "Resolve every mandatory decision, such as discards, robber movement, a victim choice, or a development-card effect.",
    "zh-CN": "处理所有强制决定，例如弃牌、移动强盗、选择被掠夺玩家或完成发展卡效果。"
  },
  "rulebook.quick.turnStep3": {
    en: "In the action phase, take any legal actions in any allowed order: build, buy or play a development card, publish or accept a player trade, make a maritime trade, or use the Commerce Guild.",
    "zh-CN": "进入行动阶段后，可以按允许的任意顺序执行合法行动：建造、购买或使用发展卡、发布或接受玩家交易、进行海上贸易，或使用商业公会。"
  },
  "rulebook.quick.turnStep4": { en: "End the turn only after every pending decision or offer is resolved.", "zh-CN": "只有处理完所有待决定事项或报价后，才能结束回合。" },
  "rulebook.quick.turnExampleTitle": { en: "Turn example", "zh-CN": "回合示例" },
  "rulebook.quick.turnExampleBody": {
    en: "You roll 8. Each unblocked adjacent settlement on an 8 produces one card and each city produces two, limited by bank stock. You then trade, build a road, and end the turn.",
    "zh-CN": "你掷出 8。每座邻接点数 8 且未被强盗阻挡的村庄产出一份资源，城市产出两份，并受银行库存限制。随后你进行交易、建造道路并结束回合。"
  },
  "rulebook.quick.sevenTitle": { en: "5. When a 7 is rolled", "zh-CN": "五、掷出 7 时" },
  "rulebook.quick.sevenBody": {
    en: "Every player with more than seven resource cards discards exactly half, rounded down. After all required discards, the active player moves the robber to a different hex. If an opponent with at least one resource has a building beside that hex, choose an eligible victim and steal one random hidden resource. The robber blocks that hex from producing.",
    "zh-CN": "每名持有超过七张资源卡的玩家都必须弃掉正好一半，向下取整。所有应弃牌玩家完成后，当前玩家把强盗移动到另一个地块。如果有持有资源的对手在该地块旁拥有建筑，就选择一名符合条件的玩家并随机夺取一份隐藏资源。强盗会阻止所在的地块产出。"
  },
  "rulebook.quick.victoryTitle": { en: "6. Score and win", "zh-CN": "六、得分并获胜" },
  "rulebook.quick.victoryBody": {
    en: "Settlements are worth 1 point and cities 2. Longest Road, Largest Army, hidden Victory Point cards, and Commerce Guild prize cards add more. The game declares a winner when a player's score reaches the displayed target.",
    "zh-CN": "村庄价值 1 分，城市价值 2 分。最长道路、最大骑士团、隐藏的胜利点卡和商业公会奖品卡还能增加分数。当玩家分数达到界面显示的目标时，游戏会宣布胜者。"
  },

  "rulebook.base.title": { en: "Base rules", "zh-CN": "基础规则" },
  "rulebook.base.intro": { en: "Use this chapter when you need the exact rule behind an action or an unavailable control.", "zh-CN": "需要查询某个行动的确切规则或按钮无法使用的原因时，请阅读本章。" },
  "rulebook.base.productionTitle": { en: "Production and the bank", "zh-CN": "产出与银行" },
  "rulebook.base.productionBody": {
    en: "A non-7 roll activates every matching numbered hex except the robber's hex. An adjacent settlement requests one resource and a city requests two. The desert never produces. Every award is limited by the bank's remaining stock, so a depleted resource may be paid only partially or not at all.",
    "zh-CN": "除 7 以外的骰点会激活所有号码相符且没有强盗的地块。邻接村庄请求一份资源，城市请求两份。沙漠永不产出。所有发放都受银行剩余库存限制，因此库存不足的资源可能只能部分发放或完全无法发放。"
  },
  "rulebook.base.buildingTitle": { en: "Roads, settlements, and cities", "zh-CN": "道路、村庄与城市" },
  "rulebook.base.roadRule": { en: "Road: place it on a legal empty edge connected to your road or building. An opponent's building interrupts your route through that intersection.", "zh-CN": "道路：放在与己方道路或建筑相连的合法空边上。对手的建筑会中断你穿过该交叉点的道路连接。" },
  "rulebook.base.settlementRule": { en: "Settlement: place it on a legal empty intersection connected to your road, with both neighboring intersections empty of buildings.", "zh-CN": "村庄：放在与己方道路相连的合法空交叉点上，并且相邻两个交叉点都不能有建筑。" },
  "rulebook.base.cityRule": { en: "City: upgrade one of your own settlements; it replaces that settlement and doubles its production.", "zh-CN": "城市：升级自己的一座村庄；城市会替代该村庄，并使其产出翻倍。" },
  "rulebook.base.availabilityRule": { en: "A build also requires enough resources, an available piece, and at least one legal highlighted target. The bank receives the paid resources.", "zh-CN": "建造还需要足够的资源、可用棋子以及至少一个合法的高亮目标。支付的资源会回到银行。" },
  "rulebook.base.costsTitle": { en: "Build costs", "zh-CN": "建造费用" },
  "rulebook.cost.road": { en: "Road", "zh-CN": "道路" },
  "rulebook.cost.settlement": { en: "Settlement", "zh-CN": "村庄" },
  "rulebook.cost.city": { en: "City", "zh-CN": "城市" },
  "rulebook.cost.developmentCard": { en: "Development card", "zh-CN": "发展卡" },
  "rulebook.base.tradeTitle": { en: "Player and maritime trade", "zh-CN": "玩家交易与海上贸易" },
  "rulebook.base.playerTrade": { en: "During your action phase, publish one public offer stating what you give and request. Another player may accept if both sides can still pay; the publisher may cancel it. Resolve the pending offer before ending the turn or starting a gathering.", "zh-CN": "在自己的行动阶段，可以发布一项公开报价，说明提供和索取的资源。如果双方仍能支付，其他玩家可以接受；发布者也可以取消。结束回合或开启集会前必须处理待定报价。" },
  "rulebook.base.maritimeTrade": { en: "A maritime trade exchanges one resource type for one different bank resource: 4:1 by default, 3:1 through an owned generic port, or 2:1 through an owned matching resource port. The bank must hold the requested card.", "zh-CN": "海上贸易用一种资源换取银行中的另一种资源：默认 4:1，拥有通用港口时为 3:1，拥有对应资源港口时为 2:1。银行必须仍有想获得的资源。" },
  "rulebook.base.developmentTitle": { en: "Development cards", "zh-CN": "发展卡" },
  "rulebook.base.developmentTiming": { en: "You may play at most one non-victory development card per turn, either before rolling or during the action phase. A non-victory card cannot be played on the turn it was purchased.", "zh-CN": "每回合最多使用一张非胜利点发展卡，可以在掷骰前或行动阶段使用。非胜利点卡不能在购买当回合使用。" },
  "rulebook.base.cardKnight": { en: "Knight: move the robber and then steal from an eligible victim; the played card counts toward Largest Army.", "zh-CN": "骑士：移动强盗并从符合条件的玩家处随机夺取资源；已使用的骑士卡计入最大骑士团。" },
  "rulebook.base.cardRoadBuilding": { en: "Road Building: place up to two legal roads without paying their resource costs; the effect ends early if no legal road remains.", "zh-CN": "道路建设：无需支付资源即可放置最多两条合法道路；如果没有合法道路，效果会提前结束。" },
  "rulebook.base.cardYearOfPlenty": { en: "Year of Plenty: choose up to two resources, one at a time, from cards still available in the bank.", "zh-CN": "丰收年：从银行仍有库存的资源中逐份选择，最多获得两份。" },
  "rulebook.base.cardMonopoly": { en: "Monopoly: name one resource and take every card of that type from all opponents.", "zh-CN": "垄断：指定一种资源，并拿走所有对手持有的该种资源。" },
  "rulebook.base.cardVictoryPoint": { en: "Victory Point: remains hidden, cannot be played, and adds 1 point to its owner.", "zh-CN": "胜利点：保持隐藏，不能主动使用，并为持有者增加 1 分。" },
  "rulebook.base.robberTitle": { en: "Robber details and privacy", "zh-CN": "强盗细则与隐私" },
  "rulebook.base.robberBody": { en: "A 7 makes each player holding more than seven cards discard half rounded down before the robber moves. The robber must move to a different hex. Eligible victims have a building beside the new hex and at least one resource; the stolen type is random and remains private in Online play.", "zh-CN": "掷出 7 后，每名持有超过七张资源卡的玩家先弃掉一半并向下取整，然后移动强盗。强盗必须移动到不同地块。符合条件的对象需要在新地块旁有建筑且至少持有一份资源；被夺取的种类随机决定，并在联机游戏中保持私密。" },
  "rulebook.base.scoringTitle": { en: "Scoring and awards", "zh-CN": "计分与奖励" },
  "rulebook.base.scoreBuildings": { en: "Settlement: 1 point. City: 2 points.", "zh-CN": "村庄：1 分。城市：2 分。" },
  "rulebook.base.scoreLongestRoad": { en: "Longest Road: 2 points. It requires at least five connected roads. An opponent building breaks continuity. A tied current owner keeps the award; without a tied current owner, an unresolved tie has no owner.", "zh-CN": "最长道路：2 分。至少需要五条相连道路；对手建筑会切断连续性。出现平局时，若当前持有者仍并列领先则保留奖励；否则未决平局没有持有者。" },
  "rulebook.base.scoreLargestArmy": { en: "Largest Army: 2 points. It begins at three played knights and changes owner only when another player strictly exceeds the current owner's count.", "zh-CN": "最大骑士团：2 分。至少需要三张已使用的骑士卡；只有其他玩家的数量严格超过当前持有者时才会转移。" },
  "rulebook.base.scoreCards": { en: "Each hidden Victory Point card is worth 1 point. Each Commerce Guild prize card is worth 2 points.", "zh-CN": "每张隐藏胜利点卡价值 1 分；每张商业公会奖品卡价值 2 分。" },
  "rulebook.base.scoreTarget": { en: "The configured target is shown by the game. Reaching it causes the game to declare the winner.", "zh-CN": "游戏会显示当前配置的目标分数；达到该分数后会宣布胜者。" },
  "rulebook.common.title": { en: "Common misunderstandings", "zh-CN": "常见误解" },
  "rulebook.base.misunderstanding1": { en: "The first setup settlement grants no resources; only the second one does.", "zh-CN": "第一座初始村庄不提供资源；只有第二座会提供。" },
  "rulebook.base.misunderstanding2": { en: "Each setup settlement is immediately followed by its own connected setup road.", "zh-CN": "每座初始村庄后都要立刻放置一条与它相连的初始道路。" },
  "rulebook.base.misunderstanding3": { en: "Having enough resources does not create a legal build target; connection, distance, and piece limits still apply.", "zh-CN": "资源足够并不代表一定有合法建造目标；连接、距离和棋子数量限制仍然生效。" },
  "rulebook.base.misunderstanding4": { en: "A newly purchased non-victory development card waits until a later turn.", "zh-CN": "新购买的非胜利点发展卡必须等到后续回合才能使用。" },
  "rulebook.base.misunderstanding5": { en: "Online opponents' resource types, development cards, and sealed bid amounts are private even when public counts or submission status are visible.", "zh-CN": "联机游戏中，即使公开数量或提交状态可见，对手的资源种类、发展卡和密封出价金额仍然私密。" },

  "rulebook.guild.title": { en: "Commerce Guild expansion", "zh-CN": "商业公会扩展" },
  "rulebook.guild.intro": { en: "Learn the base game first. The Commerce Guild adds trade slots, tokens, paced gatherings, resource redemption, sealed auctions, vouchers, and prize cards.", "zh-CN": "请先理解基础游戏。商业公会会增加交易位、代币、有节奏的集会、资源兑换、密封拍卖、兑换券和奖品卡。" },
  "rulebook.guild.slotsTitle": { en: "Trade slots earn tokens", "zh-CN": "通过交易位获得代币" },
  "rulebook.guild.slotWood": { en: "Initial wood contract: pay two wood to gain two guild tokens.", "zh-CN": "初始木材合约：支付两份木材，获得两枚公会代币。" },
  "rulebook.guild.slotBrick": { en: "Initial brick contract: pay one brick and one grain to gain three guild tokens.", "zh-CN": "初始砖块合约：支付一份砖块和一份粮食，获得三枚公会代币。" },
  "rulebook.guild.slotOre": { en: "Initial ore contract: pay one ore to gain two guild tokens.", "zh-CN": "初始矿石合约：支付一份矿石，获得两枚公会代币。" },
  "rulebook.guild.slotRefresh": { en: "Completing a listed slot pays its exact displayed cost to the bank, awards its displayed tokens, and refreshes that slot. A player may complete at most one Commerce Guild slot per turn.", "zh-CN": "完成交易位时，按界面列出的费用向银行支付资源，获得显示的代币，并刷新该交易位。每名玩家每回合最多完成一个商业公会交易位。" },
  "rulebook.guild.tokensTitle": { en: "Transfer tokens", "zh-CN": "转移代币" },
  "rulebook.guild.tokensBody": { en: "During a clean current-player action phase, guild tokens may be sent to a different player when the sender owns enough. Wrong-player, unresolved-action, pending-trade, or gathering phases can make the control unavailable.", "zh-CN": "在当前玩家且没有待处理事项的行动阶段，如果发送者持有足够代币，就可以把公会代币转给另一名玩家。错误玩家、未处理行动、待定交易或集会阶段都会使该操作不可用。" },
  "rulebook.guild.cooldownTitle": { en: "When a gathering may start", "zh-CN": "何时可以开启集会" },
  "rulebook.guild.cooldownBody": { en: "Let n be the number of players. A new match begins with a table-wide 2n-turn cooldown. After someone starts a gathering, a new n-turn cooldown begins and the initiating turn is excluded: the displayed n remains through the end of that turn, then subsequent completed turns reduce it.", "zh-CN": "令 n 为玩家人数。新比赛开始时，全桌有 2n 回合冷却。有人开启集会后，会重新进入 n 回合冷却，并排除发起回合：发起回合结束前仍显示 n，之后每完成一个后续回合才会减少。" },
  "rulebook.guild.startAuthority": { en: "At zero, only the current player may start during a clean normal action phase. No player trade may be pending, and the previous gathering must be idle. The cooldown belongs to the table, not to individual players.", "zh-CN": "冷却为零时，只有当前玩家能在没有待处理事项的正常行动阶段开启集会。不能存在待定玩家交易，上一场集会也必须处于空闲状态。冷却属于整张桌，而不是个别玩家。" },
  "rulebook.guild.redemptionTitle": { en: "Resource redemption", "zh-CN": "资源兑换" },
  "rulebook.guild.redemptionBody": { en: "During redemption, one guild token buys one chosen resource from the bank. The limit is four resources per player per gathering; a player cannot spend more tokens than owned or take a resource whose bank stock is zero. Open the auction after redemption decisions are complete.", "zh-CN": "兑换阶段中，一枚公会代币可以从银行购买一份所选资源。每名玩家每次集会最多兑换四份资源；不能花费超过持有数量的代币，也不能拿取银行库存为零的资源。所有兑换决定完成后开启拍卖。" },
  "rulebook.guild.auctionTitle": { en: "Three sealed auction rounds", "zh-CN": "三轮密封拍卖" },
  "rulebook.guild.auctionBody": { en: "The auction has three sealed rounds. Each eligible player submits an affordable whole-number bid from zero up to their token total. In Online play, only your own amount is visible; everyone may see whether each seat submitted. You may replace a submitted bid before the round resolves.", "zh-CN": "拍卖包含三轮密封拍卖。每名符合条件的玩家提交整数出价，范围从零到自己持有的代币总数。联机游戏中只能看到自己的金额，但所有人都能看到各席位是否已提交。轮次结算前可以替换已提交的出价。" },
  "rulebook.guild.auctionWinner": { en: "The highest positive affordable bid wins and pays its tokens. If top bids tie, current turn order breaks the tie. A zero bid is a pass. Each resolved or no-bid round advances; after round three the gathering completes.", "zh-CN": "最高的正数且可支付出价获胜，并支付相应代币。最高价相同时按当前回合顺序决定胜者。零出价表示放弃。每个已结算或无人出价的轮次都会推进；第三轮后集会完成。" },
  "rulebook.guild.auctionTermination": { en: "If there is no eligible token holder when the auction opens, it completes immediately. If every player submits zero bids, the round records no bid and advances, so an auction cannot become stuck.", "zh-CN": "开启拍卖时如果没有符合条件的代币持有者，拍卖会立即完成。如果所有玩家都提交零出价，本轮会记录为无人出价并继续推进，因此拍卖不会卡住。" },
  "rulebook.guild.outcomesTitle": { en: "Blind-box outcomes and privacy", "zh-CN": "盲盒结果与隐私" },
  "rulebook.guild.outcomeResources": { en: "Resource outcome: the bank awards the rolled bundle up to its available stock.", "zh-CN": "资源结果：银行按照抽取的组合发放资源，但不超过实际库存。" },
  "rulebook.guild.outcomeDevelopment": { en: "Development-card outcome: the winner draws the next available development card.", "zh-CN": "发展卡结果：获胜者抽取牌库中下一张可用的发展卡。" },
  "rulebook.guild.outcomeVoucher": { en: "Voucher outcome: the winner gains one voucher for later prize redemption.", "zh-CN": "兑换券结果：获胜者获得一张兑换券，用于之后兑换奖品。" },
  "rulebook.guild.outcomePrivacy": { en: "Online public results show only information allowed by the room projection. Exact resource types, development-card identity, and opponents' bid amounts may remain private.", "zh-CN": "联机公开结果只显示房间投影允许的信息。具体资源种类、发展卡身份和对手出价金额可能保持私密。" },
  "rulebook.guild.prizesTitle": { en: "Vouchers and prize cards", "zh-CN": "兑换券与奖品卡" },
  "rulebook.guild.prizesBody": { en: "Redeem three vouchers for one Commerce Guild prize card worth 2 victory points. If you hold enough for several complete groups, redemption converts every complete group and leaves any remainder.", "zh-CN": "使用三张兑换券可以兑换一张价值 2 胜利点的商业公会奖品卡。如果持有多组完整的三张，兑换会处理所有完整组并保留余数。" },
  "rulebook.guild.misunderstanding1": { en: "The cooldown is table-wide; there is no separate personal cooldown.", "zh-CN": "冷却属于全桌，不存在单独的个人冷却。" },
  "rulebook.guild.misunderstanding2": { en: "The initiating turn does not consume one of the n later cooldown turns.", "zh-CN": "发起回合不会消耗后续 n 回合冷却中的一个回合。" },
  "rulebook.guild.misunderstanding3": { en: "Sealed means bid amounts stay private, not that submission status is hidden.", "zh-CN": "密封表示出价金额保密，并不表示提交状态也隐藏。" },
  "rulebook.guild.misunderstanding4": { en: "No eligible bidder or three consecutive zero-bid rounds completes the auction instead of trapping the game.", "zh-CN": "没有符合条件的竞拍者，或连续三轮全为零出价，都会完成拍卖，而不会让游戏卡住。" },

  "rulebook.reference.title": { en: "Quick reference", "zh-CN": "速查表" },
  "rulebook.reference.intro": { en: "Use these compact lists during play; read Base Rules when you need the reason behind them.", "zh-CN": "游玩时可使用这些简表；需要了解原因时请阅读基础规则。" },
  "rulebook.reference.turnTitle": { en: "Normal turn checklist", "zh-CN": "正常回合检查表" },
  "rulebook.reference.turn1": { en: "1. Roll the dice or first play one eligible development card.", "zh-CN": "一、掷骰子，或先使用一张符合条件的发展卡。" },
  "rulebook.reference.turn2": { en: "2. Complete every mandatory discard, robber, victim, or card-effect decision.", "zh-CN": "二、完成所有强制弃牌、强盗、掠夺对象或卡牌效果决定。" },
  "rulebook.reference.turn3": { en: "3. Take any legal build, card, trade, or Commerce Guild actions.", "zh-CN": "三、执行任意合法的建造、卡牌、交易或商业公会行动。" },
  "rulebook.reference.turn4": { en: "4. Resolve pending offers and end the turn.", "zh-CN": "四、处理待定报价并结束回合。" },
  "rulebook.reference.costsTitle": { en: "Costs", "zh-CN": "费用" },
  "rulebook.reference.terrainTitle": { en: "Terrain production", "zh-CN": "地形产出" },
  "rulebook.reference.desert": { en: "Produces nothing.", "zh-CN": "不产出资源。" },
  "rulebook.reference.portsTitle": { en: "Maritime ratios", "zh-CN": "海上贸易比例" },
  "rulebook.reference.portDefault": { en: "4:1 — default without a helpful owned port", "zh-CN": "4:1——没有合适的己方港口时" },
  "rulebook.reference.portGeneric": { en: "3:1 — owned generic port", "zh-CN": "3:1——拥有通用港口时" },
  "rulebook.reference.portResource": { en: "2:1 — owned port matching the resource you give", "zh-CN": "2:1——拥有与付出资源相匹配的资源港口时" },
  "rulebook.reference.pointsTitle": { en: "Victory points", "zh-CN": "胜利点" },
  "rulebook.reference.pointSettlement": { en: "Settlement 1; city 2", "zh-CN": "村庄 1 分；城市 2 分" },
  "rulebook.reference.pointAwards": { en: "Longest Road 2; Largest Army 2", "zh-CN": "最长道路 2 分；最大骑士团 2 分" },
  "rulebook.reference.pointCards": { en: "Hidden Victory Point card 1; Commerce Guild prize card 2", "zh-CN": "隐藏胜利点卡 1 分；商业公会奖品卡 2 分" },
  "rulebook.reference.pointTarget": { en: "Reach the target currently displayed by the game.", "zh-CN": "达到游戏当前显示的目标分数。" },
  "rulebook.reference.blockersTitle": { en: "Why an action may be unavailable", "zh-CN": "行动为何可能不可用" },
  "rulebook.reference.blockerRoll": { en: "The roll or another mandatory decision is unresolved.", "zh-CN": "掷骰或其他强制决定尚未处理。" },
  "rulebook.reference.blockerPlayer": { en: "It is the wrong player or not that player's action phase.", "zh-CN": "当前是错误玩家，或尚未进入该玩家的行动阶段。" },
  "rulebook.reference.blockerResources": { en: "There are insufficient player resources or insufficient bank stock.", "zh-CN": "玩家资源不足，或银行库存不足。" },
  "rulebook.reference.blockerTarget": { en: "The selected location is an invalid target, or no legal target exists.", "zh-CN": "所选位置是无效目标，或当前不存在合法目标。" },
  "rulebook.reference.blockerTrade": { en: "A pending player trade must be accepted or cancelled first.", "zh-CN": "必须先接受或取消待定玩家交易。" },
  "rulebook.reference.blockerGathering": { en: "A Commerce Guild gathering is active or its cooldown remains.", "zh-CN": "商业公会集会正在进行，或仍处于冷却。" },
  "rulebook.reference.blockerCards": { en: "A card was bought this turn, another non-victory card was played, or a card effect is pending.", "zh-CN": "卡牌在本回合刚购买、本回合已使用另一张非胜利点卡，或仍有卡牌效果待处理。" },
  "rulebook.reference.inputTitle": { en: "Keyboard, touch, and scrolling", "zh-CN": "键盘、触摸与滚动" },
  "rulebook.reference.inputKeyboard": { en: "With a keyboard, use Tab to reach controls, arrow keys inside chapter tabs, Enter or Space to activate, and Escape to close the rulebook.", "zh-CN": "使用键盘时，用 Tab 到达控件，在章节标签中使用方向键，按 Enter 或空格激活，按 Escape 关闭规则说明。" },
  "rulebook.reference.inputTouch": { en: "For touch, tap the full button or resource target, not only its icon. Chapter tabs may scroll sideways on a narrow screen.", "zh-CN": "使用触摸操作时，点击完整按钮或资源目标，不要只点图标。窄屏上的章节标签可以横向滚动。" },
  "rulebook.reference.inputScroll": { en: "Long panels such as this rulebook, Game Log, and Yield Statistics use an internal scroll area; keep the pointer or focus inside that area while scrolling.", "zh-CN": "规则说明、游戏日志和产出统计等长面板使用内部滚动区域；滚动时请把指针或焦点保持在该区域内。" },
  "rulebook.reference.inputMobile": { en: "On mobile, the page itself should not scroll sideways. Scroll only the bounded tab strip or the current chapter body.", "zh-CN": "在移动端，页面本身不应横向滚动；只需滚动受限的标签栏或当前章节正文。" },
  "rulebook.reference.final": { en: "End of quick reference", "zh-CN": "速查表结束" }
} as const satisfies Record<`rulebook.${string}`, RulebookMessage>;

export type RulebookMessageKey = keyof typeof rulebookMessages;
