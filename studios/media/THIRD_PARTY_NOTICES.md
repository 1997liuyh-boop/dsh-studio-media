# 来源与第三方声明

本项目配合 [1997liuyh-boop/deepseek-harness](https://github.com/1997liuyh-boop/deepseek-harness) 使用；该宿主 **fork 自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)**。感谢 DeepSeek 团队及上游贡献者。当前已验证的适配目标为 **dsh 0.2.1-rc.2（实验性）**，Windows 桌面端优先。

**独立服务与补丁适配**：本工作室基于 [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app)。

上游锁定提交：6086cdffceb704a632eca143dd16cd461a78cdac。

本项目改动采用 MIT；内置或补丁涉及的上游许可与版权保持原文。

Toonflow 原 MIT 许可及 Copyright (c) 2026 HBAI-Ltd 保留于 UPSTREAM-LICENSE。

`app/build` 是上述提交应用 `patches/` 后的构建产物，其中打包进来的第三方依赖（含 `app/build/server/node_modules` 下的运行时依赖）各自保持原许可，许可文件随对应目录保留。运行服务所用的 [Bun](https://bun.sh)（MIT）不在本包内，由包管理器作为可选依赖从 npm 安装。

共享容器与 SDK 来源于 https://github.com/1997liuyh-boop/dsh-studio-library，其中容器改编自 https://github.com/Aisland-SJL/dsh-worktable 。感谢以上作者和所有开源依赖贡献者。
