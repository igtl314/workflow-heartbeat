# Plan: Smoke Tests with a Fake Octokit

## Context

The extension currently has only shallow unit tests (`src/test/extension.test.ts`) — they exercise pure helpers (`filterRunsForDisplay`, status-bar color helpers, job-name rendering) but never call `activate()`, never invoke commands, never touch the Octokit or Git APIs. There is no coverage for the integrated flow: "user picks a branch and workflow, Recent Runs populates with the right items, rerun command fires the right API call."

The user's question was whether Playwright could drive this. Playwright is wrong-layer for a desktop VS Code extension (good for web UIs, for extensions there's `vscode-extension-tester` or `@vscode/test-web`). The higher-leverage move is at the **data layer**: stub Octokit and the Git extension, then drive the real extension through `vscode.commands.executeCommand` inside the existing `@vscode/test-electron` harness. This gives deterministic end-to-end smoke coverage with no second framework.

Goal: prove the pattern with 2 working smoke tests, leave a clean pattern for adding more later.

## Scope (explicitly out of scope)

- Playwright, vscode-extension-tester, @vscode/test-web.
- Mocking the 60-second polling loop (requires a scheduler seam; deferred to a follow-up).
- Replacing existing unit tests.
- Covering every command — just two representative flows.

---

## Design

### Injection seam for Octokit

Add a test-only setter to `src/utils.ts`. Production unchanged.

```ts
// src/utils.ts
import type { IRepository, TOctokit } from './types';

type OctokitFactory = (token: string) => Promise<TOctokit>;

const defaultFactory: OctokitFactory = async (token) => {
	const { Octokit } = await import('octokit');
	return new Octokit({ auth: token });
};

let factory: OctokitFactory = defaultFactory;

export function getOctokit(token: string): Promise<TOctokit> {
	return factory(token);
}

export function __setOctokitFactoryForTests(fn: OctokitFactory | undefined): void {
	factory = fn ?? defaultFactory;
}
```

All 6 existing call sites (`extension.ts:104, 520, 792, 975, 1077, 1143`) keep calling `getOctokit(token)` — no changes there.

### VS Code API mocks

Monkey-patch in `setup`, restore in `teardown`. Using **sinon** (add as dev dep — standard with Mocha, already familiar territory). Targets:

- `vscode.authentication.getSession` → resolve to `{ accessToken: 'fake-token', account: { label: 'tester' } }`.
- `vscode.extensions.getExtension('vscode.git')` → stub returning an `IGitExtension` whose `getAPI(1).repositories[0]` has:
  - `state.remotes = [{ name: 'origin', fetchUrl: 'https://github.com/acme/widgets.git' }]`
  - `getBranches({ remote: true })` → `[{ name: 'origin/main', type: 1 }, { name: 'origin/dev', type: 1 }]`
- `vscode.window.showQuickPick` → resolve to the first (or configured) item, so the flow doesn't block on user input.
- `vscode.window.showWarningMessage` → resolve to the confirm string (e.g. `'Rerun'`).
- `vscode.window.withProgress` — **don't mock**, it runs fine in test host.

### Fake Octokit

Build a tiny object covering only the methods the extension calls. Each method is a `sinon.stub()` so tests can assert calls and vary responses.

```ts
// src/test/fakes.ts
import * as sinon from 'sinon';
import type { TOctokit } from '../types';

export function makeFakeOctokit(overrides: Partial<FakeOctokitData> = {}): TOctokit & { __stubs: Stubs } {
	const data = { workflows: [...], runs: [...], jobs: [...], ...overrides };
	const stubs = {
		listRepoWorkflows: sinon.stub().resolves({ data: { workflows: data.workflows } }),
		listWorkflowRuns: sinon.stub().resolves({ data: { workflow_runs: data.runs, total_count: data.runs.length } }),
		listJobsForWorkflowRun: sinon.stub().resolves({ data: { jobs: data.jobs } }),
		reRunJobForWorkflowRun: sinon.stub().resolves({ data: {} }),
		reRunWorkflowFailedJobs: sinon.stub().resolves({ data: {} }),
	};
	return { rest: { actions: stubs }, __stubs: stubs };
}
```

Default fixtures: 1 workflow ("CI"), 3 runs (`success`, `failure`, `in_progress`), each run has 2 jobs — enough to populate the tree and exercise icon logic.

### Fake ExtensionContext

The current unit test uses `{} as vscode.ExtensionContext`, which explodes the moment `activate()` reads `workspaceState`. Need a minimal real-ish context. `src/test/fakes.ts` exports `makeFakeContext()`:

```ts
class InMemoryMemento implements vscode.Memento {
	private store = new Map<string, unknown>();
	get(key: string, defaultValue?: unknown) { return this.store.has(key) ? this.store.get(key) : defaultValue; }
	update(key: string, value: unknown) { this.store.set(key, value); return Promise.resolve(); }
	keys() { return [...this.store.keys()]; }
	// setKeysForSync is optional on globalState; no-op for workspaceState
}

export function makeFakeContext(): vscode.ExtensionContext {
	return {
		subscriptions: [] as { dispose(): unknown }[],
		workspaceState: new InMemoryMemento(),
		globalState: Object.assign(new InMemoryMemento(), { setKeysForSync: () => {} }),
		secrets: { get: async () => undefined, store: async () => {}, delete: async () => {}, onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event },
		extensionUri: vscode.Uri.file('/tmp/fake'),
		// …remaining fields cast as any; only fill what activate() actually reads
	} as unknown as vscode.ExtensionContext;
}
```

### Module-level state reset

`src/extension.ts` holds several module-level `let` bindings (`octokit`, `currentState`, `statusBarItem`, `pollingInterval`, `configViewProvider`, `runsViewProvider`, `cachedRuns`, `cachedGitHubInfo`). Calling `activate()` twice in a suite would double-register commands and leak state.

Add a small test-only export:

```ts
// in extension.ts, near deactivate()
export function __resetForTests(): void {
	if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = undefined; }
	octokit = undefined;
	currentState = undefined;
	cachedRuns = [];
	cachedGitHubInfo = undefined;
	// Note: subscriptions from the previous activate() are disposed via the fake context's own teardown
}
```

Each smoke test calls `__resetForTests()` + disposes the fake context's subscriptions before re-activating.

### Test file: `src/test/smoke.test.ts`

Two scenarios, keep scope tight:

**Scenario 1 — cold-start flow**
```
setup:
  install vscode + git + quickpick mocks
  __setOctokitFactoryForTests(() => Promise.resolve(fakeOctokit))
  ctx = makeFakeContext()  // empty workspaceState
  await extension.activate(ctx)
act:
  await vscode.commands.executeCommand('woa.selectWorkflow')
assert:
  fakeOctokit.__stubs.listRepoWorkflows called once with { owner: 'acme', repo: 'widgets' }
  ctx.workspaceState.get('monitoringState') matches { branch: 'main', workflows: [{ workflowId: <fake id> }] }
  fakeOctokit.__stubs.listWorkflowRuns called (startMonitoring triggered)
```

**Scenario 2 — rerun failed jobs**
```
setup:
  same mocks; fakeOctokit seeded with one failed run (id=42)
  ctx.workspaceState.update('monitoringState', { branch: 'main', owner: 'acme', repo: 'widgets', workflows: [{ workflowId: 1, workflowName: 'CI', isHead: true }] })
  await extension.activate(ctx)
act:
  const runItem = new RunsTreeItem('CI #5', 42, Collapsed.None, 'runFailed', ...)  // shape that rerunFailedJobs reads
  await vscode.commands.executeCommand('woa.rerunFailedJobs', runItem)
assert:
  fakeOctokit.__stubs.reRunWorkflowFailedJobs called with { owner: 'acme', repo: 'widgets', run_id: 42 }
teardown:
  extension.__resetForTests(); dispose ctx.subscriptions; sinon.restore()
```

These two prove: mocks work, activation is clean, commands are reachable, state persists, octokit is driven correctly. Adding a third scenario (e.g. "filter users persists across restart") is then a copy-paste of the setup harness.

---

## Files modified / created

- **new:** `src/test/smoke.test.ts`
- **new:** `src/test/fakes.ts` (reusable: `makeFakeOctokit`, `makeFakeContext`, `installVSCodeMocks`, `restoreVSCodeMocks`)
- **edit:** `src/utils.ts` — add `OctokitFactory` type, module-local `factory` var, `__setOctokitFactoryForTests` export; `getOctokit` now delegates.
- **edit:** `src/extension.ts` — add `__resetForTests` export near `deactivate()`. (~10 lines, no behavior change in production paths.)
- **edit:** `package.json` — add `sinon` and `@types/sinon` to `devDependencies`.
- **edit:** `CHANGELOG.md` — `[Unreleased]` → `### Added: smoke test harness for end-to-end flows using a fake Octokit and Git extension.`

No changes to `.vscode-test.mjs` — the existing `out/test/**/*.test.js` glob picks up `smoke.test.js`.

No changes to `package.json` `activationEvents` or `contributes`.

---

## Verification

1. **Install**
   - `pnpm add -D sinon @types/sinon` — single dev-dep install.
2. **Build & lint — must pass before moving on**
   - `pnpm run compile` — type-check + lint + bundle. Zero errors.
3. **Tests — must pass, including the two new ones**
   - `pnpm run test` — now runs `extension.test.js` (27 existing) + `smoke.test.js` (2 new) = 29 passing. If anything is red, investigate; do not skip.
4. **Spot-check determinism**
   - Run `pnpm run test` three times in a row — all green, same timing ballpark (no network, no flakes).
5. **Manual**
   - Not required for this change — the smoke tests *are* the verification.

## Known limitations

- **Polling isn't exercised.** `setInterval` fires every 60s in `startMonitoring`; smoke tests rely on the initial synchronous `checkWorkflowStatus` call and don't wait for subsequent ticks. A future scheduler-seam (replace `setInterval`/`clearInterval` with an injectable pair) would unlock polling-loop tests.
- **Tree view rendering isn't asserted pixel-for-pixel.** We assert octokit calls + state shape; asserting actual TreeItem children requires calling `runsViewProvider.getChildren()` directly, which is fine but verbose. The two scenarios skip it to keep scope tight; easy to add later.
- **Module-level state in `extension.ts`** is a pre-existing smell. `__resetForTests` is a pragmatic workaround, not a fix — a proper refactor would encapsulate state in a class, but that's a separate PR.
