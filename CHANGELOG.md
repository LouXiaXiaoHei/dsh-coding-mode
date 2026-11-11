# 更新日志

本包遵循语义化版本；每个版本都保证 `node scripts/verify.mjs` 通过。

## 1.2.0

输出形状规则（ADHD 友好）。

- persona 新增第七节「输出形状」9 条：第一行给动作或结论、多步写成编号清单、
  工具前只说一句做什么+为什么、不复述刚做完的事、一次只讲一个问题、
  时间给具体单位、收尾四段各一行、列表超 5 项分组、错误不用语气词。
  原「七、语言」顺延为「八、语言」。
- 与原有规则是合并而非叠加：过程可见性照旧汇报，但汇报只讲「已完成 → 结论 → 下一步」；
  收尾照旧四段，但每段压成一行。不会出现"既要简报又要啰嗦"的双重指令。
- `scripts/verify.mjs` 增加对「七、输出形状」「八、语言」两个小节的检查。

## 1.1.0

前置验证 + 可分发。

- 新增 `lib/preflight.js`（插件 `coding-preflight`）：每次组装 system prompt 时用
  `skills.list()` 检查 persona 里点名要求的路由技能是否存在。
  - 全部就绪：注入一行「前置检查通过」回执，模型知道技能路由可用。
  - 有缺失：注入缺失清单与处置方式；`installMode: auto` 时在后台调用
    `pluginManager.installBundle('superpowers-dsh')` 自动补装（不阻塞当前轮次）。
  - 检查结果按 `cacheTtlMs`（默认 30 秒）缓存，不会每步扫一遍技能目录。
- preset 插件清单新增 `coding-preflight`，位于 `persona` 之后。
- 包结构改成可分发：`main` / `exports` / `files` / `peerDependencies`
  （`superpowers-dsh >= 0.5.0`，optional）+ 包内自检脚本 `node scripts/verify.mjs`。
- 新机器安装本包即可得到完整的「编程模式」，不再依赖本机手工改动。

## 1.0.0

首个版本。

- `coding` preset：persona 两段硬规则（过程可见性 6 条 / 怎么思考 8 条 /
  写代码准则 / 验证 / 收尾 / 技能与子代理路由 / 语言）。
- 相对 standard preset 的取舍：保留读写、搜索、执行、待办、技能、定时任务、压缩、
  subagent；移除 goal 自动续跑、plan-mode、workflow、插件管理工具；`tool-todo`
  关闭并行 in_progress。
