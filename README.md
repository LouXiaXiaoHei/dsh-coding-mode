# dsh-coding-mode —— 编程模式

一个 DeepSeek Harness agent preset bundle：**像高级软件工程师一样思考，边做边说，不闷头干活**。

装一次就得到一个完整的 agent 模式（preset id `coding`，显示名「编程模式」），
换一台机器、换一个 DSH profile 也一样能装。

## 解决的问题

默认 `standard` preset 的 persona 只有一句 `You are a coding agent ...`，同时提供了
subagent / subagent_fork / workflow / goal 这一整套"自己闷头干"的能力。模型遇到小问题时
容易连续调用几十次工具、中间零输出，半小时后一次性汇报。

第二个问题是"怎么想"：没有约束时，模型容易看见报错就改报错行、凭猜测写代码、
把推测当结论、一次改五个文件再一起调试。

第三个问题是"技能没装就开跑"：persona 让它在 bug 场景加载 `systematic-debugging`，
但如果 superpowers 技能根本没装，它会假装走了流程。本包用前置验证把这件事变成显式事实。

## 快速开始

```bash
# 1. 自检（不联网、零依赖）
node scripts/verify.mjs        # 或 npm run verify
node --test scripts/          # 或 npm test

# 2. 装进 DSH profile（在 DSH 会话里用 plugin_manager 工具）
#    本地目录：
plugin_manager install_bundle target=file:/path/to/dsh-coding-mode
#    或者若已发布到 registry：
plugin_manager install_bundle target=dsh-coding-mode
```

装完在 Web UI 的模式选择器里选「编程模式」（新会话生效，也可在会话内切换）。

## 本模式做了什么

### 1. persona 两段写死规则（system prompt 首段，权重最高）

**过程可见性（硬规则）**
- 调用任何工具之前先一句中文说明「做什么 + 为什么」
- 每 3–5 步或每改完一个文件汇报一次
- 改文件后立即列出完整路径与改动
- 报错/阻塞立即说明，静默重试被明确禁止
- 长命令/job 说明在等什么、预计多久
- 自检：调工具前先问"上一步我对用户说话了吗"

**高级工程师的思考方式（每个维度都要外显成一句可检验的话）**
- 先定性：bug 修复 / 新功能 / 重构 / 性能 / 配置问题，不同性质不同打法
- 先找根因：先问"哪条代码路径能产生这个现象"，禁止看到报错就改报错行
- 假设显式化：写成"我假设 X，因为 Y"，立刻用一次读文件或一条命令去证实
- 划爆炸半径：动手前说清影响谁（调用方 / 测试 / 并发 / 持久化 / 跨平台）
- 最小可验证增量：一次只做一件能独立验证的事
- 反对而不是迎合：方案有隐患先讲清隐患和替代方案，再动手
- 区分事实与推测：没读过的代码只能说"我没看，推测是……"
- 思考用短句表达：一条结论 + 一条依据

核心是把「深度思考」和「简短输出」绑定：思考要深，输出要短。避免规则加多之后
模型又开始长篇内心戏或写计划文档。

### 2. 写代码准则

先看邻居代码的风格 → 边界优先（空值/并发/失败重试/资源释放）→ 不造抽象 →
不留假实现（TODO 占位、吞异常、假数据）→ 不轻易引入新依赖 → 改完自看 diff。

### 3. 验证与收尾

没有证据不叫完成：跑相关测试或构造最小复现、贴真实输出、验证要打中改动的路径。
收尾固定为：根因 → 改动清单（路径+行号）→ 验证证据 → 剩余风险。

### 4. 技能与子代理路由（persona suffix 段）

满足条件就主动加载对应技能，不必先问用户：

| 场景 | 技能 |
|---|---|
| 需求大而笼统（验收标准说不清 / 多目标 / 说不出改哪） | `brainstorming` → 一次问一个问题细化，再给 2–3 个方案 |
| 遇到 bug、测试失败、行为不符预期 | `systematic-debugging` |
| 准备宣称完成 / 已修复 / 测试通过之前 | `verification-before-completion` |
| 完成任务、完成重大功能、合并前 | `requesting-code-review` → 派 reviewer subagent |
| 收到 code review 反馈 | `receiving-code-review`（不盲从、先技术验证） |
| 2 个以上互不依赖的问题 | `dispatching-parallel-agents` → 一 domain 一 subagent |
| 需要用户做视觉选择（布局/配色/方案对比） | `brainstorming` 里的 Visual Companion 流程 |
| UI 缺陷需要验证（渲染/样式/交互） | `webapp-testing` 或 `browser-testing-with-devtools` |

### 5. 输出形状（ADHD 友好，默认生效）

persona 第七节把「直接给结果」写成硬规则，不需要每轮再要求模型"简短一点"：

- 第一行就是动作或结论，删除所有开场白
- 多步操作写编号清单，一步一个动作
- 工具前的说明只留一句：做什么 + 为什么
- 不复述刚做完的事，汇报只写「已完成 → 结论 → 下一步」
- 一次只讲一个问题，第二个问题留到最后单独提
- 时间用具体单位（"约 2 分钟"），不写"需要一些时间"
- 收尾仍是四段（根因 / 改动 / 验证 / 风险），但每段一行
- 列表超 5 项就分组；错误不用语气词，一句原因 + 一句修法

这九条与前面几节是**合并**而非叠加：可见性要求"每 3–5 步汇报"，这里约束"汇报只讲状态、不复述过程"；
收尾要求四段，这里约束"四段各一行"。不会出现"既要简报又要啰嗦"的双重指令。

### 6. 前置验证（`coding-preflight`）

上面的路由表依赖 superpowers 技能真的存在，所以包里带一个运行时检查插件：

- 挂在 `system-prompt/assemble` waterfall 上，每次组装 system prompt 前
  用 `skills.list()` 比对 6 个路由技能（`systematic-debugging`、
  `verification-before-completion`、`requesting-code-review`、
  `receiving-code-review`、`dispatching-parallel-agents`、`brainstorming`）。
- **全部就绪** → 注入一行「前置检查通过」回执，模型知道路由可用。
- **有缺失** → 注入缺失清单 + 处置方式，并明确要求：技能可用之前不许假装走了流程，
  必须在结论里注明「未走 xxx 技能流程」。
- `installMode: auto`（默认，patch 里已开）→ 后台调用
  `pluginManager.installBundle('superpowers-dsh')` 自动补装；失败或服务不可用时降级为文字提示。
- 结果按 `cacheTtlMs`（默认 30 秒）缓存，不会每一步都扫技能目录。
- 用 `ctx.get('skills')` 而不是 `inject: ['skills']`：服务缺失时降级成警告，
  而不是让整个 preset 卡在 pending。

配置项（在 `cordis.patch.yml` 的 `coding-preflight` entry 里改）：

| 键 | 默认 | 说明 |
|---|---|---|
| `installMode` | `auto` | `auto` 缺失时自动装 / `warn` 只提示 / `off` 完全不检查 |
| `superpowersBundle` | `superpowers-dsh` | 提供技能的那个 bundle 名 |
| `requiredSkills` | 上面 6 个 | 换成别的技能集合 |
| `cacheTtlMs` | `30000` | 检查结果缓存时长 |

### 7. 工具取舍：只留恰到好处的黑箱

- **移除**：`goal` 工具与 `command-goal`（自动续跑轮次）、`plan-mode`（先出计划再动手）、
  插件管理工具、`workflow` 系列（大规模编排）、`subagent_fork`（继承会话历史，最容易把过程藏起来）。
- **加回**：`subagent`（spawn 型，干净上下文）+ `tool-subagent-control`。只服务于两件事——
  派 reviewer 审查、并行调查 2 个以上独立问题。这两类场景有子代理才做得对，所以保留，
  但在 persona 里配了「子代理不放松可见性」约束：派发前说范围与预期产出、等待中说在等什么、
  拿到结果先摘要、subagent 结论未经亲自验证只能算「待确认」。
- **收紧 todo**：`allowParallelInProgress: false`，强制一次只推进一件事。
- **保留**：bash/pwsh、fs 读写、glob/grep、todo、ask_user、web、skill、schedule、
  jobs、present、压缩组。

## 包结构

```
dsh-coding-mode/
├── package.json          # dsh.bundle.patch 指向 cordis.patch.yml；exports 暴露 . 和 ./preflight
├── cordis.patch.yml      # preset 定义（persona 两段 + 18 个插件）
├── lib/
│   ├── index.js          # 空入口插件（让 main 可解析）
│   └── preflight.js      # 前置验证插件 coding-preflight
├── scripts/verify.mjs    # 零依赖自检：结构 / patch / persona / 插件导出
├── README.md
└── CHANGELOG.md
```

## 分发到别的机器 / 别的 DSH

这个包只依赖 DSH 本身，没有运行时第三方依赖（`superpowers-dsh` 是可选的 peer，
缺失时由前置验证负责补装）。三种分发方式任选：

1. **拷目录 + file 安装**：把整个 `dsh-coding-mode/` 目录拷过去，
   `plugin_manager install_bundle target=file:/目标路径/dsh-coding-mode`。
2. **npm 包**：`npm pack` 产出 tarball 后发出去，对方
   `plugin_manager install_bundle target=file:/path/to/dsh-coding-mode-1.1.0.tgz`；
   或发布到 registry 后直接 `target=dsh-coding-mode`。
3. **git 仓库**：把目录推成仓库，对方用
   `plugin_manager install_bundle target=git+https://.../dsh-coding-mode.git`。

安装成功后，该 profile 的所有新会话都能在模式选择器里看到「编程模式」。
注意 bundle 是装进**具体 profile** 的，多 profile 环境需要各自安装一次。

## 给自己的编程模式加功能

1. **加一个插件**：写 `lib/xxx.js`（形如 `export const name` / `export const inject` /
   `export function apply(ctx, config)`），在 `package.json` 的 `exports` 里加子路径
   （如 `"./xxx": "./lib/xxx.js"`），再在 `cordis.patch.yml` 的 `plugins:` 里加一条
   `- id: xxx` / `name: dsh-coding-mode/xxx`。`files` 已包含 `lib`，无需改。
2. **加硬规则**：直接改 `persona.prefix` / `persona.suffix`。prefix 是 system prompt
   第一段（权重最高），suffix 排在后面；两者都会被 `agent-instructions` 的
   `maxBytes: 65536` 覆盖到，不用担心超长。
3. **加路由技能**：改 suffix 的路由表，同时把技能名加进 `lib/preflight.js` 的
   `DEFAULT_REQUIRED_SKILLS`（或 patch 里的 `requiredSkills`），否则前置验证管不到它。
4. **验证**：`node scripts/verify.mjs`。它检查入口/patch 存在、插件清单顺序、
   persona 各小节是否还在、preflight 是否覆盖全部路由技能、插件导出是否正确。
5. **重装生效**：见下一节。

## 修改后如何生效

`~/.dsh/profiles/desktop/node_modules/dsh-coding-mode/` 是 pnpm 生成的**目录副本**，
不是符号链接，改了源目录不会自动同步。直接 `install_bundle` 会报
`already-installed`，所以要先移除再装：

```
plugin_manager remove_bundle target=dsh-coding-mode
plugin_manager install_bundle target=file:/Users/mfym/projects/tmp/dsh-coding-mode
```

验证：`plugin_manager list_plugins` 里 `include:preset-coding` 应为
`enabled: true, fiberPhase: "active"`（fiberPhase=active 即 preset 已注册进 registry）。

## 注意

- 模型与 `reasoningEffort` 由部署默认（`agent-default-model`）或会话级模型选择器决定，
  preset 不改这两项。若仍觉得"想太久"，请在 UI 把推理强度调低。
- 压缩仍由 billion-context 接管（其 gate 会自动禁用本 preset 的 `compaction-basic`），
  卸载 billion-context 时这里会回落到 stock 压缩。
- 本 preset 不含 `plugin_manager` 工具，所以自动安装 superpowers 失败时，
  只能提示用户去 UI 的「设置 → 插件」手动装。
