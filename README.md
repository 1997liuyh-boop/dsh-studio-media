# dsh-studio-media

[简体中文](README.zh.md)

## Repository

- Repository name: `dsh-studio-media`
- Repository description: Toonflow studio adapter for an infinite canvas, scripts, storyboards, character assets and image/video generation tasks.
- Source: `https://github.com/1997liuyh-boop/dsh-studio-media`
- Upstream: `https://github.com/HBAI-Ltd/Toonflow-app`, locked in `UPSTREAM.json`.

## Features

- Organize scripts, storyboards, characters, scenes and reusable assets on an infinite canvas.
- Keep story, scene, shot and production notes in the original application's workflow.
- Invoke configured image and video generation tasks and show real progress or failure details.
- Bridge a bound DSH session with messages, streaming replies, model state, tool results and stop status.
- Show service status and retry controls when Toonflow or its database is unavailable; no sample data is used as a connection signal.

## Installation

Install the control bundle, then this exact studio tag through the official Desktop plugin manager after fully quitting Desktop:

```powershell
& "<Desktop install directory>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:1997liuyh-boop/dsh-studio-library#v0.1.3"
& "<Desktop install directory>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:1997liuyh-boop/dsh-studio-media#v0.2.2"
& "<Desktop install directory>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop list
```

Verify `main: lib/index.js`, `exports./client: lib/client.js`, `dsh.bundle.patch: ./cordis.patch.yml` and the built `static` entry. Configure the Toonflow service, database, model provider and storage separately, then restart Desktop.

## Requirements and limits

The adapter does not include personal data, accounts, generation quotas or external services. Toonflow remains responsible for its database and generation tasks. Source and third-party notices are in `UPSTREAM.json` and `THIRD_PARTY_NOTICES.md`.

## License and sources

MIT licensed. The upstream revision and adaptation patches are recorded in `UPSTREAM.json` and `patches/`.
