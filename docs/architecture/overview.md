# 架构与运行链路

## 概览

dsh-apb 试图在 DSH 中提供 Ask / Plan / Build 三态工作流。仓库包含两个不同生命周期
的对象：profile bundle 负责 host/client 插件，agent preset 负责 persona 和工具组合。
当前单一发布包是 `@deepseek-ai/dsh-apb`，开发基线为 DSH `0.1.1-rc.2`。

## 总体架构

```mermaid
flowchart LR
    CLI["dsh plugin"] --> PNPM["profile pnpm dependencies"]
    PNPM --> STACK["dsh.profile.bundles"]
    STACK --> PATCH["cordis.patch.yml"]
    PATCH --> HOST["@deepseek-ai/dsh-apb host entry"]
    HOST --> CMD["/apb command"]
    HOST --> PROJ["apbMode projection"]
    HOST --> PERM["permissionPresets"]
    HOST --> PROMPT["system prompt section"]
    HOST --> CLIENT["dsh.client ./client"]
    CLIENT --> CHIP["composer chip / Alt+M"]
    CHIP --> CMD
    PRESET["apb-coding preset"] -. independent lifecycle .-> HOST
```

Bundle patch 当前把 host 入口插入 web profile；同一个包通过 `exports["./client"]`
和 `dsh.client` 暴露浏览器模块。`apb-coding` 位于用户 preset 发现目录，未纳入
`dsh plugin` 生命周期。

## 关键组件

| 组件 | 文件 | 职责 |
| --- | --- | --- |
| Bundle manifest | `package.json` | 声明包入口、client 入口、bundle patch 和依赖 |
| Bundle patch | `cordis.patch.yml` | 向 profile 插入 `@deepseek-ai/dsh-apb` |
| Host controller | `dsh-apb-mode/lib/index.js` | 模式折叠、命令、projection、prompt 与权限写入 |
| Client module | `dsh-client-ui-apb-mode/lib/client.js` | chip、Alt+M 和 `/apb next` 请求 |
| Agent preset | `apb-coding/agent.cordis.yml` | persona、工具与原生 plan-mode 组合 |
| Preset metadata | `apb-coding/preset.yml` | preset 名称和说明 |

## 数据与控制流

### 正常切换

```mermaid
sequenceDiagram
    participant U as User
    participant UI as APB client
    participant C as /apb command
    participant S as Session log
    participant P as permissionPresets
    participant V as apbMode projection

    U->>UI: click chip or Alt+M
    UI->>C: execute /apb next
    C->>S: append apb/mode
    C->>P: set mapped preset
    S-->>V: fold mode event
    V-->>UI: enabled + mode
```

`ask`、`plan` 映射到 `read-only`，`build` 映射到 `workspace-write`。模式事件采用
last-wins 折叠；projection 同时折叠 `agent-preset/selected`，只在 preset id 为
`apb-coding` 时设置 `enabled: true`。

### 当前异常路径

- 没有 `apb/mode` 事件时，`foldMode` 和 projection 直接返回默认 `ask`，不会触发
  `permissionPresets.set`。
- 目标模式等于当前模式时，命令和服务方法提前返回，也不会重新同步权限。
- 用户从 DSH 原生权限控件改档时，不会产生 APB 模式事件。
- client 会生成失败字符串，但组件不渲染该值；快捷键也未阻止重复 keydown 或并发请求。

## 关键函数与状态

| 符号 | 当前行为 |
| --- | --- |
| `foldMode(events)` | 折叠最后一个合法 `apb/mode`，无事件时返回 `ask` |
| `foldPreset(events)` | 折叠最后一个 `agent-preset/selected` |
| `modeSection(mode)` | ask 为空，plan/build 注入一行提示 |
| `MODE_PERMISSION` | `ask/plan -> read-only`，`build -> workspace-write` |
| `/apb` handler | status 查询；显式模式或 next 切换；异模式时写状态和权限 |
| `ApbModeController.set` | 服务侧切换入口，与命令有相同的同模式短路问题 |
| `ApbModeChip` | 展示 projection 模式并发起 `/apb next` |

## 配置与包管理

- 根 `package.json#dsh.bundle.patch` 指向 `cordis.patch.yml`。
- 根 `package.json#dsh.client` 声明 web 平台和 client 注入依赖。
- `dsh plugin --profile web` 在目标 profile 中调用 pnpm，并按已安装依赖重新协调
  `dsh.profile.bundles`。
- 源码目录安装会形成开发链接；tarball/registry 是可复现交付边界。
- preset 默认发现目录为 `$DSH_HOME/.agent-presets`，与 profile bundle 分离。

## 非显然行为

1. `ask` 是折叠默认值，不是已写入的初始化状态，因此 UI 上的 ask 不代表权限事实。
2. `/apb status` 显示的是静态映射，不读取宿主当前有效权限。
3. client 是否显示由 host projection 决定，不是 client 自己读取 preset 名称。
4. Bundle 安装成功只证明 profile 层生效，不证明独立 preset 已安装或可挂载。

## 已知限制与修复方向

- 先修复 preset 对旧包名的引用，建立一个一致的挂载来源。
- 为新 APB 会话创建真实初始化事件并应用权限，且同模式命令也能执行幂等同步。
- 将有效权限纳入 status/projection，定义原生权限控件修改后的协调策略。
- APB plan 与 DSH 原生 plan-mode 必须合并为单一事实源或移除一个入口。
- UI 显示命令失败，并以 `event.repeat` 与同步锁阻止重复提交。

完整问题编号见[已知问题](../project/known-issues.md)。

## 扩展点

- 新增模式：同时调整 `MODES`、`MODE_PERMISSION`、projection schema、prompt 和 UI
  标签/颜色，并补迁移测试。
- 修改权限映射：优先改 `MODE_PERMISSION`，但必须同步状态一致性测试。
- 修改快捷键：调整 client 的 `HOTKEY`，并验证浏览器级冲突。
- 扩展 preset：保持 host-plane 与 agent-plane 服务边界；发布服务必须验证 isolate realm。
- 更换交付方式：不能绕过 `dsh.bundle.patch` 和 `dsh plugin` 的 profile 协调机制。
