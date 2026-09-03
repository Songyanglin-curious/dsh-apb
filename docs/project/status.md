# 项目状态

更新日期：2026-09-03。

## 总体结论

项目目前是“已建立标准包壳的可试用原型”，不是可靠的权限插件。profile bundle
的包管理生命周期已经标准化，但完整的 bundle + preset 集成和权限可信性仍未闭环。

## 已完成

- 原 APB v2 内容已经迁入独立 Git 仓库并纳入版本管理。
- 项目说明文档已集中到 `docs/`，并建立分层索引。
- 单一发布包名确定为 `@deepseek-ai/dsh-apb`。
- 根 manifest 已声明 `dsh.bundle.patch`、host 入口和 `./client` 入口。
- 自定义复制式 `install.ps1` 已删除。
- Bundle 安装、重复安装、组合输出和卸载已在隔离 `DSH_HOME` 中验证。
- Tarball 内容通过 `pnpm pack --dry-run` 检查；Node 源码通过语法检查。

## 未完成或未验证

| 项目 | 状态 | 影响 |
| --- | --- | --- |
| preset 引用统一包 | 未完成 | `apb-coding` 仍挂旧包名，完整挂载可能失败 |
| 新会话 ask 权限初始化 | 未完成 | UI/状态可能是 ask，真实权限仍可写 |
| APB 与有效权限一致性 | 未完成 | status 和 chip 不能作为权限事实来源 |
| APB plan 与原生 plan 统一 | 未完成 | 两套模式可能互相冲突 |
| UI 错误与并发保护 | 未完成 | 切换失败无可见反馈，快捷键可重复提交 |
| 自动化测试 | 未完成 | 当前仓库没有测试文件或持续集成 |
| 真实 DSH host 挂载 | 未验证 | 未证明 preset、service realm 和 client module 全链路可用 |
| 浏览器交互 | 未验证 | chip、Alt+M、错误展示未做端到端验收 |
| resume/fork 与权限恢复 | 未验证 | 仅从 logged 状态设计推断，缺少运行证据 |
| ask/plan 沙箱拒写 | 未验证 | 核心安全承诺尚无端到端证据 |

## 当前可接受的使用范围

- 可以用于继续开发、包结构验证和隔离环境实验。
- 不应用于依赖 ask/plan 阶段强制只读的真实项目。
- 不应把 `/apb status` 或 chip 文本当作有效权限证明。

问题细节见[已知问题](known-issues.md)，处理顺序见[重构路线图](roadmap.md)。
