# dsh-apb-mode 实现思路（Implementation Notes）

> 与 `DESIGN-GOALS.md`（目标）、`DESIGN.md`（设计）配套。
> 本文按"人如何一步步实现"的顺序记录实际落地过程、关键代码点、
> 验证手段与踩过的坑。

## 一、落地步骤（按"先问清 → 再小步实现 → 验证"推进）

### 1. 只读探明宿主机制（不做假设）
以 shipped 包为蓝本读源码，不靠猜：
- `dsh-plan-mode`：Service 形态、logged 状态折叠、prompt section、
  sessionProjections 注册、commands.register、session.append 用法；
- `dsh-permission-presets`：预设表、`set(session,name)` 的写路径
  （append permission/preset + setSandboxMode + setApprovalPolicy）；
- `dsh-client-ui-plan`：client bundle 的 `__ModuleLoader__` 格式、
  `conversation.input.plan` seat 注册、`remote.commands.execute` 命令通道；
- cordis 加载器与 client-modules：插件导出形态、`dsh.client` 声明、
  seed/require 解析规则。

### 2. host 插件（`lib/index.js`）
要点与关键代码路径：

- `class ApbModeController extends Service`，构造 `super(ctx, "apbMode")`
  发布服务；插件**必须声明 `static inject = ["systemPrompt"]`**——
  否则访问 `ctx.systemPrompt` 会被 cordis Guard 拒绝（首个真实报错：
  `cannot get property "systemPrompt" without inject`）。
- `sessionProjections.register({ key: "apbMode", stateSchema, init, apply,
  wire, stateVersion })`：state/view 用 zod schema（registry 内部调
  `.parse()`）；`apply` 处理 `apb/mode` 与 `agent-preset/selected` 事件，
  view 输出 `{ enabled, mode }`。
- `commands.register({ name: "apb", … })`：handler 里
  `session.append("apb/mode", { mode })` 后
  `ctx.get("permissionPresets").set(session, MODE_PERMISSION[mode])`。
- section：`systemPrompt.section({ name: "apb:policy", order: 90,
  text })`，按 fold 出的模式返回一行（ask 返回空）。
- 纯函数（可独立单测）：`foldMode(events)`、`foldPreset(events)`、
  `modeSection(mode)`、常量 `MODES / DEFAULT_MODE / APB_PRESET /
  MODE_PERMISSION`。

### 3. preset 挂载（`agent.cordis.yml`）
新增 isolate realm 组（照 standard 的 plan-mode 先例）：

```yaml
- id: apb
  name: cordis:group
  group: true
  isolate:
    apbMode: true
  config:
    - id: apb-mode
      name: '@deepseek-ai/dsh-apb-mode'
```

persona 精简：去掉"每轮回复以 [ask] 开头"等自报式文本，改为"从
file-policy 行判断当前模式"。

### 4. client 插件（`lib/client.js` + `lib/index.js`）
- `index.js`：host 半面空 `apply()`（纯 UI 插件，host 仅占 loader 位）；
- `client.js`：手写 `window.__ModuleLoader__.load({ id, factory })`；
  组件 `ApbModeChip` 读 `useProjection("apbMode")`，`enabled!==true` 时
  返回 null（不渲染也不挂 Alt+M 监听）；点击与 Alt+M 都执行
  `ctx.remote.commands.execute(sessionId, "/apb next", [])`。
- 键位：`HOTKEY = { key: "m", altKey: true, … }` 集中于文件顶部。

### 5. profile 组合注册
`profiles/web/cordis.patch.yml`：

```yaml
- insert:
    - id: ui-apb-mode
      name: '@deepseek-ai/dsh-client-ui-apb-mode'
```

## 二、验证手段（层层递进）

1. **模块级**：独立 Node 进程 import 两个插件包——校验 default 导出类型、
   static inject、导出清单、纯函数行为（foldMode/MODE_PERMISSION/
   modeSection）。
2. **逻辑级（全路径）**：用 mock cordis ctx 实例化 host Service，驱动
   `/apb` 命令 handler：验证 `status`、`build` 切换（append 事件 +
   permissionPresets.set('workspace-write')）、`next` 循环、fold 结果。
3. **client 契约级**：在 Node 中模拟 `window.__ModuleLoader__` 执行
   client.js——验证注册 1 个 bundle、exports `{ apply, inject }`、仅依赖
   `react`。
4. **宿主 API 冒烟**：临时动态插件对真实宿主调用 `systemPrompt.section` /
   `sessionProjections.register` / `commands` / `permissionPresets.set`，
   并读取预设表（read-only / workspace-write / danger-full-access 均在）。
5. **loader 解析路径**：用 `createRequire(profile web 根)` 对两个包
   `require.resolve(package.json)`，确认 host 包可解析、client 包
   `dsh.client` 声明 + `./client` bundle 文件存在。
6. **YAML 结构**：用宿主同款 `!!js` tag 解析 preset 组成（17 行含新增
   apb 组）与 profile 补丁（1 个 insert 行），结构正确。
7. **挂载验证（standingKeyFor）**：见下"遗留事项"。

## 三、踩过的坑（供后续维护）

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| `cannot get property "systemPrompt" without inject` | Service 用 `ctx.systemPrompt` 却未声明注入 | 加 `static inject = ["systemPrompt"]` |
| 改了包文件后宿主仍报旧错 | Node ESM 模块缓存；web 宿主 HMR 禁用（`hmr: disabled: true`） | 必须重启 DSH 宿主进程装载 |
| `agent-preset/selected` 取错字段 | data 形如 `{ agentPreset: id }`（非 `preset`） | 用 `event.data.agentPreset` |
| projection schema 手写对象不行 | registry 内部调用 `stateSchema.parse()` / `viewSchema.parse()` | 用 zod schema |
| 手写 bundle 直接 require 其它 UI 包 | seed/require 表有限，易崩 | 只依赖 `react`，不引 CSS/图标等 |
| `cordis_define` 的 idPrefix 报错 | 只允许 3–6 位纯小写字母 | 用纯字母前缀 |

## 四、遗留事项（需要宿主重启后完成）

- **触发**：重启 DSH（关闭启动 cmd 窗口后重跑 `dsh web`），刷新浏览器。
- **验证清单**：
  1. `standingKeyFor('apb-coding')` 挂载通过（隔离 realm + 服务发布无冲突）；
  2. 新建 apb-coding 会话出现 APB chip（仅该预设会话）；
  3. Alt+M / 点击 / `/apb` 三种方式循环 ask→plan→build；
  4. 上下文 file-policy 随模式在 read-only / workspace-write 间真实切换，
     ask/plan 下模型写文件被沙箱拒绝；
  5. 非 apb-coding 会话无 chip、不响应 Alt+M；
  6. resume 会话模式保持。
- 若第 1 步失败，按 `MOUNT ERROR` 信息就近修（结构已离线验证，预期可过）。

## 五、文件位置速查

| 内容 | 路径 |
| --- | --- |
| profile bundle | `${DSH_HOME}/profiles/web/node_modules/@deepseek-ai/dsh-apb/` |
| host/client bundle 内容 | `@deepseek-ai/dsh-apb` 的 package exports 与 `dsh.bundle.patch` |
| profile manifest | `${DSH_HOME}/profiles/web/package.json`，由 `dsh plugin` 维护 |
| preset（persona + 挂载行） | `${DSH_HOME}/.agent-presets/apb-coding/` |
