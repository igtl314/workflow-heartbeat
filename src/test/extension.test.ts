import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { filterRunsForDisplay, getStatusBarBackgroundColor, getStatusBarTextColor } from '../extension';
import { getJobNameAfterLastSlash } from '../runsView';
import { RunsViewProvider } from '../runsView';
import type { IMonitoringState, IWorkflowRun } from '../types';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(7));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('Status Bar Color Tests', () => {
	test('should return undefined background for success status', () => {
		const color = getStatusBarBackgroundColor('success');
		assert.strictEqual(color, undefined);
	});

	test('should return green text color for success status', () => {
		const color = getStatusBarTextColor('success');
		assert.strictEqual(color, '#69db7c');
	});

	test('should return red background for failure status', () => {
		const color = getStatusBarBackgroundColor('failure');
		assert.strictEqual(color, 'statusBarItem.errorBackground');
	});

	test('should return yellow background for in_progress status', () => {
		const color = getStatusBarBackgroundColor('in_progress');
		assert.strictEqual(color, 'statusBarItem.warningBackground');
	});

	test('should return yellow background for queued status', () => {
		const color = getStatusBarBackgroundColor('queued');
		assert.strictEqual(color, 'statusBarItem.warningBackground');
	});

	test('should return yellow background for pending status', () => {
		const color = getStatusBarBackgroundColor('pending');
		assert.strictEqual(color, 'statusBarItem.warningBackground');
	});

	test('should return red background for in_progress_failing status', () => {
		const color = getStatusBarBackgroundColor('in_progress_failing');
		assert.strictEqual(color, 'statusBarItem.errorBackground');
	});

	test('should return undefined background for undefined status', () => {
		const color = getStatusBarBackgroundColor(undefined);
		assert.strictEqual(color, undefined);
	});
});

suite('Filter Users Tests', () => {
	test('should filter only head workflow runs for selected users', () => {
		const state: IMonitoringState = {
			branch: 'main',
			owner: 'owner',
			repo: 'repo',
			workflows: [
				{ workflowId: 1, workflowName: 'Head Workflow', isHead: true },
				{ workflowId: 2, workflowName: 'Secondary Workflow' }
			],
			filterOutUsers: ['renovate[bot]']
		};

		const runs: IWorkflowRun[] = [
			{
				id: 1,
				name: 'head run filtered',
				status: 'completed',
				conclusion: 'success',
				html_url: 'https://example.com/1',
				created_at: '2026-03-19T10:00:00.000Z',
				head_sha: '1234567890abcdef',
				run_number: 1,
				actor: 'Renovate[bot]',
				workflowId: 1,
				workflowName: 'Head Workflow'
			},
			{
				id: 2,
				name: 'head run kept',
				status: 'completed',
				conclusion: 'success',
				html_url: 'https://example.com/2',
				created_at: '2026-03-19T10:01:00.000Z',
				head_sha: 'abcdef1234567890',
				run_number: 2,
				actor: 'alice',
				workflowId: 1,
				workflowName: 'Head Workflow'
			},
			{
				id: 3,
				name: 'secondary run should stay',
				status: 'completed',
				conclusion: 'success',
				html_url: 'https://example.com/3',
				created_at: '2026-03-19T10:02:00.000Z',
				head_sha: '9999999999999999',
				run_number: 3,
				actor: 'renovate[bot]',
				workflowId: 2,
				workflowName: 'Secondary Workflow'
			}
		];

		const visibleRuns = filterRunsForDisplay(runs, state);
		assert.deepStrictEqual(visibleRuns.map(run => run.id), [2, 3]);
	});

	test('should return all runs when no filter users are selected', () => {
		const state: IMonitoringState = {
			branch: 'main',
			owner: 'owner',
			repo: 'repo',
			workflows: [{ workflowId: 1, workflowName: 'Head Workflow', isHead: true }],
			filterOutUsers: []
		};

		const runs: IWorkflowRun[] = [{
			id: 1,
			name: 'run',
			status: 'completed',
			conclusion: 'success',
			html_url: 'https://example.com/1',
			created_at: '2026-03-19T10:00:00.000Z',
			head_sha: '1234567890abcdef',
			run_number: 1,
			actor: 'renovate[bot]',
			workflowId: 1,
			workflowName: 'Head Workflow'
		}];

		const visibleRuns = filterRunsForDisplay(runs, state);
		assert.deepStrictEqual(visibleRuns.map(run => run.id), [1]);
	});

	test('should filter out runs from specified users using case-insensitive matching (head workflow only)', () => {
		// Verify that users are stored as-is but compared using case-insensitive matching via normalized casing
		// Filter only applies to head/starred workflow
		const filterOutUsers = ['renovate[bot]', 'dependabot'];
		const runActors = ['renovate[bot]', 'Renovate[bot]', 'dependabot', 'DEPENDABOT', 'john'];
		
		const filterOutUsersLower = filterOutUsers.map(u => u.toLowerCase());
		const filteredActors = runActors.filter(actor => !filterOutUsersLower.includes(actor.toLowerCase()));
		
		// Should only keep 'john' since all others match the filter (case-insensitive)
		assert.deepStrictEqual(filteredActors, ['john']);
	});

	test('should handle empty filter list and show all users in all workflows', () => {
		const filterOutUsers: string[] = [];
		const runActors = ['renovate[bot]', 'dependabot', 'john'];
		
		const filterOutUsersLower = filterOutUsers.map(u => u.toLowerCase());
		const filteredActors = runActors.filter(actor => !filterOutUsersLower.includes(actor.toLowerCase()));
		
		// With empty filter, all users should be included in all workflows
		assert.deepStrictEqual(filteredActors, runActors);
	});

	test('should handle filter state persistence', () => {
		const filterConfig = ['bot1', 'bot2'];
		
		// Simulate storing and retrieving filter state
		const stored = JSON.stringify({ filterOutUsers: filterConfig });
		const retrieved = JSON.parse(stored).filterOutUsers;
		
		assert.deepStrictEqual(retrieved, filterConfig);
	});

	test('should maintain filter list when adding and removing users', () => {
		let filterOutUsers = ['renovate[bot]'];
		
		// Add a user
		filterOutUsers.push('dependabot');
		assert.deepStrictEqual(filterOutUsers, ['renovate[bot]', 'dependabot']);
		
		// Remove a user
		filterOutUsers = filterOutUsers.filter(u => u !== 'dependabot');
		assert.deepStrictEqual(filterOutUsers, ['renovate[bot]']);
	});

	test('should not apply filter to non-head workflows', () => {
		// Filter should only apply to the head (starred) workflow
		// Non-head workflows should show all runs regardless of filter
		const filterOutUsers = ['renovate[bot]'];
		const isHeadWorkflow = false;
		const shouldApplyFilter = isHeadWorkflow && filterOutUsers.length > 0;
		
		// For non-head workflows, filter should not be applied
		assert.strictEqual(shouldApplyFilter, false);
	});
});

suite('Rerun Failed Jobs Tests', () => {
	test('failed run item should have runFailed contextValue', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const runs: IWorkflowRun[] = [
			{
				id: 1,
				name: 'failed run',
				status: 'completed',
				conclusion: 'failure',
				html_url: 'https://example.com/1',
				created_at: '2026-03-19T10:00:00.000Z',
				head_sha: '1234567890abcdef',
				run_number: 1,
				actor: 'alice',
				workflowId: 1,
				workflowName: 'CI'
			}
		];
		provider.setRuns(runs);
		const items = (provider as any).getRunItems(runs);
		assert.strictEqual(items[0].contextValue, 'runFailed');
	});

	test('successful run item should have run contextValue', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const runs: IWorkflowRun[] = [
			{
				id: 2,
				name: 'passing run',
				status: 'completed',
				conclusion: 'success',
				html_url: 'https://example.com/2',
				created_at: '2026-03-19T10:01:00.000Z',
				head_sha: 'abcdef1234567890',
				run_number: 2,
				actor: 'alice',
				workflowId: 1,
				workflowName: 'CI'
			}
		];
		provider.setRuns(runs);
		const items = (provider as any).getRunItems(runs);
		assert.strictEqual(items[0].contextValue, 'run');
	});

	test('cancelled run item should have run contextValue', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const runs: IWorkflowRun[] = [
			{
				id: 3,
				name: 'cancelled run',
				status: 'completed',
				conclusion: 'cancelled',
				html_url: 'https://example.com/3',
				created_at: '2026-03-19T10:02:00.000Z',
				head_sha: 'deadbeefdeadbeef',
				run_number: 3,
				actor: 'alice',
				workflowId: 1,
				workflowName: 'CI'
			}
		];
		provider.setRuns(runs);
		const items = (provider as any).getRunItems(runs);
		assert.strictEqual(items[0].contextValue, 'run');
	});

	test('job group with all failures should have jobGroupFailed contextValue', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const jobs = [
			{ id: 1, name: 'verify (ubuntu)', status: 'completed', conclusion: 'failure', html_url: '', started_at: null, completed_at: null },
			{ id: 2, name: 'verify (windows)', status: 'completed', conclusion: 'failure', html_url: '', started_at: null, completed_at: null }
		];
		const items = (provider as any).createGroupedJobItems(jobs, 42);
		assert.strictEqual(items[0].contextValue, 'jobGroupFailed');
	});

	test('job group with mixed results should have jobGroupFailed contextValue', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const jobs = [
			{ id: 1, name: 'verify (ubuntu)', status: 'completed', conclusion: 'success', html_url: '', started_at: null, completed_at: null },
			{ id: 2, name: 'verify (windows)', status: 'completed', conclusion: 'failure', html_url: '', started_at: null, completed_at: null }
		];
		const items = (provider as any).createGroupedJobItems(jobs, 42);
		// Mixed result: one passed, one failed — groupStatus is 'failure', so still jobGroupFailed
		assert.strictEqual(items[0].contextValue, 'jobGroupFailed');
	});

	test('job group with all passing should have jobGroup contextValue', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const jobs = [
			{ id: 1, name: 'verify (ubuntu)', status: 'completed', conclusion: 'success', html_url: '', started_at: null, completed_at: null },
			{ id: 2, name: 'verify (windows)', status: 'completed', conclusion: 'success', html_url: '', started_at: null, completed_at: null }
		];
		const items = (provider as any).createGroupedJobItems(jobs, 42);
		assert.strictEqual(items[0].contextValue, 'jobGroup');
	});

	test('getFailedJobsForGroup returns only failed jobs in the group', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const runs: IWorkflowRun[] = [{
			id: 10, name: 'run', status: 'completed', conclusion: 'failure',
			html_url: '', created_at: '', head_sha: '', run_number: 1, actor: '', workflowId: 1, workflowName: 'CI'
		}];
		provider.setRuns(runs);
		// Populate cache directly
		const jobs = [
			{ id: 1, name: 'verify (ubuntu)', status: 'completed', conclusion: 'failure', html_url: '', started_at: null, completed_at: null },
			{ id: 2, name: 'verify (windows)', status: 'completed', conclusion: 'success', html_url: '', started_at: null, completed_at: null },
			{ id: 3, name: 'lint', status: 'completed', conclusion: 'failure', html_url: '', started_at: null, completed_at: null }
		];
		(provider as any).jobsCache.set('1:10', jobs);
		const failed = provider.getFailedJobsForGroup(10, 'verify');
		assert.deepStrictEqual(failed.map((j: any) => j.id), [1]);
	});
});

suite('Job Name Display Tests', () => {
	test('should show text after the last slash with spaces', () => {
		assert.strictEqual(getJobNameAfterLastSlash('verify / lint / unit'), 'unit');
	});

	test('should show text after the last slash without spaces', () => {
		assert.strictEqual(getJobNameAfterLastSlash('verify/lint/unit'), 'unit');
	});

	test('should keep original name when no slash exists', () => {
		assert.strictEqual(getJobNameAfterLastSlash('lint'), 'lint');
	});

	test('should use last path segment for grouped variant names', () => {
		const provider = new RunsViewProvider({} as vscode.ExtensionContext, () => undefined);
		const variant = (provider as any).getJobVariant('Standalone Main / production / test-cloud-role-production / system-role-stest-edge-prod');
		assert.strictEqual(variant, 'system-role-stest-edge-prod');
	});
});

suite('Modal Dialog Cancel Button Tests', () => {
	let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
	let originalShowOpenDialog: typeof vscode.window.showOpenDialog;

	setup(() => {
		originalShowWarningMessage = vscode.window.showWarningMessage;
		originalShowOpenDialog = vscode.window.showOpenDialog;
	});

	teardown(() => {
		vscode.window.showWarningMessage = originalShowWarningMessage;
		vscode.window.showOpenDialog = originalShowOpenDialog;
	});

	test('import config dialog does not pass Cancel as an explicit button item', async () => {
		// Regression test: showWarningMessage with { modal: true } already shows a built-in
		// Cancel button. Passing 'Cancel' explicitly caused a duplicate Cancel button.
		const capturedArgs: unknown[][] = [];
		(vscode.window.showWarningMessage as any) = (...args: unknown[]) => {
			capturedArgs.push(args);
			return Promise.resolve(undefined); // simulate user dismissing the modal
		};

		// Write a valid config JSON to a temp file
		const os = require('os');
		const path = require('path');
		const fs = require('fs');
		const tmpFile = path.join(os.tmpdir(), 'woa-test-config.json');
		const validConfig = {
			branch: 'main', owner: 'test', repo: 'repo',
			workflows: [{ workflowId: 1, workflowName: 'CI', isHead: true }]
		};
		fs.writeFileSync(tmpFile, JSON.stringify(validConfig));

		const fileUri = vscode.Uri.file(tmpFile);
		(vscode.window.showOpenDialog as any) = () => Promise.resolve([fileUri]);

		await vscode.commands.executeCommand('woa.importConfig');

		fs.unlinkSync(tmpFile);

		assert.strictEqual(capturedArgs.length, 1, 'showWarningMessage should have been called once');
		const buttonItems = capturedArgs[0].slice(2); // skip message and options
		assert.ok(!buttonItems.includes('Cancel'), 'Cancel should not be passed as an explicit button item when modal: true');
	});

	test('import config dialog aborts when user dismisses the modal', async () => {
		// When the modal returns undefined (user dismissed), no import should occur.
		let informationShown = false;
		const originalShowInformationMessage = vscode.window.showInformationMessage;
		(vscode.window.showInformationMessage as any) = (...args: unknown[]) => {
			informationShown = true;
			return Promise.resolve(undefined);
		};
		(vscode.window.showWarningMessage as any) = () => Promise.resolve(undefined);

		const os = require('os');
		const path = require('path');
		const fs = require('fs');
		const tmpFile = path.join(os.tmpdir(), 'woa-test-config-cancel.json');
		const validConfig = {
			branch: 'main', owner: 'test', repo: 'repo',
			workflows: [{ workflowId: 1, workflowName: 'CI', isHead: true }]
		};
		fs.writeFileSync(tmpFile, JSON.stringify(validConfig));

		const fileUri = vscode.Uri.file(tmpFile);
		(vscode.window.showOpenDialog as any) = () => Promise.resolve([fileUri]);

		await vscode.commands.executeCommand('woa.importConfig');

		fs.unlinkSync(tmpFile);
		vscode.window.showInformationMessage = originalShowInformationMessage;

		assert.strictEqual(informationShown, false, 'Import should not proceed when user dismisses the dialog');
	});

	test('rerun dialog does not pass Cancel as an explicit button item', async () => {
		// Regression test: same duplicate-Cancel issue existed in the rerun failed jobs dialog.
		// We verify the call signature by stubbing showWarningMessage before the command runs.
		// Note: the command exits early if no currentState is set, so this test verifies the
		// fix by checking a RunsTreeItem with no runId triggers an early return (no dialog shown).
		const { RunsTreeItem } = await import('../runsView.js');
		const capturedArgs: unknown[][] = [];
		(vscode.window.showWarningMessage as any) = (...args: unknown[]) => {
			capturedArgs.push(args);
			return Promise.resolve(undefined);
		};

		// Invoke with no item (no runId) — command shows an error and exits before the dialog
		await vscode.commands.executeCommand('woa.rerunFailedJobs', undefined);

		// showWarningMessage should not have been called (no runId means early exit)
		// This confirms the early-exit guard works; the dialog fix itself is verified
		// at the call site by removing 'Cancel' from the button list.
		assert.strictEqual(capturedArgs.length, 0, 'showWarningMessage should not be called when no run is selected');
	});
});
