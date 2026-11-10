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
& "<Desktop安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:1997liuyh-boop/dsh-studio-media#v0.2.2"
& "<Desktop安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop list
```

验证安装包包含 `main: lib/index.js`、`exports./client: lib/client.js`、`dsh.bundle.patch: ./cordis.patch.yml` 和已构建的 `static` 入口。另行配置 Toonflow 服务、数据库、模型提供方和存储，随后重启 Desktop。

## 要求与限制

适配包不包含个人数据、账号、生成额度或外部服务。Toonflow 仍负责数据库和生成任务。源码和第三方声明见 `UPSTREAM.json` 与 `THIRD_PARTY_NOTICES.md`。

## 许可与来源

本项目使用 MIT 许可。上游版本和适配补丁记录在 `UPSTREAM.json` 与 `patches/`。
