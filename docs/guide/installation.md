# 安装、升级与卸载

## 适用范围

本页说明 `@deepseek-ai/dsh-apb` profile bundle 的标准包管理方式。DSH
`0.1.1-rc.2` 的 `dsh plugin` 会把命令转发给目标 profile 中的 pnpm，并根据已安装
包的 `dsh.bundle.patch` 自动维护 `dsh.profile.bundles`。

> 完整功能暂不建议安装使用。bundle 生命周期已经可用，但仓库中的
> `apb-coding` preset 仍引用旧包名，且“默认 ask 未落实只读”等权限问题尚未修复。参见
> [已知问题](../project/known-issues.md)。

## 两类交付物

| 交付物 | 当前管理方式 | 生命周期 |
| --- | --- | --- |
| profile bundle `@deepseek-ai/dsh-apb` | `dsh plugin --profile web ...` | 已标准化 |
| agent preset `apb-coding` | `$DSH_HOME/.agent-presets/apb-coding/` | 尚无仓库内标准安装/卸载流程 |

安装 bundle 不会自动安装 preset，卸载 bundle 也不会删除 preset。二者不能当作同一种
DSH 对象处理。

## 开发目录安装

在仓库根目录执行：

```powershell
dsh plugin --profile web add .
```

相对路径会由 DSH 锚定到命令调用目录。该方式通常形成 pnpm 文件链接，适合本机开发，
不作为跨机器交付或卸载完整性验收的依据。

## Tarball 或 registry 安装

先生成交付包：

```powershell
pnpm pack --pack-destination <输出目录>
```

再安装生成的 tarball：

```powershell
dsh plugin --profile web add <输出目录>\deepseek-ai-dsh-apb-<版本>.tgz
```

发布到 registry 后可使用包名安装：

```powershell
dsh plugin --profile web add @deepseek-ai/dsh-apb
```

每次发布应递增 `package.json` 中的版本。不要直接复制文件到 profile 的
`node_modules`，也不要手工维护 `dsh.profile.bundles`。

## 升级

Registry 依赖使用：

```powershell
dsh plugin --profile web update @deepseek-ai/dsh-apb
```

Tarball 交付使用新版本 tarball 再次执行 `add`。完成后重启 DSH，运行中的 host
不会自动重新装载已经缓存的 ESM 模块。

## 卸载

```powershell
dsh plugin --profile web remove @deepseek-ai/dsh-apb
```

命令成功后，DSH 会从 profile 依赖和 `dsh.profile.bundles` 中移除该包。它不会删除
`$DSH_HOME/.agent-presets/apb-coding/`，preset 清理目前需要单独处理。

## Bundle 验收

安装后检查组合结果：

```powershell
dsh --profile web --dump-config
```

输出应包含 bundle 包名 `@deepseek-ai/dsh-apb` 及 patch 行 `apb-mode`。再检查目标
profile 的 `package.json`，其依赖和 `dsh.profile.bundles` 应同时包含该包。

卸载后重复检查，以上两处都不应再包含该包。tarball 安装/卸载已在隔离
`DSH_HOME` 中通过；真实浏览器挂载和权限行为尚未验收。

## 常见边界

- 需要 pnpm 位于 `PATH`；`dsh plugin` 本身只是管理和协调层。
- `add .` 是开发链接；交付验收优先使用 tarball 或 registry 包。
- 修改 bundle 后必须重启 DSH，再刷新浏览器。
- 当前不要以“chip 出现”推断权限已同步；应检查真实 permission/file policy。
