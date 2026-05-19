# Pulsete

Pulsete is a local IRC client with durable workspace state. It preserves
workspace structure, transcripts, watchlist entries, muted nicks, and saved IRC
network profiles across disconnects and app restarts.

The current packaged desktop target is Ubuntu 24.04 on amd64. Windows and macOS
packaging are planned, but not part of the current release flow yet.

## Download

Ubuntu packages are available from GitHub Releases:

- [Latest release](https://github.com/enriquemorenotent/pulsete/releases/latest)
- [pulsete_0.1.0_amd64.deb](https://github.com/enriquemorenotent/pulsete/releases/download/v0.1.0/pulsete_0.1.0_amd64.deb)

Install the downloaded package with:

```sh
sudo apt install ./pulsete_0.1.0_amd64.deb
```

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
git commit -m "Release v0.1.1"
git tag -a v0.1.1 -m "Pulsete v0.1.1"
git push origin main
git push origin v0.1.1
```

The `Desktop Release` workflow builds the Ubuntu `.deb`, uploads it as a CI
artifact, and attaches it to the GitHub Release.

## Repository Layout

- `web/` - React client
- `server/` - local API server, persistence, and IRC integration
- `desktop/` - Electron shell
- `shared/` - shared types and protocol helpers
- `tests/` - Node test suite
- `docs/` - product and code organization notes
- `scripts/` - build and maintenance scripts

## License

Pulsete is released under the [MIT License](./LICENSE).
