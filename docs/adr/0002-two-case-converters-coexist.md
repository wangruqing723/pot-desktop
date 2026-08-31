# 两套命名格式转换实现并存

仓库里已经有一个变量名格式转换：`src/window/Translate/components/SourceArea/index.jsx` 的 `transformVarName`（上游 PR #936，commit `9946487`），绑在源文本框的 `Alt+Shift+U`。本次新增「复制译文为指定格式」时，我们**另写** `src/utils/case_convert.js`，不去复用或重构它。

两者语义并不相同。`transformVarName` 是**循环切换**：按 snake → SNAKE → kebab → dot → 空格 → Title → camel → Pascal → snake 的固定环，从当前形态推进到下一个，靠一串正则**猜**输入现在是哪种形态；它作用于**选中文本**，并**改写源文本本身**。本次要的是**转成指定格式**、来源是完整译文、结果**只写剪贴板**。把后者实现成前者的特例，需要先有一个"当前是什么格式"的判定，而那个判定恰恰是循环语义才需要的东西。

统一成一套的代价落在既有行为上：`transformVarName` 的循环顺序、对选中文本的改写、未选中时的表现，都是已经合入上游、用户日常在用的事实，任何重写都要连带回归这些；而收益只是少一份几十行的纯函数。两份实现各自内聚、互不调用，改一处漏一处的风险局限在"两个功能的格式风格不一致"这一种表现上，不会互相破坏。

将来若要统一，路径是让 `transformVarName` 退化为 `case_convert` 之上的一层"求下一个格式"——先补 `detectFormat(text)`，再用 `caseFormatList` 取环上的下一项。本决策不构成阻碍。
