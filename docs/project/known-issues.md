# 已知问题

优先级说明：P1 会破坏安装或核心权限承诺，应先修；P2 会造成状态、交互或维护风险。

## APB-001 [P1] 新会话默认 ask，但未初始化只读权限

- 现象：没有 `apb/mode` 事件时，mode fold 和 UI 都显示 `ask`，但插件没有调用
  `permissionPresets.set(session, "read-only")`。
- 影响：DSH profile 默认若为 `workspace-write`，用户看到 ask 仍可能实际可写。
- 位置：`dsh-apb-mode/lib/index.js` 的 `foldMode` 默认值、projection `init` 和命令入口。
- 验收：新建 APB 会话无需手动切换，真实 file policy 即为 `read-only`，写操作由
  沙箱拒绝。

## APB-002 [P1] 同模式操作无法重新同步权限

- 现象：`/apb ask` 在当前 fold 已是 ask 时直接返回；`ApbModeController.set` 也只在
  模式变化时调用权限服务。
- 影响：一旦 APB 状态与权限脱节，用户无法用同模式命令修复。
- 位置：`/apb` handler 的 `target === current` 分支和 controller `set` 方法。
- 验收：显式选择任一模式都幂等地应用其目标权限，结果反馈区分“模式未变”和
  “权限已同步”。

## APB-003 [P1] 统一 bundle 与 preset 的包名未闭环

- 现象：标准安装只提供 `@deepseek-ai/dsh-apb`，但
  `apb-coding/agent.cordis.yml` 仍挂载 `@deepseek-ai/dsh-apb-mode`。
- 影响：bundle 可成功安装，preset 挂载仍可能因旧包不存在而失败；完整产品没有
  可复现安装路径。
- 位置：根 `package.json`、`cordis.patch.yml` 与 preset 的 `apb-mode` 行。
- 验收：tarball 安装后只存在一个包名，preset 能在全新隔离 `DSH_HOME` 中发现并
  挂载，卸载后不残留包层或无效 preset 引用。

## APB-004 [P2] APB plan 与 DSH 原生 plan 是独立状态机

- 现象：preset 同时包含 APB mode 和 `@deepseek-ai/dsh-plan-mode`。
- 影响：APB 可显示 build 而原生 plan 仍禁止实施，或 APB 显示 plan 而原生 plan
  关闭；页面也可能出现两个模式入口。
- 位置：`apb-coding/agent.cordis.yml` 的 `apb` 与 `planning` 两组。
- 验收：对用户只暴露一个 plan 状态和一个切换入口，prompt、权限和 UI 同步变化。

## APB-005 [P2] APB 状态与真实权限可长期脱节

- 现象：原生权限控件可独立修改权限；`/apb status` 只输出
  `MODE_PERMISSION[current]` 的静态映射。
- 影响：状态查询和 UI 无法证明有效权限，核心权限事实来源不可信。
- 位置：host command、projection 和 permission preset 交互。
- 验收：status 同时报告 APB 模式、目标权限和有效权限；发生偏差时按明确策略修复
  或向用户报警。

## APB-006 [P2] UI 吞掉切换失败且快捷键可重复提交

- 现象：`cycle()` 返回错误字符串，但 `ApbModeChip` 不显示；keydown 未过滤
  `event.repeat`，也未以可靠锁阻止上一次请求完成前再次提交。
- 影响：命令缺失、挂载失败或远程调用失败时用户无反馈，长按 Alt+M 可能跳过模式。
- 位置：`dsh-client-ui-apb-mode/lib/client.js`。
- 验收：错误在 chip 附近可见；点击和键盘共享单一并发锁；重复 keydown 不发请求。

## APB-007 [P2] 缺少自动化与端到端验收

- 现象：仓库没有测试文件，真实 host、浏览器、恢复和沙箱拒写未验证。
- 影响：结构或 DSH 版本变化后无法及时发现回归。
- 验收：覆盖 host 纯函数/命令、client 契约、隔离安装卸载，并至少有一条真实 DSH
  web 会话的 E2E 路径。

## 已关闭问题

### APB-000 [已关闭] 自定义复制安装无法可靠升级和卸载

- 原因：旧 `install.ps1` 对已存在目录执行递归复制，会产生嵌套目录并保留旧版本。
- 处理：删除复制脚本，改为带 `dsh.bundle.patch` 的单一
  `@deepseek-ai/dsh-apb` 包，由 `dsh plugin` 和 pnpm 管理。
- 证据：隔离 profile 的 tarball add、重复 add、dump-config 和 remove 已通过。
