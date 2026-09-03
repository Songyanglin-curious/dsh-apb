# dsh-apb

面向 DeepSeek Harness（DSH）的 Ask / Plan / Build 渐进编码扩展。项目由一个
标准 profile bundle 和一个独立的 `apb-coding` agent preset 组成。

> 当前状态：**重构中，不建议作为可靠权限插件投入日常使用。** 标准 bundle 的
> 安装、升级和卸载链路已经建立，但默认只读、权限状态同步、原生 plan 冲突和
> preset 集成仍未解决。详见[项目状态](docs/project/status.md)和
> [已知问题](docs/project/known-issues.md)。

## 文档入口

- [文档总览](docs/index.md)
- [安装、升级与卸载](docs/guide/installation.md)
- [架构与运行链路](docs/architecture/overview.md)
- [重构路线图](docs/project/roadmap.md)

## 仓库组成

| 路径 | 作用 |
| --- | --- |
| `package.json`、`cordis.patch.yml` | `@deepseek-ai/dsh-apb` 标准 profile bundle |
| `dsh-apb-mode/lib/index.js` | APB 状态、命令、projection 与权限联动 |
| `dsh-client-ui-apb-mode/lib/client.js` | composer chip 与 Alt+M |
| `apb-coding/` | 独立 agent preset，尚未纳入 bundle 生命周期 |

开发与验证基线为 DSH `0.1.1-rc.2`。
