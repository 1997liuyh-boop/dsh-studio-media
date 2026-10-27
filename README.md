# AI 短剧工作台

基于 Toonflow 的无限画布、剧本分镜、角色素材与图像视频生成；保留工作台聊天界面，通过受控桥接同步 dsh 模型、会话、运行状态和停止操作。

这是独立的工作室插件仓库：只维护 AI 短剧工作台，可以独立克隆、构建和发布。

## 来源与感谢

本项目配合 [1997liuyh-boop/deepseek-harness](https://github.com/1997liuyh-boop/deepseek-harness) 使用；该宿主 **fork 自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)**。感谢 DeepSeek 团队及上游贡献者。当前已验证的适配目标为 **dsh 0.2.1-rc.2（实验性）**，Windows 桌面端优先。

**独立服务与补丁适配**：本工作室基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app)。

上游锁定提交：30139c931e80476caa718b31684b86383c6e83ce。

感谢上游作者及贡献者提供的基础。本项目改动采用 MIT；内置或补丁涉及的上游许可与版权保持原文。完整来源见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [UPSTREAM.json](studios/media/UPSTREAM.json)。

## 依赖与构建

运行时依赖共享基础库中的 **dsh-worktable ^0.6.0** 和 **dsh-studio-projects ^0.5.0**。先安装容器和运行时，再安装本工作室；停用某个工作室不会删除其他工作室或用户数据。

共享依赖由 [dsh-studio-library](https://github.com/1997liuyh-boop/dsh-studio-library) 独立维护。构建本仓库不需要克隆其他工作室，packages/sdk 已保留固定协议快照。需要 Node.js 22 或更新版本、npm、Git。

```powershell
git clone https://github.com/1997liuyh-boop/dsh-studio-media.git
cd dsh-studio-media
npm ci --ignore-scripts
npm run build
npm run check
npm run pack
```

业务源码、studio.json 和插件 package.json 位于 studios/media。artifacts 生成 dsh-studio-media-0.2.0.tgz 与 SHA256 清单；GitHub Actions 也提供完整安装包产物。使用实际桌面应用自带的 dsh CLI，在容器和共享运行时之后执行 plugin --profile desktop add <tgz绝对路径>，随后重启宿主；网页端使用 web profile。

宿主必须具备工作室桥接适配，兼容声明以 studio.json 为准。卸载和升级不清空用户数据。

## 独立应用服务

本仓库包含工作室入口与适配补丁；Toonflow 的完整后端需要按上游要求独立部署，安装插件不会自动获得数据库和媒体生成服务。使用全新绝对目录准备锁定源码：

```powershell
node scripts/prepare-upstream.mjs media D:\studio-apps\Toonflow
```

该脚本检出 UPSTREAM.json 的提交，先执行 git apply --check 再应用补丁；已有目录不会覆盖。随后依照检出源码的 README 安装依赖、配置本机供应商并启动服务。

## 开发与更新

参见 [开发规范](CONTRIBUTING.md)、[插件说明](studios/media/README.md) 和 [工作室控制协议](packages/sdk/CONTROL.md)。上游提交固定记录在 UPSTREAM.json；更新时在新检出中重放适配、验证本工作室，再递增插件版本。SDK 快照通过 SDK-SNAPSHOT.json 追踪，宿主更新不代表已验证兼容。
