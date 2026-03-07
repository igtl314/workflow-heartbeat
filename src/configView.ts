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

	async getChildren(element?: ConfigTreeItem): Promise<ConfigTreeItem[]> {
		// Handle child items for collapsible elements
		if (element) {
			if (element.contextValue === 'workflows' && element.collapsibleState === vscode.TreeItemCollapsibleState.Expanded) {
				return this.getWorkflowItems();
			}
			return [];
		}

		const state = this.getMonitoringState();
		const items: ConfigTreeItem[] = [];

		// GitHub account info
		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false, silent: true });
		if (session) {
			const accountItem = new ConfigTreeItem(
				'Account',
				session.account.label,
				vscode.TreeItemCollapsibleState.None,
				'github'
			);
			accountItem.command = {
				command: 'woa.logout',
				title: 'Manage Account'
			};
			accountItem.tooltip = 'Click to manage GitHub account';
			accountItem.contextValue = 'account';
			items.push(accountItem);
		} else {
			const signInItem = new ConfigTreeItem(
				'Account',
				'Not signed in',
				vscode.TreeItemCollapsibleState.None,
				'github'
			);
			signInItem.command = {
				command: 'woa.signIn',
				title: 'Sign In'
			};
			signInItem.tooltip = 'Click to sign in to GitHub';
			signInItem.contextValue = 'account';
			items.push(signInItem);
		}

		// Repository info (show at top if available)
		if (state && state.owner && state.repo) {
			const repoItem = new ConfigTreeItem(
				'Repository',
				`${state.owner}/${state.repo}`,
				vscode.TreeItemCollapsibleState.None,
				'repo'
			);
			repoItem.contextValue = 'repo';
			items.push(repoItem);
		}

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

		// Workflows section (expandable if there are workflows, otherwise show select prompt)
		if (state && state.workflows && state.workflows.length > 0) {
			// Show workflows as expandable section
			const workflowsItem = new ConfigTreeItem(
				'Workflows',
				`${state.workflows.length} monitored`,
				vscode.TreeItemCollapsibleState.Expanded,
				'checklist'
			);
			workflowsItem.contextValue = 'workflows';
			items.push(workflowsItem);
		} else {
			// No workflows yet - show select prompt
			// Use addWorkflow if branch already selected, otherwise full selectWorkflow flow
			const workflowItem = new ConfigTreeItem(
				'Workflow',
				'Select a workflow...',
				vscode.TreeItemCollapsibleState.None,
				'workflow'
			);
			workflowItem.command = {
				command: state?.branch ? 'woa.addWorkflow' : 'woa.selectWorkflow',
				title: 'Select Workflow'
			};
			workflowItem.contextValue = 'workflow';
			items.push(workflowItem);
		}

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

		// Additional items (only show if monitoring)
		if (state && state.workflows && state.workflows.length > 0) {
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

		return items;
	}

	private getWorkflowItems(): ConfigTreeItem[] {
		const state = this.getMonitoringState();
		if (!state || !state.workflows) {
			return [];
		}

		const items: ConfigTreeItem[] = [];

		// Show each workflow with its status
		for (const workflow of state.workflows) {
			const isPrimary = workflow.isHead;
			const statusLabel = isPrimary 
				? `★ ${this.getStatusLabel(workflow.lastStatus)}`
				: this.getStatusLabel(workflow.lastStatus);
			const item = new ConfigTreeItem(
				workflow.workflowName,
				statusLabel,
				vscode.TreeItemCollapsibleState.None,
				this.getStatusIconName(workflow.lastStatus),
				this.getStatusIconColor(workflow.lastStatus)
			);
			item.contextValue = isPrimary ? 'workflowItemHead' : 'workflowItem';
			item.tooltip = `${workflow.workflowName}${isPrimary ? ' (Primary)' : ''}\nStatus: ${this.getStatusLabel(workflow.lastStatus)}\nClick star to set as primary, right-click to remove`;
			// Store workflowId for commands
			(item as any).workflowId = workflow.workflowId;
			items.push(item);
		}

		// Add "Add Another Workflow" button
		const addItem = new ConfigTreeItem(
			'Add Another Workflow',
			'',
			vscode.TreeItemCollapsibleState.None,
			'add'
		);
		addItem.command = {
			command: 'woa.addWorkflow',
			title: 'Add Workflow'
		};
		addItem.contextValue = 'addWorkflow';
		items.push(addItem);

		return items;
	}

	private getAggregateStatus(workflows: { lastStatus?: string }[]): string | undefined {
		if (workflows.length === 0) {
			return undefined;
		}
		
		const statusPriority: Record<string, number> = {
			'failure': 0,
			'cancelled': 1,
			'in_progress_failing': 2,
			'in_progress': 3,
			'queued': 4,
			'pending': 5,
			'success': 6,
			'skipped': 7
		};
		
		let worstStatus: string | undefined;
		let worstPriority = 999;
		
		for (const workflow of workflows) {
			const status = workflow.lastStatus;
			if (status) {
				const priority = statusPriority[status] ?? 999;
				if (priority < worstPriority) {
					worstPriority = priority;
					worstStatus = status;
				}
			}
		}
		
		return worstStatus;
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
