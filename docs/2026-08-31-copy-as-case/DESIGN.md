# DESIGN — 复制译文为指定命名格式（copy-as-case）

需求 slug：`copy-as-case` ｜ 目标分支：`feat/manual-translate`（沿用当前分支）｜ 术语以仓库根 `CONTEXT.md` 为准。

## 1. 目标

在**翻译卡片**的复制按钮旁增加一个「复制为…」菜单，可把译文按指定的标识符命名格式（小驼峰 / 大驼峰 / 蛇形 / 常量 / 短横线）写入剪贴板；并为每种格式提供**翻译窗口内**的快捷键。原有的一键复制（原样）行为一字不变。

典型用途：把译好的词组直接当变量名、常量名、文件名用，省掉"复制 → 切到编辑器 → 手改大小写"这一步。

## 2. 已定决策（不得在实现阶段翻案）

| # | 决策 | 来源 |
|---|---|---|
| D1 | 格式选择是**即时动作**：只做菜单 + 快捷键，配置页**不加**任何设置项，不存"默认格式" | Q1 |
| D2 | 作用范围**只有译文卡片**（`TargetArea`）。原文区 `SourceArea`、文字识别窗口 `Recognize` 均不动 | Q2 |
| D3 | 格式集合共 **6 项**：原样、camelCase、PascalCase、snake_case、CONSTANT_CASE、kebab-case。不做 dot.notation / Title Case / 空格分隔 | Q3 |
| D4 | 现有复制按钮**保持原样**（点击＝原样复制）；紧邻新增一个下拉箭头图标按钮承载格式菜单 | Q4 |
| D5 | 菜单项把**转换后的文本**作为副标题预览出来；实际复制时**静默**，不弹 toast | Q5 |
| D6 | 快捷键是**窗口内按键**（翻译窗口 DOM keydown），不注册全局热键、不进配置页热键页、**不动 Rust 侧** | Q6 |
| D7 | 快捷键作用于**第一个已启用实例**的卡片；不沿用 `translate_auto_copy` 的 `index === 0` 写法 | Q7 |
| D8 | 转换语义见第 5 节，五条逐一钉死 | Q8 |
| D9 | 只写剪贴板，**不改**卡片里显示的译文 | Q9 |
| D10 | `translate_auto_copy='target'` 的自动复制仍是**原样**，本次不加格式 | Q10 |
| D11 | 新写 `src/utils/case_convert.js`；**不重构** `SourceArea` 里已有的 `transformVarName`，理由见 `docs/adr/0002-two-case-converters-coexist.md` | Q11 |
| D12 | 快捷键键位＝`Alt+Shift+1..6`，按菜单顺序对应六种格式 | 见 4.3 |
| D13 | i18n 只加 `zh_CN` + `en_US`，其余 19 个语言按 `fallbackLng` 回落英文（沿用 manual-translate 的做法） | — |

## 3. 现状（读代码确认，实现时依赖这些事实）

- 译文复制按钮：`src/window/Translate/components/TargetArea/index.jsx:691-703`。单个图标按钮，`writeText(result)`，`typeof result !== 'string' || result === ''` 时 `isDisabled`，**无任何反馈**。
- footer 是一个 `ButtonGroup`：朗读、复制、回译、重试（error 时才显示）、以及 N 个生词本按钮。翻译窗口默认宽 **350px**（`src-tauri/src/window.rs:141-147`）。
- 译文 `result` 可能**不是字符串**：词典型服务返回含 `pronunciations` / `explanations` / `associations` / `sentence` 的对象，此时复制按钮已被禁用。
- `result` 是回译、朗读、生词本、历史记录共用的原始译文（`:705-825`、`:371-398`、`:843-912`、`:142-163`）→ D9 的由来。
- 仓库已有一个变量名格式实现：`src/window/Translate/components/SourceArea/index.jsx:277-363` 的 `transformVarName`（来自上游 PR #936，commit `9946487`），绑在**源文本框**的 `Alt+Shift+U`（纯 DOM `addEventListener`，`:347-363`），作用于**选中文本**，语义是**循环切换到下一个格式**并**改写源文本本身**。与本需求"转成指定格式、只写剪贴板"不是同一个东西。
- 窗口内按键的先例只有上面这个 `Alt+Shift+U`；全局热键仅 4 个（划词/输入/识别/截图），走 `src-tauri/src/hotkey.rs` + 配置页热键页。
- **既有 quirk（本次不修）**：`translate_auto_copy` 只在 `index === 0` 的卡片生效，而 `index` 取自**完整**实例列表（`src/window/Translate/index.jsx:303`），首个实例被禁用时自动复制不落到任何卡片。D7 只保证**新增的快捷键**不重复这个错，不去动 auto_copy 自身。
- 实例配置在翻译窗口打开时一次性载入 `serviceInstanceConfigMap`（`src/window/Translate/index.jsx:199-214`）；`enable` 缺省为 `true`（`:305`）。
- i18n 顶层被 `translation` 包裹；`fallbackLng.default = ['en']`；`translate` 下无 `copy_as` / `case_format` 键，无冲突。

## 4. 设计

### 4.1 新增 util：`src/utils/case_convert.js`

纯函数模块，无 React 依赖，不引入新的 npm 包。

```
CaseFormat            六个常量：original / camel / pascal / snake / constant / kebab
caseFormatList        菜单与快捷键共用的顺序数组（即上面的顺序）
splitWords(text)      分词，返回 string[]
convertCase(text, format)  转换，返回 string
```

`splitWords` 规则（对应 D8）：

1. 所有非字母数字字符（`[^\p{L}\p{N}]+`，unicode-aware）一律当分隔符并**丢弃**——`user's name` → `user` / `name`。
2. 在 `小写→大写` 边界切分；连续大写后接小写时在最后一个大写前切分（`HTTPServer` → `HTTP` / `Server`）。
3. **不在** `字母→数字` 边界切分，数字附着到前一个词（`http2 server` → `http2` / `server`）。

`convertCase` 规则：

- `original`：原样返回，不做任何处理。
- 其余五种：先 `splitWords`，再按格式拼接。`camel` 首词全小写、其余词首字母大写；`pascal` 全部词首字母大写；`snake` / `constant` / `kebab` 分别用 `_` / `_` / `-` 连接并统一小写 / 大写 / 小写。
- 词首字母大写＝首字符大写 + 其余小写，因此 `HTTPServer` 经 `pascal` 得 `HttpServer`（已知且接受）。

**no-op 兜底**（对应 D8.4）：分词结果为空，或分词结果里**不含任何 ASCII 字母**时，直接返回原文。这样纯中文 / 日文译文经任何格式都等于原样复制。这是一次**字符集判断**，不是语言检测——不做检测正是 Q8.4 的决定。

### 4.2 菜单

在现有复制按钮**右侧**、同一个 `ButtonGroup` 内新增一个 `Dropdown`，触发器是宽度收窄的图标按钮（下拉箭头）。菜单六项，顺序＝`caseFormatList`：

- 标题：i18n 的格式名。
- 副标题（`description` prop）：`convertCase(result, format)` 的结果，即**预览**（D5）。
- 快捷键提示（`shortcut` prop）：`Alt+Shift+N`（N＝1..6）。
- 点击后 `writeText(convertCase(result, format))`，静默，不改 `result`（D9）。

禁用条件与现有复制按钮**完全一致**：`typeof result !== 'string' || result === ''` 时整个下拉按钮 `isDisabled`（D8.5）。

### 4.3 快捷键

键位 `Alt+Shift+1` ~ `Alt+Shift+6`，按 `caseFormatList` 顺序对应六种格式（`1`＝原样）。

选 `Alt+Shift+数字` 的理由：与已有的 `Alt+Shift+U` 同族但**不冲突**（后者只绑在源文本框元素上，且用的是字母）；数字位可以在菜单里直接标出来，不需要用户记 6 个字母助记；判定走 `event.code === 'Digit1'`，不受 macOS 上 `Option+数字` 产生特殊字符的影响。

生效条件：

- 只有 `isShortcutTarget === true` 的那张卡片响应（D7）。该 prop 由 `src/window/Translate/index.jsx` 计算——完整实例列表里**第一个 `enable !== false`** 的实例键，与自身的 `serviceInstanceKey` 相等即为 true。
- 与菜单同样的禁用条件：`result` 非字符串或为空时按键无操作。
- 监听挂在 `window` 上（`useEffect` 内 add / 清理时 remove），因此源文本框获焦时也生效；`Alt+Shift+数字` 不与源文本框的 `Alt+Shift+U` 或回车提交冲突。命中时 `preventDefault()`。

## 5. 行为矩阵

| 场景 | 期望行为 |
|---|---|
| 点原有复制按钮 | 原样复制，静默（与改动前**完全一致**） |
| 展开格式菜单 | 六项各显示格式名 + 当前译文按该格式的预览 + 快捷键提示 |
| 点菜单某项 | 该格式文本写入剪贴板；卡片显示不变；不弹 toast |
| `Alt+Shift+1..6` | 等价于在**第一个已启用实例**的卡片上点对应菜单项 |
| 译文为空 / 仍在翻译 / 翻译失败 | 下拉按钮禁用，快捷键无操作 |
| 译文是词典型对象 | 同上，禁用（与现有复制按钮一致） |
| 纯中文 / 日文译文 | 任何格式都等于原样复制（no-op 兜底） |
| 译文含撇号、括号、连字符等标点 | 标点被当分隔符丢弃 |
| 多张卡片 | 只有第一个已启用实例的卡片响应快捷键；每张卡片的菜单各自作用于自己的译文 |
| 焦点在源文本框时按快捷键 | 照常复制（监听挂 `window`，不排除输入框焦点）。理由见 KNOWN_ISSUES KI-4 |
| 配置尚未加载完成时按快捷键 | 无操作（`isShortcutTarget` 此时全为 `false`）。见 KI-5 |
| 长译文的菜单预览 | 单行截断显示省略号；写入剪贴板的仍是完整文本。见 KI-3 |
| 首个实例被禁用 | 快捷键落到**第一个已启用**的卡片（不重复 auto_copy 的 quirk） |
| `translate_auto_copy` 各档 | 行为不变，自动复制仍是原样 |
| 回译 / 朗读 / 生词本 / 历史记录 | 行为不变（用的仍是未转换的 `result`） |

## 6. 改动范围

| 文件 | 改动要点 |
|---|---|
| `src/utils/case_convert.js` | **新增**：`CaseFormat`、`caseFormatList`、`splitWords`、`convertCase` |
| `src/window/Translate/components/TargetArea/index.jsx` | 复制按钮旁加格式菜单（含预览与快捷键提示）；`isShortcutTarget` 时注册 window keydown；禁用条件与复制按钮一致 |
| `src/window/Translate/index.jsx` | 计算第一个已启用实例键，向 `TargetArea` 传 `isShortcutTarget` |
| `src/i18n/locales/zh_CN.json` | `translate.copy_as` + `translate.case_format.{original,camel,pascal,snake,constant,kebab}` |
| `src/i18n/locales/en_US.json` | 同上 |
| `src/i18n/index.jsx` | **实施中追加**：给 `fallbackLng` 的每条显式回落链尾部补 `'en'`，修 KI-1。原 D13 假设「其余 19 个语言按 `fallbackLng` 回落英文」对 `pt_pt` / `pt_br` / `nb_no` / `nn_no` 不成立 |

**不动**：`SourceArea`（含 `transformVarName` 与 `Alt+Shift+U`）；`Recognize` 窗口；配置页任何页面；`translate_auto_copy` 逻辑与其 `index === 0` quirk；任何 Rust 侧代码；其余 19 个语言文件。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| ~~NextUI `DropdownItem` 的 `description` / `shortcut` prop 可用性~~ | **已核实排除**：`@nextui-org/menu@2.0.30` 的 `MenuItemBaseProps` 同时声明 `description?: ReactNode \| string` 与 `shortcut?: ReactNode \| string`，且 `shortcut` 渲染为 `<kbd>`、两者各有独立 slot（`descriptionProps` / `classNames.shortcut`）。直接用，无需回退方案 |
| 350px 宽的 footer 再加一个按钮可能挤（尤其已配了多个生词本服务时） | 下拉触发器用最窄的图标按钮并与复制按钮同组无间隙；实测过窄则把箭头缩到复制按钮的 `endContent` 位置，不改交互语义 |
| 预览需要对每项调一次 `convertCase`，菜单展开时算 6 次 | 译文长度量级极小，直接算；如需要再用 `useMemo` 按 `result` 缓存 |
| window 级 keydown 可能与未来新增的窗口内按键冲突 | 命中条件收紧到 `altKey && shiftKey && code.startsWith('Digit')`，其余一律放行不 `preventDefault` |
| 两套 case 实现并存，日后容易改一处漏一处 | 写 ADR 0002 说明并存的理由与将来统一的路径 |

## 8. 验收标准

1. `pnpm build` 通过，无新增告警/报错。
2. 改动文件按 `.prettierrc.json` 格式化，`npx prettier --check` 无差异。
3. 单元层面自查 `convertCase`：`user name` / `user's name` / `HTTPServer` / `http2 server` / `用户名称` / 空串 六组输入 × 6 种格式，结果符合第 4.1 与第 5 节。
4. 第 5 节行为矩阵逐行手测（需 Tauri 运行时，本机无 Rust 工具链，由用户在自有环境 `pnpm tauri dev` 实测）。
5. 默认路径回归：不碰新菜单时，复制按钮、回译、朗读、生词本、历史记录、自动复制的行为与改动前完全一致。
6. `SourceArea` 的 `Alt+Shift+U` 循环改写行为不受影响。
