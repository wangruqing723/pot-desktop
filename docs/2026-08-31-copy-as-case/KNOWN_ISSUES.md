# KNOWN ISSUES — copy-as-case

每条标注核实状态：**已实测**＝真跑过代码；**已核实**＝读到确定的源码/产物依据；**未核实**＝推断，需运行时验证。

## KI-1 四种语言下缺失的 i18n 键显示为键名 — 已修复

状态：**已修复并实测通过**（方案 B）

**问题**：DESIGN D13 的前提「其余 19 个语言文件不动，按 `fallbackLng` 回落英文」曾对四种语言不成立。
`src/i18n/index.jsx` 原先的 `fallbackLng` 把 `pt_pt ↔ pt_br`、`nb_no ↔ nn_no` 配成互相回落，
而 i18next 23.16.4 的 `getFallbackCodes` 一旦命中显式条目就直接 `return found`、**不再**并入 `default: ['en']`，
所以这四种语言的缺失键只在彼此之间找，永远到不了 `en`，最终由 i18next 原样输出键名。

**修复**：给每条显式回落链的**尾部补 `'en'`**，根治而非只给两个文件补键：

```js
fallbackLng: {
    zh_tw: ['zh_cn', 'en'],
    zh_cn: ['zh_tw', 'en'],
    pt_pt: ['pt_br', 'en'],
    pt_br: ['pt_pt', 'en'],
    nb_no: ['nn_no', 'en'],
    nn_no: ['nb_no', 'en'],
    default: ['en'],
},
```

**实测结果**（node 加载 i18next 23.16.4 + 本仓库真实 `resources`，一次性脚本，跑完即删）：
修复前 `t('translate.copy_as')` 在 pt_pt / pt_br / nb_no / nn_no 下返回键名；
修复后 19 种语言全部取到译文，**仍有缺失的语言数 = 0**。

附带收益：`nb_NO.json` / `nn_NO.json` 本来就没有 `translation.translate` 段，
既有的 `translate.copy` 修复前也显示键名，现在一并回落成 "Copy"。

**取舍说明**：此改动超出了 TASKS.md 原定的改动范围（新增了 `src/i18n/index.jsx`），
但没有碰那 19 个语言文件本身；相比方案 A（只给 `pt_PT.json` / `pt_BR.json` 补 7 个键），
它同时修好了这四种语言下**所有**既有缺失键，且改动面只有一处配置。经用户确认后实施。

## KI-2 下拉菜单结构 — 静态链路已全部核实，仅剩运行时确认

状态：**已核实**（原「未核实的一环」已查清，无需改结构）

`Tooltip` 包 `div` 再包 `DropdownTrigger`，是为了让 tooltip 与 dropdown 各自拿到自己的触发元素。
读 `node_modules` 产物逐环追溯，四个环节均已确认：

1. `Dropdown` 用 `const [menuTrigger, menu] = React.Children.toArray(children)` 按**位置**切分。
   本次实现 slot 0 = `Tooltip`、slot 1 = `DropdownMenu`，顺序正确。
2. `Popover` 同样按位置切分：`const [trigger, content] = Children.toArray(children)`，
   `trigger` 直接渲染、`content` 进 `Overlay`。顺序同样正确。
3. `DropdownTrigger` 经 React context 取 `getMenuTriggerProps`，**与嵌套深度无关**，
   故被 `Tooltip` + `div` 包一层不影响它拿到 context。
4. `PopoverTrigger` 里决定 `isDisabled` / `onPress` 走哪条分支的 `hasNextUIButton`，
   由 `pickChildren(children, Button)` 决定。其实现（`@nextui-org/react-rsc-utils@2.0.14`）是
   `Children.map` + `item.type === targetChild`，**只比对直接子节点、不递归**；
   而 `DropdownTrigger` 传给 `PopoverTrigger` 的 `children` 就是 NextUI `Button` 本身，
   故 `hasNextUIButton` 为 true，`{ onPress, isDisabled }` 正确合并到按钮上。外层 `Tooltip` 不参与该比对。

**仍待运行时确认**（纯观感/交互，非结构风险）：点击箭头菜单是否弹出、tooltip 与 dropdown 是否互相干扰、
350px 宽度下 footer 的实际排布。本机无 Rust 工具链，`pnpm tauri dev` 跑不了；
仓库也没有测试框架（`package.json` 无 test 脚本与测试依赖）。
若运行时发现菜单点不开，退路是去掉 `Tooltip` 包装（改用 `Button` 的 `title` 或 `aria-label`），不改交互语义。

## KI-3 长译文的预览副标题会换行堆高 — 已修复

状态：**已修复**（方案 A+B），观感待运行时确认

**问题**：`description={convertCase(result, format)}` 里的 `result` 是**整段译文**。
`@nextui-org/theme@2.2.11` 的 `dropdownItem` slots 中 `title` 带 `truncate`，
但 `description` 只有 `["w-full", "text-tiny", "text-foreground-500", "group-hover:text-current"]`——**没有** `truncate`；
`dropdown` base 为 `["w-full", "p-1", "min-w-[200px]"]`，未设 `max-h` / `overflow`。
即长译文预览会在菜单项内换行、把六项各自撑高，菜单整体也无滚动上限。

**修复**：

- `DropdownItem` 加 `classNames={{ description: 'truncate' }}`——单行省略号。
  选 CSS 截断而非按字符数截断，是因为它随实际菜单宽度自适应，不需要拍一个魔法数字。
  已核实 `classNames.description` 确实生效：菜单项渲染时走
  `className: slots.description({ class: classNames?.description })`。
- `DropdownMenu` 加 `className='max-h-[40vh] overflow-y-auto'`，沿用同文件服务实例菜单的既有写法。

截断只影响菜单显示，**不影响**写入剪贴板的内容——`copyAs` 用的仍是完整的 `convertCase(result, format)`。

## KI-4 快捷键在输入框获得焦点时同样触发 — 确认为预期行为

状态：**已核实**，判定为预期行为，不收紧

监听挂在 `window` 上，未排除焦点位于 `textarea` / `input` 的情况。
因此在源文本框里打字时按 `Alt+Shift+3`，仍会静默把译文按 snake 格式写入剪贴板。

**保留此行为的理由**：「刚在源文本框输入完、想立刻按快捷键复制译文」是合理用法；
若强制要求先把焦点移出输入框才能用快捷键，反而削弱了快捷键的意义。

冲突风险已实测排除：`Alt+Shift+数字` 不产生常规输入字符；`SourceArea` 的既有快捷键用 `KeyU`
（`src/window/Translate/components/SourceArea/index.jsx:349`），与 `Digit*` 不冲突；
`Digit0` 与 `Digit7`~`Digit9` 走放行分支，不 `preventDefault`。

已补进 DESIGN 第 5 节行为矩阵，从「未定义行为」转为「已定行为」。

## KI-5 配置加载完成前快捷键不响应

状态：**已核实**，可接受，记录备查

`shortcutTargetKey` 依赖 `useConfig` 异步加载的 `translateServiceInstanceList` 与 `serviceInstanceConfigMap`。
两者初始为 `null`，此时 `shortcutTargetKey` 为 `null`，所有卡片的 `isShortcutTarget` 都是 `false`，
快捷键在配置加载完成前不响应。

加载期本来也没有译文可复制，故行为上无害。不改。记录在此是为了避免日后被当作 bug 排查。
