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

	test('should return undefined background for undefined status', () => {
		const color = getStatusBarBackgroundColor(undefined);
		assert.strictEqual(color, undefined);
	});
});
