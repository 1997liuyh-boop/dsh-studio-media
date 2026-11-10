# dsh-studio-media

Toonflow 原应用：无限画布、剧本分镜、角色素材与图片视频生成

本仓库根目录是可安装的 DSH 插件，版本 0.2.0。在插件市场添加本仓库 Git URL，安装后启用。先安装并启用 [工作室容器与共享运行时](https://github.com/1997liuyh-boop/dsh-studio-library)，再启用本插件。

Git 安装使用已提交的 lib/ 与静态资源。开发时执行 npm install --include=dev --legacy-peer-deps、npm run build、npm run check；构建只使用本仓库源码与公开依赖，不引用相邻工作库。

此插件连接原应用服务，服务与数据库需按下方说明单独配置；安装插件不会下载个人数据或自动安装上游应用。

## 功能与上游说明


Toonflow 原应用：无限画布、剧本分镜、角色素材与图片视频生成。本插件有独立的页面源码、宿主注册、构建与发布版本。

从库根目录构建：`node scripts/build.mjs media`。依赖 dsh-worktable ^0.6.0 与 dsh-studio-projects ^0.5.0。

来源及锁定提交见 [UPSTREAM.json](UPSTREAM.json)。后端保持独立运行，适配补丁在 patches，不能只安装卡片包就获得完整生成服务。
