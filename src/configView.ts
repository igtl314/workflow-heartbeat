import * as vscode from 'vscode';
import type { IMonitoringState } from './types';

export class ConfigViewProvider implements vscode.TreeDataProvider<ConfigTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ConfigTreeItem | undefined | null | void> = new vscode.EventEmitter<ConfigTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ConfigTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor(
		private context: vscode.ExtensionContext,
		private getMonitoringState: () => IMonitoringState | undefined
	) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ConfigTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ConfigTreeItem): Thenable<ConfigTreeItem[]> {
		if (element) {
			return Promise.resolve([]);
		}

		const state = this.getMonitoringState();
		const items: ConfigTreeItem[] = [];

		// Branch selector
		const branchItem = new ConfigTreeItem(
			'Branch',
			state?.branch || 'Select a branch...',
			vscode.TreeItemCollapsibleState.None,
			'git-branch'
		);
		branchItem.command = {
			command: 'woa.selectBranch',
			title: 'Select Branch'
		};
		branchItem.contextValue = 'branch';
		items.push(branchItem);

		// Workflow selector
		const workflowItem = new ConfigTreeItem(
			'Workflow',
			state?.workflowName || 'Select a workflow...',
			vscode.TreeItemCollapsibleState.None,
			'workflow'
		);
		workflowItem.command = {
			command: 'woa.selectWorkflowOnly',
			title: 'Select Workflow'
		};
		workflowItem.contextValue = 'workflow';
		items.push(workflowItem);

		// Status indicator (only show if monitoring)
		if (state) {
			const statusItem = new ConfigTreeItem(
				'Status',
				this.getStatusLabel(state.lastStatus),
				vscode.TreeItemCollapsibleState.None,
				this.getStatusIconName(state.lastStatus),
				this.getStatusIconColor(state.lastStatus)
			);
			statusItem.contextValue = 'status';
			items.push(statusItem);

			// Repository info
			const repoItem = new ConfigTreeItem(
				'Repository',
				`${state.owner}/${state.repo}`,
				vscode.TreeItemCollapsibleState.None,
				'repo'
			);
			repoItem.contextValue = 'repo';
			items.push(repoItem);

			// Stop monitoring action
			const stopItem = new ConfigTreeItem(
				'Stop Monitoring',
				'',
				vscode.TreeItemCollapsibleState.None,
				'debug-stop'
			);
			stopItem.command = {
				command: 'woa.stopMonitoring',
				title: 'Stop Monitoring'
			};
			stopItem.contextValue = 'stop';
			items.push(stopItem);
		}

		return Promise.resolve(items);
	}

	private getStatusLabel(status: string | undefined): string {
		switch (status) {
			case 'success':
				return 'Passing';
			case 'failure':
				return 'Failed';
			case 'in_progress':
				return 'In Progress';
			case 'queued':
				return 'Queued';
			case 'pending':
				return 'Pending';
			default:
				return 'Unknown';
		}
	}

	private getStatusIconName(status: string | undefined): string {
		switch (status) {
			case 'success':
				return 'pass';
			case 'failure':
				return 'error';
			case 'in_progress':
			case 'queued':
			case 'pending':
				return 'sync~spin';
			default:
				return 'question';
		}
	}

	private getStatusIconColor(status: string | undefined): string | undefined {
		switch (status) {
			case 'success':
				return 'testing.iconPassed';
			case 'failure':
				return 'testing.iconFailed';
			case 'in_progress':
			case 'queued':
			case 'pending':
				return 'testing.iconQueued';
			default:
				return undefined;
		}
	}
}

export class ConfigTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly description: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly iconName?: string,
		public readonly iconColor?: string
	) {
		super(label, collapsibleState);
		this.description = description;
		if (iconName) {
			const color = iconColor ? new vscode.ThemeColor(iconColor) : undefined;
			this.iconPath = new vscode.ThemeIcon(iconName, color);
		}
	}
}
