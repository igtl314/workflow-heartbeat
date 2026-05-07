# Claude Code Guidelines

## Branching

When starting work on any new task or feature, always create a new branch before making changes. Use a descriptive branch name (e.g., `feat/my-feature` or `fix/some-bug`). Do not work directly on `main`.

## Development Workflow

- `pnpm run compile` — type-check, lint, and build
- `pnpm run test` — run the test suite (requires compile step)
- `pnpm run package` — production build (used before publishing)

## Changelog

Update [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]` for every meaningful change, following the [Keep a Changelog](http://keepachangelog.com/) format.

## PR Conventions

- Open PRs against `main`
- Prefer small, focused PRs — one feature/fix per PR

## GitHub Account

Before pushing, creating PRs, commenting on issues, or any other `gh` / `git` remote action, verify the active GitHub account is **`igtl314`**. Run `gh auth status` and confirm; if a different account is active, switch with `gh auth switch --user igtl314` (or re-authenticate) before proceeding. Do not push or create PRs under any other account.

## Testing

Tests live in `src/test/`. Add regression tests for any bug fixes.

## Publishing

Before a release:
1. Bump the version in `package.json`
2. Move `[Unreleased]` entries to a new versioned block in `CHANGELOG.md`
3. Build the `.vsix` with `pnpm run package` then `vsce package`
