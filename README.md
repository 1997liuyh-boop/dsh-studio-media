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
& "<Desktop install directory>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "github:1997liuyh-boop/dsh-studio-media#v0.3.0"
& "<Desktop install directory>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop list
```

Verify `main: lib/index.js`, `exports./client: lib/client.js`, `dsh.bundle.patch: ./cordis.patch.yml`, the built `static` entry and `app/build` (the Toonflow service and web app). Restart Desktop after installing and the service starts on its own; configure model providers and storage in the studio settings.

### Service setup

The Toonflow service is installed with this studio. No separate source checkout and no start script are needed:

- **Automatic start**: once the studio is installed or enabled, the studio library runtime (`dsh-studio-library` 0.1.20 or later) copies `app` to an isolated runtime copy and starts the service with Bun; after a studio update it switches to the new version. The console studio list shows the connection state, offers a Start button when offline and shows the failure reason on that row.
- **Bun**: Bun 1.4.3 for each platform is declared as an optional dependency of this package, so the package manager installs only the one for the current platform. If that install was skipped, set `DSH_STUDIO_BUN`, or set `bunPath` (absolute path of the Bun executable) in the `dsh-studio-projects` plugin config.
- **Data directory**: the database, assets and workspaces default to `<DSH_HOME>/studio/toonflow` (`DSH_HOME` defaults to `~/.dsh`). If your data lives elsewhere, set `toonflowDataDirectory` in the `dsh-studio-projects` plugin config or the `DSH_STUDIO_TOONFLOW_DATA` environment variable. Runtime copies and logs are kept in `<DSH_HOME>/studio/media`, apart from the data.
- **Port**: `http://127.0.0.1:33101` by default; change it with `toonflowUrl` or `DSH_STUDIO_TOONFLOW_URL`. When the origin is not a loopback address (the service runs on another machine) the runtime does not start anything and only connects to it.
- **Existing service**: a Toonflow already listening on the port (for example one you started from source) is reused and never stopped. Set `DSH_STUDIO_SKIP_APPS=1` to turn automatic start off.

The bundled build corresponds to the upstream commit recorded in `UPSTREAM.json` plus `patches/`. To build it yourself:

```powershell
node scripts/prepare-upstream.mjs media "C:\work\toonflow"
cd C:\work\toonflow
bun install
bun run build
```

Older studio library versions (0.1.19 and below) do not start the service; start Toonflow yourself as before.

## Requirements and limits

The adapter does not include personal data, accounts, generation quotas or external services. Toonflow remains responsible for its database and generation tasks. Source and third-party notices are in `UPSTREAM.json` and `THIRD_PARTY_NOTICES.md`.

## License and sources

MIT licensed. The upstream revision and adaptation patches are recorded in `UPSTREAM.json` and `patches/`.
