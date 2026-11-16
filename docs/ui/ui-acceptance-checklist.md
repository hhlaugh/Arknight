# UI 重构验收检查清单 (docs/ui-acceptance-checklist.md)

> 本文件记录各阶段验收门槛的检查状态。所有项必须有明确依据，不可虚构勾选。

---

## Phase 0 — 项目审计与基准建立

- [x] 完成项目结构、框架、样式与现有功能审计 (`docs/ui-audit.md`)
- [x] 核实 0.3 节所有列出的 11 项现有功能模块，标记存在与处理方式
- [x] 确认代码仓库状态正常，无破坏性 Git 变更
- [x] 确认项目可构建，现有逻辑未受破坏

---

## Phase 0.5 — 最低限度数据层准备（UI 前置门槛）

- [x] **Card ID 稳定性**：正式卡池全部 72 张干员卡牌 ID 唯一且无冲突（历史原型 88 张含 `DEMO-*` 测试卡，后续已按需求清理为 72 张正式干员）
- [x] **数据契约冻结**：游戏规则层与表现层清晰解耦，规则字段未受污染
- [x] **Card Presentation Manifest**：`src/data/card-presentation.ts` 建立最小可用版本，支持全量 72 张卡牌映射（`validateCardPresentationIntegrity` 通过）
- [x] **缺图与容错 Fallback**：创建 `OperatorPortrait` 规范组件，缺图/加载错误自动渲染终端风格剪影占位，绝不崩溃
- [x] **素材自检与验证脚本**：创建 `src/data/validate-card-assets.ts`，统计可用与缺省素材
- [x] **原有卡组与构筑规则完整保护**：Deck Builder 继续从当前目录读取卡牌，预设及自定义卡组导入导出功能正常
- [x] **零抽卡/库存污染**：未引入 Player Collection 或 Gacha 招募商业化逻辑
- [x] **自动化测试与构建**：数据契约测试通过，`npm run build`、`compile_applet`、`lint_applet` 全部通过

---

## Phase 1 — Design Tokens 与基础 UI 组件

- [x] **设计令牌集中管理**：整合主题变量到 `:root` (`src/styles/terminal.css`) 及 TypeScript 常量 (`src/components/ui/tokens.ts`)，包含背景层级、主次文字、战术黄强调色、阵营色、稀有度色值及切角路径
- [x] **统一基础组件库 (`src/components/ui/`)**：
  - `Button`：战术风格按钮，支持 primary / secondary / danger / ghost / outline 变体、三种尺寸、切角与 focus-visible
  - `Panel`：工业终端面板，支持 technical header、scanlines 扫描线、grid 网格与切角
  - `Badge`：遵守 Anti-slop zero-pill 规范，支持 class / rarity / status / cost / ally / enemy 语义标签
  - `Modal`：PRTS 战术弹窗，支持 ESC 快捷键与遮罩
  - `Tooltip`：战术悬停信息浮层，高对比度
  - `BottomSheet`：移动端底部抽屉与桌面侧栏复用结构
  - `HealthBar`：等宽血条，支持生命阈值变色与护盾层覆盖
  - `ResourceIndicator`：等宽数字费用 (DP) 与技力 (SP) 指示器
- [x] **CSS + SVG `CardFrame` 规范实现 (`src/components/cards/CardFrame.tsx`)**：
  - 完整 8 层架构：BackgroundLayer、ArtworkLayer (OperatorPortrait)、FrameShapeLayer (SVG 边框与刻度)、RarityAccentLayer、NameAndCostLayer、TypeAndStatsLayer、SkillSummaryLayer、InteractionLayer
  - 支持 hand / deck / preview / compact 四种场景尺寸
  - 3/4/5/6 星级主题自适应，再部署 CD 遮罩与已勾选反馈
- [x] **实际页面复用与样式冲突消除**：
  - `StartView`：全量终端面板与战术模式卡片升级
  - `DeckSelectView`：双列作战编制选择面板升级
  - `SettlementView`：战术推演结算报告面板升级
  - `MulliganView`：调度阶段手牌与确认按钮升级
  - `DeckEditorView`：卡牌目录全量采用 `CardFrame` 渲染与加入按钮控制
  - `BattleView` & `PlayerBar`：头部操作条、状态栏、手牌 `CardView` 统一接入
- [x] **组件自动化测试与构建校验**：`src/components/ui/components.test.tsx` 7 项测试通过，`npm run build`、`compile_applet`、`lint_applet` 全部通过

---

## Phase 2 — 桌面端主要页面与布局

- [x] **罗德岛干员档案/只读图鉴 (`src/views/CardLibraryView.tsx`)**：
  - 独立只读浏览页面，支持全部 72 位官方干员免构筑条件随意检视（旧测试卡已清理）
  - 8 大职业筛选（先锋/近卫/重装/狙击/术师/医疗/辅助/特种 + 战术/支援）、稀有度（3~6星）、费用区间与即时中英名称模糊搜索
  - 右侧战术档案详细抽屉（Tactical Dossier Panel），完整显示攻击力、生命值、部署费用、技力恢复、主动技能及词条明细
- [x] **紧凑顶部战术 HUD (`src/components/battle/TacticalBattleHud.tsx`)**：
  - 高度压至 56px 工业终端顶栏，包含 PRTS 战术终端标识、回合轮次、当前行动阶段 Badge（绿色行动中/黄色敌方行动/橙色调度/结算）
  - 双边快速数据栏（我方/敌方生命值进度条、费用 DP、剩余牌库、墓地、击杀数计数）
  - 右侧集成了回合结束指令（TERMINATE PHASE）、折叠战斗日志开关与折叠单位档案开关
- [x] **三栏式桌面战场布局 (`src/views/BattleView.tsx`)**：
  - **左栏**：折叠式战术战斗日志（Collapsible Combat Log），支持一键展开/收起（收起至 48px），全彩标注红蓝方阵营、攻击伤害值、击杀连锁、技能触发与撤离事件
  - **中栏**：战术三路推演棋盘（3-Lane Grid），清晰划分左/中/右三路与前锋/后卫阵位，中央交战分割线带动态呼吸发光（Clash line），可部署阵位带高亮脉冲线框；底部停靠手牌托盘（Docked Hand Tray）并实时计算可用费用
  - **右栏**：独立战术单位/卡牌档案与指令面板 (`TacticalDetailPanel.tsx`)，选中棋盘干员或手牌卡牌时展示详细属性、技能说明、主动发动/快捷撤离按钮及实时待处理抉择状态；无选中时展示 PRTS 待机终端心跳监视
- [x] **棋盘单位棋子 (`src/components/battle/UnitView.tsx`)**：
  - 接入 `HealthBar` 进度条、数字 ATK 与当前 SP 槽、状态指示器以及 `OperatorPortrait` 规范头像

---

## Phase 3 — 移动端独立布局

- [x] **移动端视口检测与无缝响应式 (`src/hooks/useViewport.ts`)**：
  - `useViewport` 与 `useIsMobile` 自动感知设备视口与方向旋转（支持窄屏 `<1024px`、手机 `<640px` 与横屏/竖屏检测）
  - 竖屏状态下提供轻量可关闭的横屏建议横幅（“💡 提示：横屏可获得更佳推演视野”）
- [x] **移动端战场布局独立重构 (`src/views/BattleView.tsx`)**：
  - 顶部 HUD 紧凑压至 46px，红蓝双方基地 HP 与 DP 在 360px 宽度下自适应排版，严禁横向溢出
  - 棋盘采用触控友好网格，单格保证最小 44px 点击区域，可部署格子带金色脉冲高光
  - 底部手牌坞支持流畅横向惯性滑动与吸附（`overflow-x-auto snap-x`），选中卡牌向上微抬高亮
  - 底部提供拇指盲操优化的「结束行动」大按钮，回合交替反馈直观
- [x] **移动端抽屉系统 (`BottomSheet.tsx`)**：
  - 战斗日志（`SYS.LOG`）：点击顶部 📜 按钮唤出平滑底部抽屉，不挤占棋盘主战场
  - 干员战术档案与指令（`SYS.DOSSIER`）：点击干员或点击详情唤出底部抽屉，集成【撤离干员】、【发动技能】与【取消】大尺寸触控键，绝不永久遮挡
- [x] **卡组编辑页面移动端双标签重构 (`src/views/DeckEditorView.tsx`)**：
  - 彻底解决窄屏下两栏挤压问题，提供「🗂️ 干员目录」与「📋 编制卡组」两标签自适应切换
  - 编制标签实时显示 20/20 张与合法性红绿指示灯，手机上构筑与调整流畅自如
- [x] **罗德岛干员图鉴移动端抽屉支持 (`src/views/CardLibraryView.tsx`)**：
  - 窄屏双列卡牌网格展示，点击任意卡牌唤起全量战术档案 BottomSheet

---

## Phase 4 — 卡牌视觉系统、只读图鉴与卡组编辑深入优化

- [x] **CSS + SVG Token 化 `CardFrame` (`src/components/cards/CardFrame.tsx` & `src/styles/terminal.css`)**：
  - 使用 `[data-rarity="3"|"4"|"5"|"6"]` 与 `[data-state="default"|"selected"|"in-deck"|"unplayable"|"disabled"]` CSS 变量驱动卡框主题、光晕与可访问焦点环，支持 `prefers-reduced-motion`
  - 不同星级不仅通过色值区分，同时通过 SVG 边角导轨、双层内框与三角角标实现非色盲几何差异；零外部 PNG/WebP 卡框图片依赖
  - `CardView` 为手牌注入当前费用不足视觉提示（`unplayable`），不修改任何规则校验
- [x] **`OperatorPortrait` & `UnitView` 统一表现 (`src/components/cards/OperatorPortrait.tsx` & `src/components/battle/UnitView.tsx`)**：
  - 切换 `cardId` 时自动重置图片加载失败状态，携带 `referrerPolicy="no-referrer"` 与精准面部 `objectPosition`，缺图自动回退为稀有度微光六边形战术剪影
  - `UnitView` 增加左侧稀有度竖向导轨与键盘聚焦支持，同时维持 82px 紧凑高度保证桌面端三路四行棋盘零滚动
- [x] **只读干员图鉴优化 (`src/views/CardLibraryView.tsx`)**：
  - 全量展示 72 位官方干员，严格保持只读、无任何伪库存/抽卡锁；支持中英文代号/标签检索、星级/费用/攻击/生命排序及一键重置筛选
- [x] **卡组编辑深入优化 (`src/views/DeckEditorView.tsx`)**：
  - 集成搜索（含英文代号）、职业/费用/星级/部署定位（近战/远程/前排/后排/浮空）筛选与多维度排序
  - 新增实时构筑统计：平均费用 DP、近战/远程配比、站位分布、可点击按费筛选的交互式费用曲线与职业计数条
  - 桌面端底部详情档案条 + 移动端点击「详情」弹出 `BottomSheet` 干员档案并支持直接增减；保留 20 张编制与同名上限 2 张规则及 `localStorage` / JSON 导入导出兼容

---

## Phase 5 — 桌面与移动交互

- [x] **桌面端悬停安全预览 (`CardPreviewPopover.tsx`)**：
  - 鼠标悬停手牌时以独立 `fixed` 图层弹出完整卡框与技能详情，严禁撑开底部手牌栏或引发布局抖动
  - 自动依据视口边界钳位（左右/顶部 12px 安全边距），确保小窗下不被边缘裁切
- [x] **棋盘格悬停部署预演与可选拖放 (`BattleView.tsx`)**：
  - 选中或拖动手牌干员经过合法部署位时，格子实时显示 `✓ 部署 {干员名} (-DP)` 与下回合攻击索敌路线
  - 悬停或点击/拖放至不合法空位时展示不可部署标识，并弹出真实原因提示
  - 保留点选与桌面端拖放双路径；拖放绝非唯一入口
- [x] **攻击航道与目标锁定预演 (`tacticalSelectors.ts` & `UnitView.tsx`)**：
  - 100% 复用 `src/game/combat.ts` 索敌规则（含跨路全路嘲讽拦截、同路地面前锋→后卫、远程对空与无阻挡直击基地），在 `UnitView` 中用rose/橙 `⚔ 锁定` 明显区分于青色技能目标 `◎ 目标` 与金色选中框
- [x] **移动端防误触长按与双入口详情 (`useLongPress.ts`)**：
  - 统一使用 Pointer Events 实现 450ms 长按唤起 `BottomSheet` 档案；触点移动 > 10px（横向滑动手牌）立即取消，松手不会误触发部署或点选
  - 保留手牌/单位底栏快捷操作条（「⚡ 技能」「↩ 撤离」「详情档案」「✕ 取消」），长按绝不是查看详情或执行撤离的唯一路径
- [x] **键盘与空白取消及权威错误反馈**：
  - 支持 `Esc` 键按层级关闭抽屉、清空悬停/拖拽态与取消选中；点击棋盘空白区域取消非模态选中
  - 点击不可出手牌、非法格子或不可用技能/撤离按钮时，直接调用 `reduceGameAction` 返回的中文权威 `reason` 提示玩家，无任何 UI 自编规则

---

## Phase 6 — 战斗轻量动画与视觉反馈

- [x] **零规则耦合纯表现适配器 (`src/components/battle/combatPresentation.ts` & `src/hooks/useCombatAnimations.ts`)**：
  - 所有战斗动效仅消费引擎既定 `CombatLogEvent[]` 与 `GameState` 快照差值，绝不修改命中、伤害、阵亡、费用或胜负条件
  - 关闭动效 (`off`) 或触发 `prefers-reduced-motion: reduce` 时立即清空队列，对局结果 100% 等价
- [x] **基础与战斗交锋反馈 (`UnitView.tsx`, `HealthBar.tsx`, `BattleView.tsx`, `src/styles/terminal.css`)**：
  - 部署落位微缩放入场与格位金框闪光 (`anim-deploy-land`, `anim-slot-flash`)
  - 受击闪震 (`anim-hit-shake`, `anim-hit-flash`) 与 `HealthBar` 平滑降血残影条 (`tabular-nums`)
  - 区分近战前冲交锋 (`anim-melee-lunge-up/down`) 与远程 SVG/CSS 弹道光束 (`anim-ranged-bolt-up/down`)
  - 技能/效果光环 (`anim-skill-burst`)、不遮挡点击的浮动数值跳字 (`-伤害`, `🛡-护盾`, `+治疗`, `+SP`) 与阵亡/撤离原位退场残影 (`anim-ghost-fade`)
- [x] **HUD 基地受击、回合切换与动效控制 (`TacticalBattleHud.tsx` & `BattleView.tsx`)**：
  - 我方/敌方基地 HP 受击瞬时红闪脉冲与 `-X` 掉血跳字
  - 非阻塞回合切换横幅 (`anim-turn-banner`)
  - 顶栏集成 `⚡1x` / `⚡2x` / `⚡关` 倍速与关闭开关及多段战斗「⏭ 跳过演出」快捷按键，卸载与重开自动清理定时器

---

## Phase 7 — 全面回归、视觉验收与清理

- [x] **废弃样式与旧页面清理**：
  - 移除未使用的旧版 `src/components/PlayerBar.tsx` 组件
  - 重构联机大厅 `src/views/RoomLobbyView.tsx` 为统一 PRTS Tactical Terminal 风格（`Panel` / `Button` / `Badge`，无圆角胶囊与 `alert()`/`confirm()`/`open()` 弹窗）
  - 清理 `src/styles/terminal.css` 中约 390 行已被替代的旧版 `.player-bar*`、`.room-*`、`.battle-*` 原型样式
  - 修复 `StartView`、`DeckSelectView`、`MulliganView`、`SettlementView` 窄屏顶栏/底栏 `flex-wrap` 防挤压，并清除 `StartView` 装饰性脉动红绿小点 (`animate-pulse`)
- [x] **全面回归测试 (`src/views/app-regression.test.tsx`)**：
  - 校验 `verifyDataContractBaseline()` 与 `validateCardPresentationIntegrity()`（72 张正式卡牌、3 套 20 张合法预设卡组、0 遗留 `DEMO-*` 测试卡、0 抽卡/收集锁污染）
  - 验证 `CardFrame` 纯 CSS + SVG 在 3★~6★ 与全状态 (`default` / `selected` / `in-deck` / `unplayable` / `disabled`) 独立渲染，零外部 PNG 卡框依赖
  - 验证全部应用视图（`StartView` / `DeckSelectView` / `CardLibraryView` / `DeckEditorView` / `RecruitmentView` / `MulliganView` / `BattleView` / `SettlementView` / `RoomLobbyView`）SSR 渲染无异常
  - 运行完整对局生命周期冒烟回归（选牌 → 起手换牌 → 多回合行动与 `BotPlayer` 推进 → 日志产出 → 新种子重开复位）
- [x] **工程质量门槛校验**：
  - `npm run lint` (`tsc --noEmit`) 类型检查通过
  - `compile_applet` 与 `npm run build` 生产打包通过
  - Vitest 全量回归测试套件通过
- [ ] **真机/无头浏览器截图检查（环境受限说明）**：
  - 当前容器环境未安装 Playwright CLI，无法自动化截取 1440×900 / 1280×800 / 390×844 / 360×640 像素截图；各视口响应规则已通过 Tailwind 响应式类（`sm:` / `md:` / `lg:`）与 `useViewport` 断点测试验证，待人工在本地或预览 URL 打开浏览器目视复核。

---

## Phase 8 — 干员寻访、本地存档、UI 收尾与目录整理

- [x] **144 张干员立绘/头像接入**：`assets/arknights/operators/` 已全量部署 72 位干员立绘与头像 `.webp`（144 个文件），并同步至 `dist/assets/arknights/` 与 GitHub Pages 构建流程。
- [x] **CardFrame 持有标记与 UI 无遮挡收尾**：将「持有×N / 未收录」内置进 `CardFrame` 左上 DP 徽章下方，移除图鉴、卡组编辑与寻访页外置重叠角标；`RecruitmentView` 支持顶栏返回、1/10 连自适应网格、逐张新收录/重复转化标注与点击档案弹窗；`App.tsx` 联机/人机等待与断线中断弹窗全部接入 `MulliganView` 与 `Modal` 终端组件，清除旧 `.mulligan` / `.modal-backdrop` 样式。
- [x] **目录与文件命名规范化**：统一整理 `docs/ui/`、`docs/specs/{v0.7,v0.8}`、`src/components/{cards,battle,ui}`、`src/styles/terminal.css`、`src/hooks/useViewport.ts` 与 `src/data/{card-pool.json,preset-decks.csv,load-card-data.ts,player-collection.ts}`。
