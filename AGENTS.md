# oclive-vscode-penetration

官方 OCLive VS Code **渗透插件**（0.4+ 独立 vsix）。

- 依赖 **`oclive.oclive-vscode`** 核心扩展与 npm **`@oclive/vscode-host`**
- 命令前缀 **`oclive-penetration.*`**
- 主仓编排 SSOT 不变；当前分工见 [VS Code 插件模型](../oclive-vscode/docs/PENETRATION_PLUGIN_MODEL.md)，接入与写盘权限见 [宿主 API 契约](../oclive-vscode/docs/HOST_API_V1.md)。旧迁移过程不作为当前接口来源。
