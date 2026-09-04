# dsh-apb

面向 DeepSeek Harness（DSH）的 Ask / Plan / Build 渐进编码扩展。项目由一个
标准 profile bundle 和一个独立的 `apb-coding` agent preset 组成。

> 始终限制 AI 推进速度，让实现、理解、重构一层一层递归展开”这一部分

> 当前状态：**重构中，不建议作为可靠权限插件投入日常使用。** 标准 bundle 的
> 安装、升级和卸载链路已经建立，默认只读和同模式同步已完成代码修复，但真实
> DSH/E2E 验收、plan 流程和 preset 生命周期仍未闭环。详见[项目状态](docs/project/status.md)和
> [已知问题](docs/project/known-issues.md)。

## 文档入口

- [文档总览](docs/index.md)
- [安装、升级与卸载](docs/guide/installation.md)
- [本地开发与热更新使用说明](docs/guide/apb-local-development-usage.md)
- [本地开发环境设计思路](docs/architecture/apb-local-development-design.md)
- [DSH 插件架构与模块关系](docs/architecture/dsh-plugin-architecture-notes.md)
- [架构与运行链路](docs/architecture/overview.md)
- [重构路线图](docs/project/roadmap.md)

## 仓库组成

| 路径                                     | 作用                                         |
| ---------------------------------------- | -------------------------------------------- |
| `package.json`、`cordis.patch.yml`   | `@deepseek-ai/dsh-apb` 标准 profile bundle |
| `host/lib/index.js`                    | DSH Host：瞬时状态、命令、Remote 与权限联动  |
| `host/lib/typert.host.js`              | 由 DSH Typert Loader 注册的 Host Remote 接口清单 |
| `client/lib/client.js`                 | DSH web client：composer chip 与 Alt+M       |
| `presets/apb-coding/`                  | 独立 agent preset，不重复挂载 APB host       |
| `scripts/dev.ps1`                     | `apb-dev` Profile、仓库 link 与热更新入口    |

## 本地开发

```powershell
pnpm install
pnpm dev
```

该命令使用共享 `DSH_HOME` 下的独立 `apb-dev` Profile，不修改日常 `web` Profile。
Client 变化由 DSH 内建 HMR 更新，Host、bundle patch 和 preset 变化会重启 DSH 进程。

开发与验证基线为 DSH `0.1.1-rc.2`。
