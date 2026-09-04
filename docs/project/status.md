# 项目状态

更新日期：2026-09-04。

## 总体结论

项目目前是“已建立标准包壳的可试用原型”，不是可靠的权限插件。profile bundle
的包管理生命周期已经标准化，但完整的 bundle + preset 集成和权限可信性仍未闭环。

## 已完成

- 原 APB v2 内容已经迁入独立 Git 仓库并纳入版本管理。
- 项目说明文档已集中到 `docs/`，并建立分层索引。
- 单一发布包名确定为 `@deepseek-ai/dsh-apb`。
- 根 manifest 已声明 `dsh.bundle.patch`、`host/` 入口和 `./client` 入口。
- 目录边界已整理为 `host/`、`client/` 和 `presets/apb-coding/`；host/client 由 bundle
  挂载，preset 不再重复挂载 APB host。
- 自定义复制式 `install.ps1` 已删除。
- Bundle 安装、重复安装、组合输出和卸载已在隔离 `DSH_HOME` 中验证。
- Tarball 内容通过 `pnpm pack --dry-run` 检查；Node 源码通过语法检查。
- 提供独立 `apb-dev` Profile 的仓库链接开发入口；Client 使用 DSH 内建 HMR，Host、
  bundle patch 和 preset 变化触发整进程重启。
- `apb-dev` 的 Profile 初始化、仓库 link、preset 组合、Web/Client 资源加载、Client
  rebuilt 事件和 Host 自动重启已在 DSH `0.1.1-rc.2` 上验证；日常 `web` Profile 未变。
- 保留隔离 `DSH_HOME` 的 tarball 发布包验证脚本，不修改正式 DSH 用户目录。

## 未完成或未验证

| 项目 | 状态 | 影响 |
| --- | --- | --- |
| preset 引用统一包与目录重构 | 代码已完成，冷启动 E2E 未验证 | 旧路径/旧包名已移除；真实 preset 挂载仍需验证 |
| 新会话 ask 权限初始化 | 代码已完成，E2E 未验证 | 已在 `agent/session-start` 校准；真实 file policy 仍需验证 |
| 同模式权限重新同步 | 代码已完成，E2E 未验证 | `/apb` 与 controller 均改为幂等设置权限 |
| APB preset 切入时权限同步 | 代码已完成，E2E 未验证 | 已监听 `agent-preset/selected`；真实左侧权限控件刷新仍需验证 |
| APB plan 单一状态源 | 代码已完成，E2E 未验证 | preset 内原生 plan 已移除，DSH Web 后置 patch 已禁用 dsh-base 的 `plan-mode`；真实 plan/build 交互仍需验证 |
| 模式与系统提示词分离 | 代码已完成，E2E 未验证 | 模式定义保持静态，每次请求由 runtime context 注入当前模式及行动目标；真实轨迹仍需验证 |
| APB 瞬时模式状态 | 代码与浏览器链路已验证 | Host WeakMap 为唯一状态源；`./typert` 静态 artifact 已消除 `link:` 环境下的 Remote 404；完整 get RPC 与浏览器无错误加载已通过；Host 重启后同一旧会话回到 ask/read-only |
| UI 错误与并发保护 | 未完成 | 切换失败无可见反馈，快捷键可重复提交 |
| 自动化测试 | 未完成 | 当前仓库没有测试文件或持续集成 |
| 开发调试链路 | 已验证到模块加载与更新事件 | 浏览器内 Client 卸载/重挂仍未自动验收 |
| 真实 DSH host 挂载 | 开发与隔离 profile 已验证 | `link:` 下 Host Remote 路由和 client module 可加载，tarball 内容包含 Typert artifact；正式用户 profile 未改动 |
| 浏览器交互 | 部分验证 | chip 的 ask → plan → build、权限联动和刷新已通过；Alt+M 与失败提示尚未做端到端验收 |
| resume/fork 与权限重置 | 部分验证 | Host 重启后恢复同一会话已回 ask/read-only；fork 尚未验证 |
| ask/plan 沙箱拒写 | 未验证 | 核心安全承诺尚无端到端证据 |

## 当前可接受的使用范围

- 可以用于继续开发、包结构验证和隔离环境实验。
- 不应用于依赖 ask/plan 阶段强制只读的真实项目。
- 不应把 `/apb status` 或 chip 文本当作有效权限证明。

问题细节见[已知问题](known-issues.md)，处理顺序见[重构路线图](roadmap.md)。
