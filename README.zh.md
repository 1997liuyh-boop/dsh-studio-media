# dsh-studio-media

[English](README.md)

## 仓库信息

- 仓库名称：`dsh-studio-media`
- 仓库描述：Toonflow 工作室适配，提供无限画布、剧本、分镜、角色素材和图片视频生成任务。
- 仓库地址：`https://github.com/1997liuyh-boop/dsh-studio-media`
- 上游项目：`https://github.com/HBAI-Ltd/Toonflow-app`，固定版本见 `UPSTREAM.json`。

## 功能与特性

- 在无限画布中组织剧本、分镜、角色、场景和可复用素材。
- 在原应用流程中维护故事、分场、镜头和制作备注。
- 调用已配置的图片和视频生成任务，显示实际进度和失败详情。
- 桥接绑定的 DSH 会话，保持消息、流式回复、模型状态、工具结果和停止状态一致。
- Toonflow 或数据库不可用时显示服务状态和重试入口，不用示例数据判断已连接。

## 安装

请先安装控制组合包，再完整退出 Desktop，通过官方插件管理器安装本工作室精确 tag：

```powershell
& "<Desktop安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:1997liuyh-boop/dsh-studio-library#v0.1.3"
& "<Desktop安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:1997liuyh-boop/dsh-studio-media#v0.3.0"
& "<Desktop安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop list
```

验证安装包包含 `main: lib/index.js`、`exports./client: lib/client.js`、`dsh.bundle.patch: ./cordis.patch.yml`、已构建的 `static` 入口和 `app/build`（Toonflow 服务与页面）。安装后重启 Desktop，服务会自动启动；模型提供方与存储在工作室内的设置里配置。

### 服务配置

Toonflow 服务随本工作室一起安装，不需要另外准备源码，也不需要启动脚本：

- **自动启动**：工作室安装或启用后，工作室库运行时（`dsh-studio-library` 0.1.20 及以上）把 `app` 复制到独立的运行副本，用 Bun 启动服务；更新工作室后自动切换到新版本。控制台的工作室列表显示连接状态，未连接时可点「启动」，失败原因直接显示在该行。
- **Bun**：各平台的 Bun 1.4.3 声明为本包的可选依赖，安装工作室时包管理器只装当前平台的那一个。安装被跳过时，可设置环境变量 `DSH_STUDIO_BUN`，或在 `dsh-studio-projects` 插件配置里填 `bunPath`（Bun 程序的绝对路径）。
- **数据目录**：数据库、素材和工作区默认在 `<DSH_HOME>/studio/toonflow`（`DSH_HOME` 缺省为 `~/.dsh`）。已有数据在别处时，在 `dsh-studio-projects` 插件配置里填 `toonflowDataDirectory`，或设置环境变量 `DSH_STUDIO_TOONFLOW_DATA`。运行副本与日志在 `<DSH_HOME>/studio/media`，与数据分开。
- **端口**：默认 `http://127.0.0.1:33101`，可用 `toonflowUrl` 或 `DSH_STUDIO_TOONFLOW_URL` 改端口。地址不是本机回环地址时（服务部署在别的机器上），运行时不再自动启动，只按该地址连接。
- **已有服务**：端口上已经有 Toonflow 在运行（例如自行从源码启动的）时直接沿用，不会停掉它。设置 `DSH_STUDIO_SKIP_APPS=1` 可关闭自动启动。

随包的构建产物对应 `UPSTREAM.json` 记录的上游提交加 `patches/`。需要自行构建时：

```powershell
node scripts/prepare-upstream.mjs media "C:\work\toonflow"
cd C:\work\toonflow
bun install
bun run build
```

旧版工作室库（0.1.19 及以下）不会自动启动服务，仍需像以前一样自行启动 Toonflow。

## 要求与限制

适配包不包含个人数据、账号、生成额度或外部服务。Toonflow 仍负责数据库和生成任务。源码和第三方声明见 `UPSTREAM.json` 与 `THIRD_PARTY_NOTICES.md`。

## 许可与来源

本项目使用 MIT 许可。上游版本和适配补丁记录在 `UPSTREAM.json` 与 `patches/`。
