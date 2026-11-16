# 舟塔自走牌 (Arknights Tactical Auto-Chess Card Game)

基于 React 19 + TypeScript + Tailwind CSS v4 构建的明日方舟题材三路战术卡牌对战游戏，完整支持 72 位干员卡牌、专属主/被动技能、阻挡线争夺、再部署冷却、干员寻访与本地账号存档，以及单人人机、本地热座与 WebRTC P2P 好友联机对战。

## 核心特性

- **72 位罗德岛干员全卡池**：涵盖 8 大职业、3★~6★ 稀有度与 144 张本地 `.webp` 立绘/头像资源，加载失败时自动回退至终端剪影占位组件 (`OperatorPortrait`)。
- **确定性三路规则引擎 (`src/game/`)**：支持近/远程索敌、阻挡拦截、前后排站位限制、浮空特性、主动技能 (SP)、受击反应、撤离退费与再部署冷却，完全确定性且可凭随机种子复现。
- **干员寻访与双模式卡组构筑**：支持本机多账号切换、JSON 导出/导入跨设备备份、单抽/十连与 6★ 递增保底寻访 (`RecruitmentView`)，以及「收录模式 / 自由构筑」双模式 20 张卡组编辑器 (`DeckEditorView`)。
- **桌面端 & 移动端全适配**：桌面三栏战术终端战场与安全边界悬停预览；移动端 360px 触控棋盘、`BottomSheet` 抽屉日志/档案与防误触长按 (`450ms / 10px`)。
- **三种对战模式**：本地规则 AI 对战 (`BotPlayer`)、本地双人同屏热座、基于 WebRTC DataChannel 的免服 P2P 好友联机对战 (`RoomLobbyView`)。

## 目录结构

```text
.
├── assets/
│   └── arknights/            # 144 张本地干员立绘与头像 (.webp) 及构建静态产物
├── docs/
│   ├── specs/
│   │   ├── v0.7/             # v0.7 卡池、AI 与规则设计文档
│   │   └── v0.8/             # v0.8 竞技规则与多人联机规范
│   └── ui/                   # UI 设计系统、重构计划与验收清单
├── src/
│   ├── ai/                   # BotPlayer 规则驱动 AI 与模拟测试
│   ├── client/               # LocalGameController、WebRTC P2P 联机控制器与 gameData
│   ├── components/
│   │   ├── battle/           # UnitView、LogView、TacticalBattleHud、TacticalDetailPanel 等战场组件
│   │   ├── cards/            # CardFrame、CardView、OperatorPortrait 等卡框与立绘组件
│   │   └── ui/               # Button、Panel、Badge、Modal、BottomSheet、HealthBar 等终端基础组件
│   ├── data/                 # 72 卡池、预设牌组 CSV、寻访配置、立绘 Manifest 与玩家账号存档
│   ├── game/                 # 纯函数核心规则引擎、动作枚举、战斗结算与随机数模块
│   ├── hooks/                # useViewport、useLongPress、useCombatAnimations
│   ├── styles/               # terminal.css (Design Tokens、卡框主题与轻量 CSS 动效)
│   └── views/                # StartView、RecruitmentView、CardLibraryView、DeckEditorView、BattleView 等页面
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 常用命令

```bash
# 安装依赖
npm install

# 启动本地开发服务器 (默认端口 3000)
npm run dev

# 类型检查
npm run lint

# 运行全套 Vitest 单元测试与 UI 回归测试
npx vitest run

# 构建生产包 (同时同步 dist/ 与根目录 ./assets/ 以兼容 GitHub Pages 静态部署)
npm run build
```
