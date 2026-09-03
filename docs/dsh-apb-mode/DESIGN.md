# dsh-apb-mode 设计思路（Design Approach）

> 与 `DESIGN-GOALS.md`（目标）、`IMPLEMENTATION.md`（实现）配套。
> 本文记录"为什么这样设计"——分层、复用与取舍。

## 一、关键洞察：宿主已有真权限，不必自造

先查清现状再设计。DSH 宿主本就有完整的分层权限体系：

- `sandbox` 文件沙箱三档：`read-only` / `workspace-write` / `danger-full-access`；
- `permissionPresets` 把 sandbox+approval 打包成档位，`set(session, preset)`
  会写 `permission/preset`、`sandbox/mode`、`approval/policy` 会话事件，
  模型上下文自动出现 "Current DSH file policy: …"；
- UI 已有 access-mode 控件与 `/permission` 命令。

结论：**ask/plan/build 应映射到宿主权限档位，而不是再发明一套"自觉只读"**。
这是与 v1 最大的设计分水岭——v2 的只读是能力级强制，不是提示级约束。

## 二、三层职责划分

| 层 | 载体 | 职责 |
| --- | --- | --- |
| 语义层 | `apb-coding` preset persona | 三模式语义、渐进小步工作法、重构纪律；不承载权限执行 |
| 状态/命令层 | host 插件 `@deepseek-ai/dsh-apb-mode` | logged 三值状态、`/apb` 命令、模式 section、`apbMode` 投影、调 `permissionPresets.set` |
| 表现层 | client 插件 `@deepseek-ai/dsh-client-ui-apb-mode` | composer chip、Alt+M、经 `/apb next` 命令通道驱动 |

plane 规则：host 插件发布 `apbMode` 服务 → 必须放在 **isolate realm**
（照 standard 中 plan-mode 的 `isolate: planMode` 先例），避免跨会话/跨预设碰撞；
它消费的 `permissionPresets`、`sessionProjections`、`commands` 都在宿主平面，
realm 内向上解析即可。client 插件是纯 UI（host 半面空 apply），经
`profiles/web/cordis.patch.yml` 注册为 loader 行，由 clientModules 扫描其
`dsh.client` 声明装载。

## 三、状态模型：logged 事件，不用镜像

参考 `dsh-plan-mode`：状态折叠自会话日志（`plan/mode` last-wins），
resume/fork 由日志重建。本插件同构：

- 事件：`apb/mode`，data `{ mode: "ask" | "plan" | "build" }`；
- fold：遍历 `session.events`，最后一个 `apb/mode` 生效，默认 `ask`；
- 投影：`sessionProjections.register({ key: "apbMode", … })` 把状态暴露成
  session projection，client 用 `useProjection("apbMode")` 读取。

## 四、"仅 APB 会话可见"用数据驱动，不做预设名判断

client chip 是全量注册的，但渲染与否取决于投影的 `enabled` 字段：

- projection 折叠本会话的 `agent-preset/selected` 事件
  （data 形如 `{ agentPreset: preset.id }`，注意字段名不是 `preset`）；
- `enabled = (preset === "apb-coding")`；
- 其它预设会话 → `enabled: false` → chip 返回 null、Alt+M 监听不挂载。

好处：client 不需要知道"哪些预设是 APB"，只要宿主侧有 `dsh-apb-mode`
且会话选了 apb-coding，UI 自然出现；反之自然消失。

## 五、模式→权限的联动时机

切换入口统一走 `/apb` 命令（chip 的点击与 Alt+M 都执行 `/apb next`，
模型侧也可直接用命令或对话切换）。命令 handler：

1. `session.append("apb/mode", { mode })` —— 记录语义状态；
2. `ctx.get("permissionPresets").set(session, MODE_PERMISSION[mode])` ——
   落执行层档位。

`MODE_PERMISSION = { ask: "read-only", plan: "read-only", build: "workspace-write" }`。
因为权限预设对 ask/plan 都是 read-only，二者差异只在语义层（persona + section）。

## 六、Prompt 注入最小化（去污染）

persona 去掉"每轮 [ask] 自报与规则复述"，改为：**从上下文 file-policy 行
判断当前模式**。host section 仅在非默认态给一行：

- `ask`：空（默认，零噪声）；
- `plan`：一行"产出计划，勿实现"；
- `build`：一行"执行已确认计划，可写"。

真正强制的是沙箱档位，prompt 只起语义导航作用——模型就算"不知道"模式，
ask/plan 下也写不了文件。

## 七、client bundle 手写策略

shipped client（如 ui-plan）是 `window.__ModuleLoader__.load({ id, factory })`
格式的打包产物，依赖 react 等 seed。本插件 client.js 按同格式手写：

- 只依赖 `require("react")`（createElement + hooks），不引 CSS/图标等，
  降低手写 bundle 的脆弱面；
- `exports.apply` 注册 `conversation.input.right` seat；
- `exports.inject = ["slots", "remote", "remote.commands"]`。

## 八、可迁移性设计

交付单元分为两个 DSH 概念：profile bundle `@deepseek-ai/dsh-apb` 负责 host/client
插件，由 `dsh plugin` 安装、升级和卸载；`apb-coding` 是独立 agent preset，负责
persona 与渐进纪律。bundle 不直接编辑用户的 profile patch，键位 HOTKEY 集中在
client.js 顶部常量，冲突可改。

## 九、风险与取舍备忘

- **宿主重启依赖**：新增/修改插件包与组合行需重启 DSH（Node ESM 模块缓存
  不热更新，web 宿主 HMR 禁用）。这是 DSH 插件机制约束，不是本插件缺陷；
  取舍是"一次性重启换取长期可用"，而非进程内热补丁。
- **build 档位**：默认 `workspace-write`（与宿主默认一致，超范围仍需 ask）；
  不擅自 `danger-full-access`，需要时改映射表。
- **与宿主 access-mode 控件并存**：二者都写同一 permission knob；手动切档
  只改档位不改 APB 语义，切 APB 模式会按映射覆盖档位（文档已注明）。
