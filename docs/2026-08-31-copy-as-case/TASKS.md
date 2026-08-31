# TASKS — 复制译文为指定命名格式（copy-as-case）

格式：`[ ] 任务名 | 优先级 | 估时 | 依赖`
设计与决策见同目录 `DESIGN.md`；术语见仓库根 `CONTEXT.md`。分支：`feat/manual-translate`。
本次由 Claude 亲自实现（用户明示不委托 Codex）。默认**不自动提交**，全部完成后由用户拍板 `git commit`。

## 任务

- [x] T1 新增 `src/utils/case_convert.js` | P0 | 45min | —
  纯函数模块，无 React 依赖、不加 npm 包。导出 `CaseFormat`（6 个常量）、`caseFormatList`（顺序数组）、`splitWords(text)`、`convertCase(text, format)`。
  分词按 DESIGN 4.1 三条：非字母数字（unicode-aware `[^\p{L}\p{N}]+`）当分隔符并丢弃；在 `小写→大写` 边界切分、连续大写后接小写时在最后一个大写前切分；**不**在字母→数字边界切分。
  `original` 原样返回。no-op 兜底：分词为空、或分词结果不含任何 ASCII 字母时返回原文（纯中日文译文因此等于原样复制）。
  注意 `printWidth: 120`、4 空格缩进、单引号、句尾分号。

- [x] T2 i18n 加键 | P0 | 15min | —
  `src/i18n/locales/zh_CN.json`、`en_US.json` 各在顶层 `translation.translate` 下加：
  `copy_as` = 复制为… / Copy as…；`case_format.original` = 原样 / Original；`.camel` = 小驼峰 / camelCase；`.pascal` = 大驼峰 / PascalCase；`.snake` = 蛇形 / snake_case；`.constant` = 常量 / CONSTANT_CASE；`.kebab` = 短横线 / kebab-case。
  其余 19 个语言文件**不动**（按 `fallbackLng` 回落英文）。

- [x] T3 `src/window/Translate/index.jsx` 传 `isShortcutTarget` | P0 | 20min | —
  在 `map` 之前算出完整实例列表里**第一个 `enable !== false`** 的实例键（`enable` 缺省 `true`，与 `:305` 一致），把 `isShortcutTarget={serviceInstanceKey === firstEnabledKey}` 传给 `TargetArea`。
  **不要**动 `translate_auto_copy` 的 `index === 0` 逻辑（DESIGN 3 节记的既有 quirk，本次不修）。

- [x] T4 译文卡片：格式菜单 | P0 | 1h | T1, T2
  `src/window/Translate/components/TargetArea/index.jsx`：在现有复制按钮**右侧**、同一 `ButtonGroup` 内加 `Dropdown`，触发器为最窄的下拉箭头图标按钮。六项顺序＝`caseFormatList`，各项 `description` 放 `convertCase(result, format)` 预览、`shortcut` 放 `Alt+Shift+N`（N＝1..6）。
  已核实 NextUI menu 2.0.30 的 `DropdownItem` 支持 `description` 与 `shortcut`（后者渲染 `<kbd>`），直接用，不必再找替代。
  点击＝`writeText(convertCase(result, format))`，静默、不弹 toast、**不改** `result`。
  禁用条件与现有复制按钮**完全一致**：`typeof result !== 'string' || result === ''`。现有复制按钮本身一行不改。

- [x] T5 译文卡片：窗口内快捷键 | P0 | 40min | T4, T3
  `Alt+Shift+1..6` 对应六种格式。命中判定 `event.altKey && event.shiftKey && event.code` 为 `Digit1..Digit6`（用 `code` 而非 `key`，避开 macOS 上 Option+数字产生特殊字符）；命中才 `preventDefault()`，其余按键一律放行。
  监听挂 `window`，在 `useEffect` 内 add、清理时 remove，依赖至少含 `result`、`isShortcutTarget`。仅 `isShortcutTarget === true` 且未被禁用（同 T4 条件）时执行复制。
  不得影响 `SourceArea` 的 `Alt+Shift+U` 与源文本框回车提交。

- [x] T6 `convertCase` 自查 | P0 | 30min | T1
  用一次性脚本（跑完即删）核对六组输入 × 6 种格式：`user name`、`user's name`、`HTTPServer`、`http2 server`、`用户名称`、空串。
  期望要点：`user's name` → camel `userName`；`HTTPServer` → pascal `HttpServer`（DESIGN 4.1 已声明接受）、snake `http_server`；`http2 server` → camel `http2Server`；`用户名称` 六种格式全部等于原文；空串全部返回空串。
  结果与 DESIGN 4.1 / 第 5 节不符时，先改实现；若发现是设计层面问题，记入本目录 `KNOWN_ISSUES.md`，不擅自改设计。

- [x] T7 构建与格式化验收 | P0 | 30min | T4, T5, T6
  `pnpm build` 通过；改动/新增文件 `npx prettier --check` 无差异。
  本机无 Rust 工具链，**不要**尝试安装 Rust 或跑 `pnpm tauri dev`——运行时手测由用户在自有环境完成。把实际执行的命令与输出结论回报。

- [x] T8 默认路径回归自查 | P1 | 20min | T7
  逐条对照 DESIGN 第 5 节行为矩阵与第 6 节「不动」清单，重点确认：不碰新菜单时复制按钮、回译、朗读、生词本、历史记录、`translate_auto_copy` 三档行为与改动前等价；`SourceArea` 的 `Alt+Shift+U` 未受影响；多张卡片时只有第一个已启用实例响应快捷键。

- [x] T9 评审发现问题的修复 | P0 | 40min | T8
  评审（详见 `KNOWN_ISSUES.md`）查出五条，按用户确认的建议处理：
  KI-1 改 `src/i18n/index.jsx` 的 `fallbackLng`，每条显式回落链尾部补 `'en'`（已实测：19 种语言缺失键归零）；
  KI-3 `DropdownItem` 加 `classNames={{ description: 'truncate' }}`、`DropdownMenu` 加 `max-h-[40vh] overflow-y-auto`；
  KI-2 补齐静态链路核实（`pickChildren` 只比对直接子节点，`isDisabled` 透传成立），结构不改；
  KI-4 判定为预期行为不收紧，补进 DESIGN 行为矩阵；KI-5 记录备查，不改。
  DESIGN 第 5 节行为矩阵与第 6 节改动范围已同步更新。

## 交付约束

- 只改 DESIGN 第 6 节列出的文件；新增文件仅允许 `src/utils/case_convert.js` 与 `KNOWN_ISSUES.md`。
- 不动 `SourceArea`（含 `transformVarName`）、`Recognize` 窗口、配置页、Rust 侧、其余 19 个语言文件。
- 不执行 `git commit` / `git push`。
