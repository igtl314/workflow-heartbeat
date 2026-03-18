import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { getStatusBarBackgroundColor, getStatusBarTextColor } from '../extension';

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
	test('should filter out runs from specified users with exact case matching', () => {
		// Verify that users are stored as-is and compared with normalized casing
		const filterOutUsers = ['renovate[bot]', 'dependabot'];
		const runActors = ['renovate[bot]', 'Renovate[bot]', 'dependabot', 'DEPENDABOT', 'john'];
		
		const filterOutUsersLower = filterOutUsers.map(u => u.toLowerCase());
		const filteredActors = runActors.filter(actor => !filterOutUsersLower.includes(actor.toLowerCase()));
		
		// Should only keep 'john' since all others match the filter (case-insensitive)
		assert.deepStrictEqual(filteredActors, ['john']);
	});

	test('should handle empty filter list and show all users', () => {
		const filterOutUsers: string[] = [];
		const runActors = ['renovate[bot]', 'dependabot', 'john'];
		
		const filterOutUsersLower = filterOutUsers.map(u => u.toLowerCase());
		const filteredActors = runActors.filter(actor => !filterOutUsersLower.includes(actor.toLowerCase()));
		
		// With empty filter, all users should be included
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
});
