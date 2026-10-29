# OCLive 工作区伴随插件

为 [OCLive VS Code 核心扩展](https://github.com/linkaiheng2233-cyber/oclive-vscode)增加角色日记、来信与可选的闲时提示。扩展 ID 为 `oclive.oclive-vscode-penetration`；这里的“penetration”指角色体验进入工作区日常，不是网络安全渗透工具。

An optional companion plugin for OCLive VS Code. The core extension provides chat and the Host API; this plugin adds diary, letter and idle-reminder features.

## 安装

1. 从[核心扩展发布页](https://github.com/linkaiheng2233-cyber/oclive-vscode/releases)获取 `.vsix`，在 VS Code 的“从 VSIX 安装”中安装。
2. 从[本插件发布页](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration/releases/tag/v0.1.0)获取插件 `.vsix`。
3. 配置核心扩展的角色与可用后端，再按需要启用本插件功能。

当前公开安装包为 `v0.1.0`。核心扩展与本插件独立发布，请分别核对版本说明；只安装本插件不能独立运行角色。

## 使用

命令面板中可找到 **Append to Diary**、**Write Letter**、**Reveal .oclive Folder** 和设置入口。默认日记路径为 `.oclive/{roleId}/diary.md`；自动记录、闲时提示等开关以 [package.json](package.json) 中的配置为准。

工作区写入经核心扩展的 Host API 和授权路径处理；具体实现见 [src/extension.ts](src/extension.ts)。

## 源码开发

本插件与 [oclive-vscode-host](https://github.com/linkaiheng2233-cyber/oclive-vscode-host) 使用同级 `file:` 依赖。先按契约包说明构建它，再在本仓运行：

```bash
npm ci
npm run compile
npm run test:unit
npm run package
```

[变更记录](CHANGELOG.md) · [Issue](https://github.com/linkaiheng2233-cyber/oclive-vscode-penetration/issues) · [Host API 文档](https://github.com/linkaiheng2233-cyber/oclive-vscode/blob/master/docs/HOST_API_V1.md)
