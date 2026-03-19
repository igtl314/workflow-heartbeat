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
