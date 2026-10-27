# AI短剧工作台

Toonflow 原应用：无限画布、剧本分镜、角色素材与图片视频生成。本插件有独立的页面源码、宿主注册、构建与发布版本。

从库根目录构建：`node scripts/build.mjs media`。依赖 dsh-worktable ^0.6.0 与 dsh-studio-projects ^0.5.0。

来源及锁定提交见 [UPSTREAM.json](UPSTREAM.json)。后端保持独立运行，适配补丁在 patches，不能只安装卡片包就获得完整生成服务。
