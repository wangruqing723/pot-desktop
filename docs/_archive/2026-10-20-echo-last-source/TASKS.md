> 实现方：Claude（文档模式）

# TASKS — 输入翻译时回显上次原文（echo-last-source）

格式：`[ ] 任务名 | 优先级 | 估时 | 依赖`
设计与决策见同目录 `DESIGN.md`；术语见仓库根 `CONTEXT.md`。分支：`feat/manual-translate`。
默认**不自动提交**，全部完成后由用户拍板 `git commit`。

## 任务

- [x] T1 Rust 侧内存存储 | P0 | 20min | —
  `src-tauri/src/main.rs` 新增 `LastSourceTextWrapper(pub Mutex<String>)`，`setup` 里与 `StringWrapper` 并列 `manage`，初值空串。
  `src-tauri/src/cmd.rs` 新增 `get_last_source_text` / `set_last_source_text(text: String)`，注册进 `generate_handler!`。
  不动 `window.rs`、`StringWrapper` 与各入口。

- [x] T2 i18n 加键 | P0 | 5min | —
  `zh_CN.json` / `en_US.json` 的 `config.translate` 下加 `echo_last_source`：输入翻译时回显上次原文 / Show last source text on Text Translation。其余语言文件不动。

- [x] T3 配置页开关 | P0 | 15min | T1, T2
  `src/window/Config/pages/Translate/index.jsx`：`useConfig('translate_echo_last_source', false)`，在「记住目标语言」行后加同结构 Switch 行。
  `onValueChange` 里 `v === false` 时额外 `invoke('set_last_source_text', { text: '' })`（D11）。

- [x] T4 SourceArea 记录上次源文本 | P0 | 30min | T1
  按 DESIGN 4.2：`echoLastSource` 配置、`handledRef` + `recordReady` 门控；三个分支在定下初始内容后置位，截图分支在发起识别前置位。
  记录 effect 依赖 `[sourceText, echoLastSource, recordReady]`，逐字 `invoke('set_last_source_text')`，不防抖。
  **实现中调整**：T7 自查发现配置页 `useConfig` 写入有 500ms 防抖，开着的翻译窗口晚到才知道开关已关，间隙里的输入会把刚清掉的内容记回去。补一个 effect：本窗口 `echoLastSource` 由 `true` 转 `false` 时再清一次。DESIGN 4.2 与第 7 节已同步。

- [x] T5 SourceArea 回显与保留 | P0 | 40min | T4
  按 DESIGN 4.3：INPUT 分支现读 `store` 的开关值；新窗口取 `get_last_source_text` 回显，窗口没关则保留内容只聚焦。
  `setDetectLanguage('')` 挪到分支判断后，「开 + 窗口没关」跳过（D12）。全选用 `selectAllTick` + effect。开关关闭时 INPUT 分支与原逻辑逐行等价。

- [x] T6 本地前端构建与格式验收 | P0 | 15min | T1–T5
  `pnpm build`；配置页与两个 i18n 文件 `npx prettier --check`。本地**不跑** `cargo check`，Rust 编译交给 T8 的 CI。
  `SourceArea` 既有格式不合规，不整体格式化，只保证新增代码风格一致。回报实际命令与输出结论。

- [x] T7 默认路径回归自查 | P1 | 20min | T6
  对照 DESIGN 第 5 节与第 6 节「不动」清单，逐行核对开关关闭时 `handleNewText` 各分支、`keyDown`、清空按钮、`Alt+Shift+U` 与改动前等价。

- [x] T8 CI 编译打包 | P0 | 15min | T7 + 用户确认提交
  已完成：commit `3e48498`，run https://github.com/wangruqing723/pot-desktop/actions/runs/39438187902 ，macOS arm64 与 Windows x64 构建均成功，日志中无与新代码相关的 warning。产物 `macos_aarch64-apple-darwin_dmg`、`windows_x86_64-pc-windows-msvc`。
  用户确认提交后：`git commit` → `git push origin feat/manual-translate` → `gh workflow run package.yml --ref feat/manual-translate -f package_scope=macos-arm64` → `gh run watch` 跟到结束。
  macOS arm64 与 Windows x64 两个构建 job 均成功即勾选；失败则读日志修复后重跑，修复提交同样先经用户确认。回报 run 链接与 dmg 产物名。

## 交付约束

- 只改 DESIGN 第 6 节列出的六个文件，不新增源文件。
- 行为矩阵手测由用户安装 T8 产出的 dmg 完成。
- `git commit` 必须先经用户明确确认；push 只推 `feat/manual-translate`，**不推 `master`**（会触发带签名的正式发布流程）。
