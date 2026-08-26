<p align="center">
  <img src="public/pulsete-logo.svg" width="280" alt="Pulsete">
</p>

<p align="center">
  <strong>A local-first IRC client that keeps your workspace and history alive through disconnects.</strong>
</p>

<p align="center">
  <a href="https://github.com/enriquemorenotent/pulsete/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/enriquemorenotent/pulsete?style=flat-square">
  </a>
  <a href="https://github.com/enriquemorenotent/pulsete/releases/download/v0.1.3/pulsete_0.1.3_amd64.deb">
    <img alt="Ubuntu deb package" src="https://img.shields.io/badge/Ubuntu%2024.04-.deb-E95420?style=flat-square&logo=ubuntu&logoColor=white">
  </a>
  <a href="./LICENSE">
    <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square">
  </a>
</p>

<p align="center">
  <a href="https://enriquemorenotent.github.io/pulsete/">Website</a>
  ·
  <a href="https://github.com/enriquemorenotent/pulsete/releases/latest">Download</a>
  ·
  <a href="./docs/product-model.md">Product model</a>
  ·
  <a href="./.github/workflows/desktop-release.yml">Release workflow</a>
</p>

Pulsete is built for IRC users who want a desktop workspace that belongs to
them, not to the current socket connection. Networks can disconnect, reconnect,
or stay offline without hiding the local transcript and workspace state.

The current packaged desktop target is Ubuntu 24.04 on amd64. Windows and macOS
packaging are planned, but not part of the current release flow yet.

## Highlights

| | |
| --- | --- |
| Durable workspace | Saved networks, buffers, watchlist entries, muted nicks, and history survive restarts. |
| Local-first history | Transcripts are stored in SQLite and remain readable without an IRC connection. |
| Offline-friendly UI | Disconnected networks stay visible, with channel and query logs still selectable. |
| Native Ubuntu package | GitHub Releases ship an Electron desktop app as a `.deb` for Ubuntu 24.04. |
| APT updates | The `.deb` registers the Pulsete APT repository so later updates arrive through `apt upgrade`. |
| Browser-fast development | The day-to-day development loop runs in the browser before packaging the desktop app. |

## Install On Ubuntu

Download the latest package from [GitHub Releases][latest-release], or install
the current amd64 package directly:

```sh
curl -LO https://github.com/enriquemorenotent/pulsete/releases/download/v0.1.3/pulsete_0.1.3_amd64.deb
sudo apt install ./pulsete_0.1.3_amd64.deb
```

Installing the `.deb` also installs the Pulsete APT source and signing key.
Future releases can be installed with the normal Ubuntu update flow:

```sh
sudo apt update
sudo apt upgrade
```

[latest-release]: https://github.com/enriquemorenotent/pulsete/releases/latest

## Development

Pulsete is built with React, Vite, Node.js, Electron, and SQLite.

Use Node.js 24:

```sh
nvm use
npm ci
```

Run the browser-based development environment:

```sh
npm run dev
```

The dev server uses a local Node process on port `18487` and a Vite web client
on port `18473`.

## Validation

Run the main checks before committing changes:

```sh
npm run typecheck
npm test
npm run lint:file-length
```

Build the Ubuntu desktop package locally:

```sh
npm run dist:linux
```

The generated `.deb` is written to `release/`.

## Data Locations

The browser development environment stores data in `./data` by default. You can
override that with `PULSETE_DATA_DIR`.

The packaged desktop app uses Electron's `userData` directory instead. On Linux,
that is normally under `~/.config/Pulsete`. This keeps installed app data
separate from development data.

## Release Flow

GitHub Actions publishes desktop releases when a tag matching `v*` is pushed.

For a new release:

```sh
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v0.1.3"
git tag -a v0.1.3 -m "Pulsete v0.1.3"
git push origin main
git push origin v0.1.3
```

The `Desktop Release` workflow builds the Ubuntu `.deb`, uploads it as a CI
artifact, attaches it to the GitHub Release, and publishes the signed APT
repository. The `Pages` workflow republishes the landing page after every push
to `main`, while keeping the APT repository on the latest published release.

## Repository Layout

- `web/` - React client
- `server/` - local API server, persistence, and IRC integration
- `desktop/` - Electron shell
- `site/` - GitHub Pages landing page
- `shared/` - shared types and protocol helpers
- `tests/` - Node test suite
- `docs/` - product and code organization notes
- `scripts/` - build and maintenance scripts

## License

Pulsete is released under the [MIT License](./LICENSE).
