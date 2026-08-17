# TASKS — 手动翻译（manualTranslate）

格式：`[ ] 任务名 | 优先级 | 估时 | 依赖`
设计与决策见同目录 `DESIGN.md`；术语见仓库根 `CONTEXT.md`。分支：`feat/manual-translate`。
默认**不自动提交**，全部完成后由用户拍板 `git commit`。

## 任务

- [ ] T1 静态核对 rbd 拖拽把手与点击的兼容性 | P0 | 20min | —
  读 `node_modules/react-beautiful-dnd`（v13.1.1）确认：`dragHandleProps` 是否包含 `onClick`（会与新加的标题栏 onClick 冲突）、拖拽结束后是否有 click 阻断机制。结论写进 `KNOWN_ISSUES.md` 或 T3 的实现注释。若存在冲突，按 DESIGN 的 D13 回退方案实现，不得擅自改成加按钮之外的第三种交互。

- [ ] T2 i18n 加键 | P0 | 15min | —
  `src/i18n/locales/zh_CN.json`、`en_US.json` 各加三个键（其余 19 个语言文件不动）：
  `config.service.enable` = 启用 / Enable；`config.service.manual_translate` = 手动翻译 / Manual Translate；`translate.click_to_translate` = 点击翻译 / Click to translate。
  注意两份文件的实际结构是顶层 `translation` 包裹。

- [ ] T3 服务设置行加「手动翻译」开关 | P0 | 40min | T2
  `src/window/Config/pages/Service/Translate/ServiceItem/index.jsx`：在现有 `enable` Switch 旁加第二个 Switch，读写实例配置里的 `manualTranslate`（缺省 false），写回方式与 `enable` 一致（`setServiceInstanceConfig({ ...config, manualTranslate: v })`）。两个 Switch 各套 Tooltip（`config.service.enable` / `config.service.manual_translate`）；`enable` 关闭时手动开关**不**置灰、不联动。只改翻译服务的 ServiceItem，识别/语音/生词本三处不动。

- [ ] T4 翻译卡片：拦住自动翻译，引入未翻译状态 | P0 | 1.5h | T2
  `src/window/Translate/components/TargetArea/index.jsx`：
  取当前实例的 flag（跟随 `currentTranslateServiceInstanceKey` 变化，缺省 false）；新增一个本地"未翻译"状态；把 `:96` 的自动翻译 effect 分流——手动实例进入未翻译状态并收起卡片（D14），**不调用** `translate()`；非手动实例保持现有行为一字不动。effect 里 `autoCopy === 'source'` 的源文本复制逻辑保持原样、不受手动影响。

- [ ] T5 翻译卡片：标题栏点击触发 + 事件隔离 | P0 | 1h | T1, T4
  标题栏点击仅在「手动实例 && 未翻译 && 非加载中」时发起翻译（发起前清空 error/result 并退出未翻译状态）；已出结果/已失败/加载中点击无操作（D8）。切换实例的 Dropdown 与折叠按钮各自 `stopPropagation`，不得触发翻译；拖拽排序不得触发翻译。仅在可点击时给 `cursor-pointer`。

- [ ] T6 翻译卡片：未翻译提示与失败展开 | P1 | 40min | T4, T5
  标题栏在「手动实例 && 未翻译 && 非加载中」时显示淡色提示 `translate.click_to_translate`（建议 NextUI `Chip size='sm' variant='flat'`，风格对齐 `SourceArea` 里 detectLanguage 的 Chip），其余状态不显示。两个 translate reject 分支：**仅手动实例**在失败时展开卡片（D7），使错误文本与重试按钮可见；自动实例的失败行为保持原样。

- [ ] T7 构建与格式化验收 | P0 | 30min | T3, T4, T5, T6
  `pnpm install && pnpm build` 通过；改动文件按 `.prettierrc.json` 格式化（`npx prettier --check` 无差异）。本机无 Rust 工具链，`pnpm tauri dev` 不可用——**不要**尝试安装 Rust 或跑 tauri，运行时手测由用户在自有环境完成。把实际执行的命令与输出结论回报。

- [ ] T8 默认路径回归自查 | P1 | 20min | T7
  逐条对照 DESIGN 第 5 节行为矩阵与第 6 节「不动」清单，自查：所有实例都不开手动翻译时，代码路径与改动前等价（重点是 effect 分流、reject 分支、标题栏 onClick 三处的 false 分支）。发现设计层面问题记入本目录 `KNOWN_ISSUES.md`，不擅自改架构。

## 交付约束

- 只改 DESIGN 第 6 节列出的 4 个文件；新增文件仅允许 `KNOWN_ISSUES.md`。
- 不改 Rust 侧、不动其它服务类型、不动其余 19 个语言文件、不碰 `SourceArea`。
- 不执行 `git commit`／`git push`。
