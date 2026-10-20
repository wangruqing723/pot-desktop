# DESIGN — 输入翻译时回显上次原文（echo-last-source）

需求 slug：`echo-last-source` ｜ 目标分支：`feat/manual-translate`（沿用当前分支）｜ 术语以仓库根 `CONTEXT.md` 为准（输入翻译、上次源文本、回显、源文本提交）。

## 1. 目标

新增一个默认关闭的开关。开启后，用**输入翻译**打开翻译窗口时，把**上次源文本**填回源文本框并全选，方便直接改写或接着写。只回显原文，不保留译文与语言选择，不发任何翻译请求。

## 2. 已定决策（不得在实现阶段翻案）

| # | 决策 | 来源 |
|---|---|---|
| D1 | 只回显源文本；**不保留译文、不保留语言选择**，语言选择器照旧按设置走 | 用户修正 |
| D2 | 只在**输入翻译**打开窗口时回显；快捷键、托盘、HTTP `/input_translate` 走同一个 Rust 入口，一视同仁 | 一轮 Q1 |
| D3 | 记的是**窗口关闭时源文本框里实际剩下的内容**，不论是否提交过、来自哪个入口；清空后关闭＝下次回显为空 | 三轮 Q1 |
| D4 | **只存内存**（Rust 进程内），退出应用即消失；不写磁盘、不进备份 | 一轮 Q3 |
| D5 | 回显后**全选**源文本；卡片保持空白 | 一轮 Q6 |
| D6 | 回显**不构成源文本提交**：不发请求、不触发自动复制、不写历史记录；回显后按回车才是一次正常提交 | 三轮 Q2 |
| D7 | 窗口没关时再按输入翻译：**不清空**，保留当前内容（含未提交修改）与卡片结果，只聚焦并全选 | 一轮 Q7 |
| D8 | 开关：配置键 `translate_echo_last_source`，布尔，默认 `false`；翻译设置页第一张卡片「记住目标语言」下方；zh「输入翻译时回显上次原文」/ en「Show last source text on Text Translation」；i18n 只加 `zh_CN` + `en_US` | 三轮 Q3 |
| D9 | 开关关闭时**什么都不记录**，行为与上游一致；打开后从下一次起生效 | 三轮 Q4 |
| D10 | 与「禁用历史记录」互不影响 | 三轮 Q5 |
| D11 | 开关**由开转关时清掉已记内容**，避免再次打开时冒出关闭前的旧文本 | 由 D9 推出 |
| D12 | D7 的保留路径**不清空检测语言**（见 3 节最后一条） | 由 D7 推出 |

## 3. 现状（读代码确认，实现时依赖这些事实）

- **窗口关闭即销毁**：失焦 100ms 后 `appWindow.close()`（`src/window/Translate/index.jsx:24-39`）、源文本框 Esc、Win/Linux 关闭按钮、macOS 原生关闭，都会销毁窗口，React 状态全丢 → 上次源文本必须存在窗口之外。
- **输入翻译链路**：Rust `input_translate()`（`src-tauri/src/window.rs:241`）把 `StringWrapper` 写成 `[INPUT_TRANSLATE]` 并 emit `new_text`。新窗口挂载时 `invoke('get_text')` 读它（`SourceArea/index.jsx:238-250`）；已开窗口经 `new_text` 监听进 `handleNewText`（`:214-226`）。INPUT 分支 `setSourceText('', true)` 清空（`:62-66`）。
- **提交与卡片解耦**：`useSyncAtom` 的 `setSourceText` 只改本地值，`syncSourceText()` 才写入 `sourceTextAtom`（＝源文本提交）；`TargetArea` 只盯 atom。→ 回显只 `setSourceText` 不 sync，天然满足 D6。
- **动态翻译**只挂在 `onChange` 的 `changeSourceText` 上，程序赋值不触发 → 回显不会被动态翻译提交。
- **闭包陈旧**：`new_text` 监听只在 `hideWindow` 变化时重注册，`handleNewText` 里读到的组件 state 可能是旧值 → "窗口是否已处理过文本"用 ref，开关值在 INPUT 分支里现读 `store`。
- **配置同步**：`useConfig` 跨窗口靠 `${key}_changed` 事件；Rust 侧 config 要等 fs watch + `reload_store` 才更新 → 开关判断放前端，Rust 只当存储。
- **自定义 Tauri command** 不需要 allowlist；`src/main.jsx` 用 `createRoot`，React 18 自动批处理。
- **检测语言被卡片使用**：`detectLanguageAtom` 参与 `TargetArea` 的第二目标语言判定与回译。保留卡片却清空它，之后改语言触发的重翻译会走错分支 → D12。
- `SourceArea/index.jsx` 本身已不符合 prettier（既有问题），本次不整体格式化。
- 本机虽有 Homebrew Rust 1.98.1，但从未编译过本项目 → Rust 侧编译与打包走 GitHub Actions。`.github/workflows/package.yml` 只在 push `master` 或手动 dispatch 时触发；push `master` 会走带签名的正式发布流程，因此只用 dispatch。dispatch（`package_scope=macos-arm64`）产出未签名的 macOS arm64 dmg 与 Windows x64 安装包，`feat/manual-translate` 上已有 6 次成功先例。CI 用 `dtolnay/rust-toolchain@stable`，打包前会跑 `pnpm prettier --write .`。

## 4. 方案

### 4.1 Rust：只做内存存储

- `src-tauri/src/main.rs`：新增 `pub struct LastSourceTextWrapper(pub Mutex<String>);`，在 `setup` 里与 `StringWrapper` 并列 `app.manage(...)`，初值空串。
- `src-tauri/src/cmd.rs`：新增 `get_last_source_text(state) -> String`、`set_last_source_text(text: String, state)`，注册进 `generate_handler!`。
- **不动** `window.rs`、`StringWrapper`、热键/托盘/HTTP 入口。

### 4.2 SourceArea：记录

- `const [echoLastSource] = useConfig('translate_echo_last_source', false);`
- `handledRef = useRef(false)` ＋ `recordReady` state：本窗口第一次 `handleNewText` 定下源文本框初始内容后置位。截图分支在发起识别前置位（此时框为空，符合 D3）。
- 记录 effect，依赖 `[sourceText, echoLastSource, recordReady]`：`echoLastSource === true && recordReady` 时 `invoke('set_last_source_text', { text: sourceText })`。
  - **逐字记录、不防抖**：任何关闭方式都不依赖关闭钩子，也不会丢最后几个字；单次 Mutex 写入，开销可忽略。
  - `recordReady` 之前不写，避免挂载时的初始空串覆盖已存内容。
- 开关由开转关时本窗口也清一次（ref 记上一个值，仅 `true → false` 触发）。原因：配置页的清空立即执行，但 `useConfig` 写入有 500ms 防抖，翻译窗口要晚到才收到变更，这段间隙里的输入会把内容记回去。（实现中补充，见 TASKS 注）

### 4.3 SourceArea：回显

`handleNewText` 的 INPUT 分支现读 `(await store.get('translate_echo_last_source')) ?? false`：

| 开关 | `handledRef` | 行为 |
|---|---|---|
| 关 | 任意 | 原逻辑不变（清检测语言、清空源文本框） |
| 开 | `false`（新窗口） | `setSourceText(await invoke('get_last_source_text'))`，然后全选 |
| 开 | `true`（窗口没关） | 不清空、不清检测语言，只 show/focus + 全选 |

- `setDetectLanguage('')` 从函数开头挪到分支判断之后，只有「开 + 窗口没关」跳过。
- 全选：`selectAllTick` state 自增，effect 里 `textAreaRef.current.focus(); textAreaRef.current.select();`，保证在新值渲染之后执行。
- 划词、截图分支除置位外不变。

### 4.4 配置页与 i18n

- `src/window/Config/pages/Translate/index.jsx`：`useConfig('translate_echo_last_source', false)`，在「记住目标语言」行后加同样结构的 Switch 行；`onValueChange` 里 `v === false` 时额外 `invoke('set_last_source_text', { text: '' })`（D11）。
- `zh_CN.json` / `en_US.json`：`config.translate.echo_last_source`。

## 5. 行为矩阵

**开关打开**

| 场景 | 期望行为 |
|---|---|
| 应用启动后第一次输入翻译 | 源文本框为空 |
| 输入「hello」回车翻译，失焦关闭，再输入翻译 | 框内「hello」全选；卡片空白；不发请求、不自动复制、不写历史 |
| 输入「hello」不回车，按 Esc 关闭，再输入翻译 | 框内「hello」全选 |
| 划词翻译「world」后关闭，再输入翻译 | 框内「world」全选 |
| 清空源文本框后关闭，再输入翻译 | 框为空 |
| 回显后直接回车 | 正常提交：自动卡片翻译、手动卡片进入未翻译状态，自动复制与历史照常 |
| 回显后打字 | 覆盖全选内容；开了动态翻译则照常 1 秒后提交 |
| 窗口钉住或关闭了失焦关闭，再按输入翻译 | 源文本、卡片结果、检测语言标签都保留，只聚焦并全选 |
| macOS 原生关闭 | 同失焦关闭 |
| 退出并重启应用，再输入翻译 | 框为空 |
| 截图识别失败后关闭，再输入翻译 | 回显错误提示文本（已知且接受，全选后一打字即覆盖） |

**开关关闭**：任何场景与改动前完全一致，不记录。由开转关时立即清掉已记内容。

## 6. 改动范围

| 文件 | 改动要点 |
|---|---|
| `src-tauri/src/main.rs` | 新增 `LastSourceTextWrapper`、`manage`、注册两个命令 |
| `src-tauri/src/cmd.rs` | 新增 `get_last_source_text` / `set_last_source_text` |
| `src/window/Translate/components/SourceArea/index.jsx` | 4.2 记录 + 4.3 回显 |
| `src/window/Config/pages/Translate/index.jsx` | 新开关行 |
| `src/i18n/locales/zh_CN.json`、`en_US.json` | `config.translate.echo_last_source` |

**不动**：`window.rs` 与 `StringWrapper`、热键/托盘/HTTP 入口、`TargetArea`、`LanguageArea`、`src/window/Translate/index.jsx`、历史记录、其余 19 个语言文件。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 挂载时初始空串覆盖已存内容 | `recordReady` 门控 |
| `new_text` 监听闭包陈旧，读不到最新开关值与"是否已处理" | `handledRef` + INPUT 分支现读 `store` |
| 新窗口 `get_text` 与 `new_text` 可能都触发 `handleNewText` | 两次读到同一份已存内容，或第二次走保留分支只全选，结果幂等 |
| 配置页改开关后 500ms 内，翻译窗口读到的仍是旧值（`useConfig` 写入防抖；两个窗口的 `store.get` 走同一个 Rust 插件内存，没有额外的 fs watch 延迟） | 半秒内的边界，可接受；由开转关的清空另有本窗口兜底（4.2） |
| 空选区划词时 Rust 不更新 `StringWrapper` 的既有 quirk | 不在本次范围 |

## 8. 验收标准

1. 本地 `pnpm build` 通过。
2. 配置页与两个 i18n 文件 `npx prettier --check` 通过；`SourceArea` 只保证新增代码与周边风格一致；新增 Rust 代码按 rustfmt 风格书写，不整体格式化既有文件。
3. Rust 编译：push `feat/manual-translate` 后手动 dispatch `package.yml`（`package_scope=macos-arm64`），macOS arm64 与 Windows x64 两个构建 job 均成功即通过。本地不跑 `cargo check`。
4. 第 5 节行为矩阵逐行手测：由用户安装 CI 产出的 dmg 实测。
5. 默认路径回归：开关关闭时，翻译窗口行为与改动前一致。
