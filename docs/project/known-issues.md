# 已知问题

优先级说明：P1 会破坏安装或核心权限承诺，应先修；P2 会造成状态、交互或维护风险。

## APB-006 [P2] UI 吞掉切换失败且快捷键可重复提交

- 现象：`cycle()` 返回错误字符串，但 `ApbModeChip` 不显示；keydown 未过滤
  `event.repeat`，也未以可靠锁阻止上一次请求完成前再次提交。
- 影响：命令缺失、挂载失败或远程调用失败时用户无反馈，长按 Alt+M 可能跳过模式。
- 位置：`client/lib/client.js`。
- 验收：错误在 chip 附近可见；点击和键盘共享单一并发锁；重复 keydown 不发请求。

## APB-007 [P2] 缺少自动化与端到端验收

- 现象：仓库没有测试文件，真实 host、浏览器、恢复和沙箱拒写未验证。
- 影响：结构或 DSH 版本变化后无法及时发现回归。
- 验收：覆盖 host 纯函数/命令、client 契约、隔离安装卸载，并至少有一条真实 DSH
  web 会话的 E2E 路径。

## 已关闭问题

### APB-011 [已关闭（代码）] 新建会话无法识别 apb-coding 预设导致模式芯片不显示

- 现象：新建会话选中「APB 渐进编码助手」后，composer 右侧不显示 `APB·ask` 模式芯片，
  权限控件停留在 `Workspace Write` 而非默认的只读 `ask`。
- 原因：会话创建时 `composeAgent` 把预设写入**创建时不可变的 `session.header.agentPreset`**，
  并不追加 `agent-preset/selected` 事件；该事件只在会话**中途**通过 preset `select` API 切换时
  才追加。APB 的 `foldPreset()` 只扫描 `session.events`，漏读了 header，于是把新建会话
  误判为未启用 APB，`session-start` 不重置为 ask/read-only，`remoteGet` 返回 `enabled: false`。
- 处理：`foldPreset()` 改为接收完整 session，先扫 `events` 的 `agent-preset/selected`，再回退
  到 `header.agentPreset`，与 `dsh-agent-presets` 的 `resolveSessionPreset` 语义一致；全部
  调用点（session-start、systemPrompt context、`/apb` 命令、`set`、`remoteGet`、`remoteCycle`）
  同步改为传 session 对象。
- 代码验证：Node 语法检查通过；Host 由 nodemon 自动重启。尚未做真实会话 E2E 验收，
  仍由 APB-007 覆盖。

### APB-010 [已关闭（代码与开发环境运行验证）] link 环境下 APB Remote 返回 404

- 现象：开发 Profile 通过 `link:D:/mycode/dsh-apb` 加载插件时，浏览器显示
  `APB·错误`，`/api/apbMode/get` 返回 HTTP 404。
- 原因：APB 与 DSH Host 分别加载物理路径不同的 `dsh-typert-protocol`；旧的手工
  `Remote` 标记写入链接仓库模块实例的私有 `WeakMap`，Host Gateway 无法从自己的模块
  实例读取这些标记。
- 处理：移除手工装饰器标记，增加 `exports["./typert"]` 和
  `host/lib/typert.host.js`，由 DSH Typert Loader 把静态接口清单注册到宿主 Registry。
- 已通过：manifest 校验、Node 语法、tarball 内容、开发 Profile 启动；两个 Remote URL
  已由 404 变为协议响应，完整 `apbMode/get` RPC 返回 `ok: true`；浏览器新会话页不再显示
  `APB·错误`，控制台无新增错误。
- 未执行：APB preset 会话中的 ask → plan → build 与权限联动完整 E2E，仍由 APB-007
  覆盖。

### APB-009 [已关闭（代码；旧日志恢复已验证）] 自定义模式事件污染历史并导致会话无法加载

- 现象：`apb/mode` 未携带 `ignorable`，DSH 重启读取持久日志时将其视为未知必需事件，
  抛出 `SessionFormatUnsupportedError`。
- 影响：复用调试 `DSH_HOME` 时，写过 APB 模式的会话历史不可用。
- 最终处理：APB mode 明确定义为当前 Host 进程中的瞬时控制档位。Host 以
  `WeakMap<Session, Mode>` 隔离活动会话状态，不再写入、折叠或投影 `apb/mode`；恢复、
  重新挂载和新建 APB 会话均安全回到 `ask`。客户端改用 `apbMode/get|cycle` Remote
  接口，不再依赖 session projection 或通过按钮生成 `/apb next` 命令历史。
- 迁移验证：默认调试 `DSH_HOME` 中 3 个旧 session 文件的 34 条既有 `apb/mode`
  已补齐顶层标记；迁移脚本重复执行时变更数为 0。重启 DSH 后，原先报错的
  “非对话框式交互工作方式探讨”会话可在 Web GUI 正常打开，页面不再出现
  `SessionFormatUnsupportedError` 或“历史加载失败”。迁移前日志保留在
  `.debug/backups/sessions-before-apb-ignorable/`。
- 运行验证：真实 DSH 中切换到 `build` 后刷新页面仍读取 Host 当前值并保持
  `Workspace Write`；停止并重启 Host 后，同一旧会话回到 `ask`/`Read Only`。撤回临时的
  DSH `Session.append(..., { ignorable: true })` 扩展后再次启动，旧会话加载、ask 状态和
  ask → plan 切换仍正常，证明新实现不依赖核心补丁。

### APB-008 [已关闭（代码）] 模式切换会改写系统提示词

- 现象：host 通过动态 `systemPrompt.section` 注入 plan/build 规则，切换模式会产生
  `System Prompt Updated`，并重复 preset persona 已经定义的模式语义。
- 影响：会话状态与稳定系统规则混在一起，模式切换会改变 request header。
- 处理：移除动态 prompt section；三模式长期定义固定在 preset persona，host 每次请求
  通过 runtime context 提供“当前模式 + 当前行动目标”，真实读写限制仍由
  `permissionPresets` 强制。
- 代码验证：host/client 语法、diff whitespace、tarball dry-run、隔离 profile refresh、
  安装后导出和静态引用检查均已通过；三个模式只生成简短 runtime context。
- 尚未验证：真实 DSH 轨迹中切换模式不再出现 `System Prompt Updated`，改为 context
  snapshot 更新，仍由 APB-007 的端到端验收覆盖。

### APB-005 [已关闭（代码）] APB preset 切入时权限未立即同步

- 现象：在已经运行的会话中切入 `apb-coding` preset 时，右侧 APB 状态立即出现，
  但左侧 Host 权限未在同一事件中同步。
- 影响：切入 APB 后到下一次显式 APB 命令之间，模式和权限短暂不一致。
- 位置：`agent-preset/selected` 事件与 permission preset 初始化的衔接。
- 处理：监听 `session/event` 中的 `agent-preset/selected`，切入 `apb-coding` 后按当前
  APB 模式立即调用 `permissionPresets.set()`；仍保留 `session-start`、`/apb` 和服务
  方法的既有同步逻辑。
- 尚未验证：真实左侧权限控件刷新仍由 APB-007 的端到端验收覆盖。

### APB-003 [已关闭（代码）] bundle、host、client 与 preset 边界混乱

- 处理：将内部目录重命名为 `host/` 和 `client/`，将 preset 移至
  `presets/apb-coding/`；根包仍统一为 `@deepseek-ai/dsh-apb`。
- 挂载策略：host/client 由 profile bundle 各挂载一次，preset 只提供 agent-plane
  组合，不再把内部 host 目录名当作独立包引用。
- 代码验证：manifest、patch、preset 和调试脚本的旧路径/旧包名已移除；tarball
  dry-run 已通过。
- 尚未验证：全新隔离 `DSH_HOME` 的 preset 冷启动、真实挂载和卸载后残留检查。

### APB-004 [已关闭（代码）] APB plan 与 DSH 原生 plan 重复

- 处理：移除 APB preset 自己挂载的 `@deepseek-ai/dsh-plan-mode`、`plan/mode`
  状态和 `exit_plan_mode` 入口；DSH Web 的后置 patch 已将 dsh-base 的 Host 层
  `plan-mode` 行禁用；APB preset persona 固定提供模式规则，host 提供当前模式的 runtime
  context、只读权限、`/apb build` 确认切换和 UI。
- 代码验证：实际 `dsh --profile web --dump-config` 已显示 `plan-mode`、`tool-fs` 和
  `tool-fs-search` 在 Web Host 层为 `disabled: true`；host/client 语法检查已通过。
- 尚未验证：真实 DSH 会话中 plan → build 的完整交互和模型行为，仍由 APB-007 覆盖。

### APB-001 [已关闭（代码）] 新会话 ask 权限初始化

- 处理：在 `agent/session-start` 对 APB 会话重置进程内 `ask` 状态并调用
  `permissionPresets.set()`；不写模式初始化事件。
- 代码验证：host 文件语法检查已通过。
- 尚未验证：真实 DSH 会话启动后的 file policy 和沙箱拒写，仍由 APB-007 覆盖。

### APB-002 [已关闭（代码）] 同模式操作权限同步

- 处理：`/apb` 和 `ApbModeController.set` 无论模式是否变化都幂等应用目标权限；
  模式只更新 Host 内存，不追加 `apb/mode` 事件，并在反馈中区分两种结果。
- 代码验证：host 文件语法检查已通过。
- 尚未验证：真实权限控件改档后的完整恢复链路，仍需 DSH E2E 验收。

### APB-000 [已关闭] 自定义复制安装无法可靠升级和卸载

- 原因：旧 `install.ps1` 对已存在目录执行递归复制，会产生嵌套目录并保留旧版本。
- 处理：删除复制脚本，改为带 `dsh.bundle.patch` 的单一
  `@deepseek-ai/dsh-apb` 包，由 `dsh plugin` 和 pnpm 管理。
- 证据：隔离 profile 的 tarball add、重复 add、dump-config 和 remove 已通过。
