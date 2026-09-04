# 安装、升级与卸载

## Profile 约定

APB 不安装到日常 `web` Profile。推荐在同一个 `DSH_HOME` 中使用两套独立 Profile：

| 用途 | Profile | APB 来源 |
| --- | --- | --- |
| 日常开发 | `apb-dev` | `link:` 到本仓库 |
| 稳定使用 | `apb` | registry 或已验收的 tarball |

两个 Profile 只分别保存依赖清单和 bundle 组合；实际包内容由 pnpm 的内容寻址存储与链接
机制复用。它们共享 Home 级 Session、Settings 等数据，因此不要同时操作同一 Session。

## 两类交付物

| 交付物 | 管理方式 | 生命周期 |
| --- | --- | --- |
| profile bundle `@deepseek-ai/dsh-apb` | `dsh plugin --profile <name> ...` | 已标准化 |
| agent preset `apb-coding` | DSH preset roots | 独立于 bundle，正式交付流程尚未标准化 |

安装 bundle 不会自动安装 preset，卸载 bundle 也不会删除 preset。开发环境由
`scripts/apb-dev.patch.yml` 直接引用仓库 preset；稳定安装仍需单独部署 preset。

## 日常开发安装

推荐直接执行：

```powershell
pnpm dev:setup
```

等价的核心 DSH 操作为：

```powershell
dsh plugin --profile apb-dev add @deepseek-ai/dsh-web-app@0.1.1-rc.2
dsh plugin --profile apb-dev add link:D:/mycode/dsh-apb
```

仓库的 `devDependencies` 与运行时 `peerDependencies` 对齐，用来解决 Node 从链接源目录加载
APB 时的依赖解析问题。完整启动方式见[本地调试](debugging.md)。

## Tarball 或 registry 安装

先为稳定用途创建 Web Profile：

```powershell
dsh plugin --profile apb add @deepseek-ai/dsh-web-app@0.1.1-rc.2
```

安装本地 tarball：

```powershell
pnpm pack --pack-destination <输出目录>
dsh plugin --profile apb add <输出目录>\deepseek-ai-dsh-apb-<版本>.tgz
```

发布到 registry 后可使用包名：

```powershell
dsh plugin --profile apb add @deepseek-ai/dsh-apb
```

不要直接复制文件到 Profile 的 `node_modules`，也不要手工维护
`dsh.profile.bundles`。

## 升级与卸载

Registry 依赖升级：

```powershell
dsh plugin --profile apb update @deepseek-ai/dsh-apb
```

卸载 bundle：

```powershell
dsh plugin --profile apb remove @deepseek-ai/dsh-apb
```

卸载不会删除 preset 或 Home 级 Session/Settings。Tarball 交付应使用新版本包再次执行
`add`；运行中的 Host 不会自动装载已经缓存的 ESM 模块，应重启 DSH。

## 验收

```powershell
dsh --profile apb --dump-config
```

组合输出应包含 `@deepseek-ai/dsh-apb` 和 `apb-mode`；目标 Profile 的
`package.json` 中，依赖和 `dsh.profile.bundles` 也应同时包含该包。卸载后重复检查，以上
两处都不应再包含 APB。

Tarball 安装/卸载已在隔离 `DSH_HOME` 中通过；稳定 Profile 的 preset 正式交付、真实
浏览器挂载和权限沙箱仍未完成全量端到端验收。
