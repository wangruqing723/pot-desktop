# DESIGN — 手动翻译（manualTranslate）

需求 slug：`manual-translate` ｜ 目标分支：`feat/manual-translate` ｜ 术语以仓库根 `CONTEXT.md` 为准。

## 1. 目标

给**单个翻译服务实例**加一个实例级开关「手动翻译」，默认关闭。开启后：该实例在翻译窗口里的卡片在源文本提交时**不自动翻译**，必须由用户点击卡片标题栏才发起翻译。未开启的实例、以及所有其它功能，行为一字不变。

典型用途：把某个服务（付费/不稳定/自建接口）留作兜底，平时不消耗额度，等其它服务失败时手动点它。

## 2. 已定决策（不得在实现阶段翻案）

| # | 决策 |
|---|---|
| D1 | 粒度＝**实例级** opt-in，默认关闭；开启只影响该实例 |
| D2 | 配置入口＝服务设置列表行，`enable` 开关旁再加一个 Switch |
| D3 | 触发方式＝**点击折叠卡片的标题栏本身**，不新增按钮 |
| D4 | **每次源文本提交**都回到未翻译状态，需重新点击 |
| D5 | 概念名「手动翻译」，配置键 `manualTranslate`（布尔） |
| D6 | **纯手动**：不做"其它服务全失败后自动兜底"，理由见 `docs/adr/0001-manual-translate-stays-pure-manual.md` |
| D7 | 手动卡片**翻译失败时自动展开**（让错误与重试按钮可见）；自动卡片的"失败不展开"是上游既有行为，本次不动 |
| D8 | 已出结果 / 已失败 / 翻译中，再点标题栏＝**无操作** |
| D9 | 未翻译状态在标题栏显示淡色提示「点击翻译」＋鼠标手型 |
| D10 | 卡片内切换实例时，以**当前所选实例**的 `manualTranslate` 为准 |
| D11 | 两个 Switch 各加 Tooltip；`enable` 关闭时手动开关**不联动**置灰 |
| D12 | i18n 只加 `zh_CN` + `en_US`，其余 19 个语言按 `fallbackLng` 回落英文 |
| D13 | rbd 冲突时的回退：自行用 pointerdown/pointerup + 位移阈值判定点击；仍别扭才退化为标题栏加显式「翻译」按钮 |
| D14 | 新的源文本提交时，手动卡片**收起**（回到折叠 +「点击翻译」） |

## 3. 现状（读代码确认，实现时依赖这些事实）

- 自动翻译的唯一触发点：`src/window/Translate/components/TargetArea/index.jsx:96` 的 effect，依赖已提交的 `sourceText` 等。
- 源文本提交时机（`SourceArea`）：划词/OCR/剪贴板送入新文本、源文本框回车、源文本框翻译按钮、去换行按钮、`dynamic_translate` 的 1 秒防抖。逐字输入不提交。
- `CardHeader` 同时是 react-beautiful-dnd 的拖拽把手（`{...drag}`），内部嵌切换实例的 Dropdown 按钮与折叠按钮。
- 失败时卡片不展开：`setHide(false)` 只在拿到非空结果时调用，reject 分支（`:233-238`、`:306-311`）没有展开动作 → 错误文本与重试按钮都在折叠的 body 里不可见。这是 D7 的由来。
- 每张卡片的 `error`/`result`/`isLoading` 都是组件本地 state，卡片之间互不可见（这是 D6 拒绝自动兜底的成本来源）。
- 实例配置在翻译窗口打开时一次性加载进 `serviceInstanceConfigMap`（`src/window/Translate/index.jsx:199`）→ **改配置需重开翻译窗口才生效**，与 `enable` 同样的既有行为，本次不额外处理。
- i18n `fallbackLng.default = ['en']`；`config.service` 下无 `enable` 键、`translate` 下无 `click_to_translate` 键，无冲突。

## 4. 数据模型

实例配置对象（store 中以服务实例键为 key）新增一个字段：

```
manualTranslate: boolean   // 缺省视为 false
```

读取处一律 `... ?? false`，不写任何迁移逻辑：旧配置没有该字段即等于关闭，天然向后兼容。

## 5. 行为矩阵（仅 `manualTranslate === true` 的实例）

| 场景 | 期望行为 |
|---|---|
| 翻译窗口打开 / 每次源文本提交 | 清空上次结果与错误、卡片收起、标题栏出现「点击翻译」，**不发请求** |
| 点标题栏（未翻译） | 发起翻译 → 转圈 → 成功：展开显示结果；失败：**展开**显示错误 + 重试按钮 |
| 点标题栏（翻译中 / 已出结果 / 已失败） | 无操作 |
| 点切换实例下拉、点折叠按钮 | 各自原功能，不触发翻译 |
| 拖标题栏排序 | 照旧，不触发翻译 |
| 卡片切到自动实例 | 立即翻译（现有行为） |
| 自动实例切到手动实例 | 停在未翻译状态等点击 |
| 重试、回译按钮 | 行为不变（本就是显式动作） |
| 历史记录、`translate_auto_copy='target'` | 在翻译真正发生后照常执行；因此手动实例排第一位时，自动复制译文会延后到点击之后（已知且接受） |
| `translate_auto_copy='source'` | 不变，仍在源文本提交时复制源文本（与是否翻译无关） |

## 6. 改动范围

| 文件 | 改动要点 |
|---|---|
| `src/window/Config/pages/Service/Translate/ServiceItem/index.jsx` | 第二个 Switch 读写 `manualTranslate`；两个 Switch 各套 Tooltip；不联动 |
| `src/window/Translate/components/TargetArea/index.jsx` | 取当前实例 flag；新增"未翻译"本地状态；effect 分流（手动则只置未翻译态并收起，不调 translate）；标题栏 onClick 触发；Dropdown/折叠按钮 stopPropagation；未翻译提示 Chip；两个 reject 分支在手动时展开 |
| `src/i18n/locales/zh_CN.json` | `config.service.enable`＝启用；`config.service.manual_translate`＝手动翻译；`translate.click_to_translate`＝点击翻译 |
| `src/i18n/locales/en_US.json` | 同上：Enable / Manual Translate / Click to translate |

**不动**：识别/语音合成/生词本三类服务的 ServiceItem；`SourceArea`；`src/window/Translate/index.jsx` 的实例过滤与配置加载；任何 Rust 侧代码；其余 19 个语言文件。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 标题栏既是 rbd 拖拽把手又要吃点击，点击可能被吞或拖拽误触发翻译 | 先静态核对 `react-beautiful-dnd@13.1.1` 的 `dragHandleProps` 是否含 `onClick`、拖拽后是否有 click 阻断；确认无冲突再按 D3 实现，有冲突按 D13 回退 |
| NextUI `Tooltip` 包裹 `Switch` 可能有 ref/单子元素约束 | 如报错则包一层 `<span>` 承载 tooltip trigger，不改 Switch 语义 |
| 点 Dropdown / 折叠按钮时事件冒泡到标题栏误触发翻译 | 这两处显式 `stopPropagation`，并在验收中逐项手测 |
| 配置改完不重开翻译窗口不生效，可能被误判为 Bug | 既有行为，写入验收说明，不在本次修 |

## 8. 验收标准

1. `pnpm install && pnpm build` 通过，无新增告警/报错。
2. 按仓库 `.prettierrc.json` 格式化，`npx prettier --check` 对改动文件无差异。
3. 服务设置 →「翻译」：每行两个开关，Tooltip 文案正确；改「手动翻译」后重开翻译窗口，配置持久化生效；关闭 `enable` 不影响手动开关可改。
4. 行为矩阵第 5 节逐行手测通过（需 Tauri 运行时，本机无 Rust 工具链，由用户在自有环境 `pnpm tauri dev` 实测）。
5. 默认路径回归：所有实例都不开手动翻译时，翻译窗口行为与改动前完全一致。
