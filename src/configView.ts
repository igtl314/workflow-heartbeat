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

		// Status bar toggle
		const config = vscode.workspace.getConfiguration('woa');
		const showStatusBar = config.get<boolean>('showStatusBar', true);
		const statusBarItem = new ConfigTreeItem(
			'Status Bar',
			showStatusBar ? 'Enabled' : 'Disabled',
			vscode.TreeItemCollapsibleState.None,
			showStatusBar ? 'pass-filled' : 'circle-large-outline',
			'notificationsInfoIcon.foreground' // Blue color
		);
		statusBarItem.command = {
			command: 'woa.toggleStatusBar',
			title: 'Toggle Status Bar'
		};
		statusBarItem.contextValue = 'statusBar';
		items.push(statusBarItem);

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

			// Notify for users filter
			const notifyUsersLabel = state.notifyForUsers && state.notifyForUsers.length > 0
				? state.notifyForUsers.join(', ')
				: 'All users';
			const notifyUsersItem = new ConfigTreeItem(
				'Notify For',
				notifyUsersLabel,
				vscode.TreeItemCollapsibleState.None,
				'person'
			);
			notifyUsersItem.command = {
				command: 'woa.selectNotifyUsers',
				title: 'Select Users to Notify For'
			};
			notifyUsersItem.contextValue = 'notifyUsers';
			items.push(notifyUsersItem);

			// Filter out users
			const filterUsersLabel = state.filterOutUsers && state.filterOutUsers.length > 0
				? state.filterOutUsers.join(', ')
				: 'None';
			const filterUsersItem = new ConfigTreeItem(
				'Filter Out',
				filterUsersLabel,
				vscode.TreeItemCollapsibleState.None,
				'filter'
			);
			filterUsersItem.command = {
				command: 'woa.selectFilterUsers',
				title: 'Select Users to Filter Out'
			};
			filterUsersItem.contextValue = 'filterUsers';
			items.push(filterUsersItem);

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
			case 'cancelled':
				return 'Cancelled';
			case 'skipped':
				return 'Skipped';
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
			case 'cancelled':
				return 'circle-slash';
			case 'skipped':
				return 'debug-step-over';
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
			case 'cancelled':
				return 'testing.iconFailed';
			case 'in_progress':
			case 'queued':
			case 'pending':
			case 'skipped':
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
