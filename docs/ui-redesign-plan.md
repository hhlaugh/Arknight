# Arknights Tactical Terminal UI 重构分阶段实施计划 (docs/ui-redesign-plan.md)

> **基于规范文件：** `UI_REDESIGN.md`  
> **核心原则：** 数据层优先、保留既有规则、CSS+SVG原生卡框、防缺图崩溃、分阶段推进。

---

## 阶段推进概览

| 阶段 | 阶段目标 | 交付物 / 核心改造 | 状态 |
|---|---|---|---|
| **Phase 0** | 项目审计与基准建立 | `docs/ui-audit.md`、核验 0.3 节既有模块、基线测试校验 | **已完成** ✅ |
| **Phase 0.5** | 最低限度数据层准备（UI 前置门槛） | 稳定 Card ID、冻结数据契约、建立 Card Presentation 映射、缺图 fallback、数据契约测试 | **已完成** ✅ |
| **Phase 1** | Design Tokens 与基础 UI 组件 | 统一设计令牌、Button/Panel/Badge/Modal/Tooltip/BottomSheet/HealthBar/ResourceIndicator、CardFrame (CSS+SVG) | **已完成** ✅ |
| **Phase 2** | 桌面端主要页面与布局 | 罗德岛干员档案/只读图鉴（CardLibraryView）、三栏战术桌面战场（BattleView）、紧凑顶部战术 HUD（TacticalBattleHud）、右侧单位档案与指令控制台（TacticalDetailPanel）、折叠彩色战斗日志 | **已完成** ✅ |
| **Phase 3** | 移动端独立布局 | 视口感知 Hook（useViewport）、移动端 360px 自适应棋盘、响应式 BottomSheet 抽屉（日志与单位档案）、卡组编辑双标签视图 | **已完成** ✅ |
| **Phase 4** | 卡牌视觉系统与卡组编辑深入优化 | CSS+SVG Token 化 `CardFrame`（3~6★ 几何差异与不可出牌/CD/选中状态）、`OperatorPortrait` 切卡重置与剪影占位、只读 72 干员图鉴增强、卡组编辑器高阶筛选/排序/费用与职业统计分析 | **已完成** ✅ |
| **Phase 5** | 交互与部署体验提升 | 桌面悬停安全预览浮层、拖拽与点选协同部署、攻击航道与目标锁定预演（100% 对齐 `combat.ts`）、Pointer Events 防误触长按（450ms / 10px 阈值）、`Esc` 与空白取消、快捷撤离/技能条及全引擎驱动的禁用原因提示 | **已完成** ✅ |
| **Phase 6** | 战斗轻量动画与视觉反馈 | 纯表现层事件适配器 (`combatPresentation.ts`)、队列控制器 (`useCombatAnimations.ts`)、Compositor-Only CSS 关键帧动画、伤害/护盾/治疗/SP 浮动跳字、近战突进与远程弹道光束、阵亡/撤离残影、HUD 基地掉血反馈与 1x/2x/关闭及跳过控制 | **已完成** ✅ |
| **Phase 7** | 全面回归验收与交付 | 废弃 `PlayerBar`/旧 CSS 清理、联机大厅 `RoomLobbyView` 战术终端化改造、全视口细节防溢出优化、Phase 7 全流程回归测试 (`phase7-regression.test.tsx`)、文档校准与验收报告 | **已完成** ✅ |
| **Phase 8** | 抽卡系统与玩家库存 (后续独立项目) | 招募模拟器、抽卡保底、玩家收集率与解锁限制（本轮明确不执行） | 规划延后 |

---

## Phase 0.5 详细实施清单

1. **Card ID 盘点与稳定性确认**：
   - 盘点当前正式卡池 **72 张** 干员（`OP-VAN-001` ~ `OP-SPE-009`，8 大职业全覆盖；旧 `DEMO-*` 测试卡牌已按用户要求清退）。
   - 经校验，全部卡牌 ID 唯一，无任何重复主键，且被 `PRESET_DECKS` 和对战系统正确引用。
2. **数据契约冻结**：
   - 明确规则层（`CardDefinition`）与展示层（`CardPresentation`）职责边界，规则层只保留数值和效果逻辑，展示层管理立绘与视觉元数据。
3. **Card Presentation Manifest 建立**：
   - 创建 `src/data/card-presentation.ts`，为全部 72 张卡牌建立标准元数据映射（`cardId` -> `operatorId` -> `assets` + `display` + `source`）。
4. **缺图与素材回退机制（Fallback）**：
   - 创建 `src/components/cards/OperatorPortrait.tsx`，具备自动容错与科技剪影占位符，图片 404 或未加载时保持终端风格正常渲染。
5. **素材校验与测试**：
   - 创建 `src/data/validate-card-assets.ts`，提供资产自检功能。
   - 创建数据契约测试 `src/data/data-contract.test.ts`，确保无脏数据、无 ID 漂移。
