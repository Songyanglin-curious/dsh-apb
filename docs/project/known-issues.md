# 已知问题

优先级说明：P1 会破坏安装或核心权限承诺，应先修；P2 会造成状态、交互或维护风险。

## APB-005 [P2] APB 状态与真实权限可长期脱节

- 现象：原生权限控件可独立修改权限；`/apb status` 虽已报告目标权限和有效权限，
  但外部改档后不会立即自动纠正 APB 模式。
- 影响：在下一次 APB 会话激活或显式模式命令前，模式和有效权限仍可能暂时脱节。
- 位置：host command、projection 和 permission preset 交互。
- 验收：status 同时报告 APB 模式、目标权限和有效权限；发生偏差时按明确策略修复
  或向用户报警。

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
  `plan-mode` 行禁用；APB host 统一提供自己的 plan prompt、只读权限、`/apb build`
  确认切换和 UI。
- 代码验证：实际 `dsh --profile web --dump-config` 已显示 `plan-mode`、`tool-fs` 和
  `tool-fs-search` 在 Web Host 层为 `disabled: true`；host/client 语法检查已通过。
- 尚未验证：真实 DSH 会话中 plan → build 的完整交互和模型行为，仍由 APB-007 覆盖。

### APB-001 [已关闭（代码）] 新会话 ask 权限初始化

- 处理：在 `agent/session-start` 对 APB 会话按当前模式调用
  `permissionPresets.set()`；没有模式事件时记录隐式 `ask` 事件。
- 代码验证：host 文件语法检查已通过。
- 尚未验证：真实 DSH 会话启动后的 file policy 和沙箱拒写，仍由 APB-007 覆盖。

### APB-002 [已关闭（代码）] 同模式操作权限同步

- 处理：`/apb` 和 `ApbModeController.set` 无论模式是否变化都幂等应用目标权限；
  只有模式变化时才追加 `apb/mode` 事件，并在反馈中区分两种结果。
- 代码验证：host 文件语法检查已通过。
- 尚未验证：真实权限控件改档后的完整恢复链路，仍需 DSH E2E 验收。

### APB-000 [已关闭] 自定义复制安装无法可靠升级和卸载

- 原因：旧 `install.ps1` 对已存在目录执行递归复制，会产生嵌套目录并保留旧版本。
- 处理：删除复制脚本，改为带 `dsh.bundle.patch` 的单一
  `@deepseek-ai/dsh-apb` 包，由 `dsh plugin` 和 pnpm 管理。
- 证据：隔离 profile 的 tarball add、重复 add、dump-config 和 remove 已通过。
