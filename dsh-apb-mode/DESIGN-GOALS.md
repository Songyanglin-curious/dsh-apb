# dsh-apb-mode 设计目标（Design Goals）

> APB = Ask / Plan / Build。本文记录 v2（Ask-Plan-Build 模式真实化）插件的设计目标，
> 与 `DESIGN.md`（设计思路）、`IMPLEMENTATION.md`（实现思路）配套阅读。

## 一、要解决的原始问题

用户需要一个"像人一样干活"的编码 Agent：复杂任务不一次性做完，而是
**先 ask 讨论 → plan 规划 → build 逐步实现 → 走通后再分步重构**。
早期（v1）这套纪律只是写在 preset persona 里的"行为约定"：

- Agent 每轮回复必须带 `[ask]/[plan]/[build]` 前缀自报模式；
- ask/plan 的"只读"靠模型自觉遵守，工具与沙箱并不拦它；
- 模式切换靠对话声明，没有真实状态，也没有界面指示。

用户实际试用后反馈三点痛点，构成 v2 的设计目标：

1. **每轮自报污染上下文** —— 不想让模型每轮重复模式标签与长篇说明；
2. **切换不真实** —— 按 Shift+Tab 只是页面焦点切换，不是切 APB 模式；
3. **只读不可信** —— ask/plan 阶段应让模型**物理上写不了**，而不是"请自觉"。

## 二、v2 目标清单

### G1. 真实权限强制（核心）
三模式不再是 persona 约定，而是**真实会话状态**，切换时直接改写宿主
`sandbox` 文件策略与 `approval` 策略：

| 模式 | 语义 | 宿主权限预设 |
| --- | --- | --- |
| `ask` | 问答 / 澄清 / 找漏洞 | `read-only` |
| `plan` | 从 ask 产出实施计划 | `read-only` |
| `build` | 执行计划：写文件、调试、重构 | `workspace-write` |

在 ask/plan 下模型调用写类工具会被**文件沙箱在执行层拒绝**，上下文里
"Current DSH file policy: read-only" 即为当前模式的可信指示。

### G2. 状态真实且随会话持久
模式是 logged 的会话状态（`apb/mode` 事件，last-wins，默认 ask），
resume / fork 后自动恢复，不依赖进程内镜像。

### G3. 切换便捷、状态可见
- composer 输入区右侧 **APB chip**（点击循环 ask→plan→build→ask）；
- **Alt+M** 快捷键（键位集中配置，冲突可改）；
- `/apb [ask|plan|build|next|status]` 命令通道。

### G4. 去上下文污染
persona 不再要求"每轮回复以 [ask] 开头/重复模式规则"；模式状态由系统
（权限行 + projection + UI）承载，仅在 plan/build 需要时给一行极短提示，
ask 默认零提示。

### G5. 可复用、可迁移、可迭代
- host 逻辑做成独立插件包 `@deepseek-ai/dsh-apb-mode`，只挂到
  `apb-coding` preset（isolate realm，不与其它预设冲突）；
- UI 做成独立 client 包 `@deepseek-ai/dsh-client-ui-apb-mode`，经 profile
  补丁层注册；chip 的可见性**数据驱动**（仅 `agent-preset/selected=apb-coding`
  的会话渲染/响应），其它预设会话不受影响；
- 安装于 DSH 用户级环境（不绑定任何项目仓库），目录整体拷贝即可迁移。

## 三、非目标（明确不做）
- 不做"模式级工具目录裁剪"——保持工具目录跨模式稳定（请求缓存友好），
  权限由沙箱执行层区分；
- 不把 build 默认升到 `danger-full-access`（默认与宿主一致为
  `workspace-write`；需要更强权限时改 `MODE_PERMISSION` 一行即可）；
- 不改动 DSH 自带（shipped）的任何预设/插件，全部改动落在用户级。

## 四、验收口径
在新建的 apb-coding 会话中：
1. 输入区出现 APB chip，且默认 ask（只读）；
2. Alt+M / 点击 / `/apb` 三种方式都能循环切换；
3. 切换后上下文 `Current DSH file policy` 在 read-only 与 workspace-write
   之间真实变化，ask/plan 下模型写文件会被沙箱拒绝；
4. 非 apb-coding 会话不显示 chip、不响应 Alt+M；
5. resume 会话后模式保持上次状态。
