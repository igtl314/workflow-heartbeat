import * as vscode from 'vscode';
import type { IMonitoringState, IWorkflowRun } from './types';

export class RunsViewProvider implements vscode.TreeDataProvider<RunTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<RunTreeItem | undefined | null | void> = new vscode.EventEmitter<RunTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<RunTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private runs: IWorkflowRun[] = [];

	constructor(
		private context: vscode.ExtensionContext,
		private getMonitoringState: () => IMonitoringState | undefined
	) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	setRuns(runs: IWorkflowRun[]): void {
		this.runs = runs;
		this.refresh();
	}

	getTreeItem(element: RunTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: RunTreeItem): Thenable<RunTreeItem[]> {
		if (element) {
			return Promise.resolve([]);
		}

		const state = this.getMonitoringState();

		if (!state) {
			const noConfigItem = new RunTreeItem(
				'No workflow configured',
				'Select a branch and workflow first',
				vscode.TreeItemCollapsibleState.None,
				'info'
			);
			return Promise.resolve([noConfigItem]);
		}

		if (this.runs.length === 0) {
			const noRunsItem = new RunTreeItem(
				'No runs found',
				'Waiting for workflow runs...',
				vscode.TreeItemCollapsibleState.None,
				'info'
			);
			return Promise.resolve([noRunsItem]);
		}

		const items: RunTreeItem[] = this.runs.map(run => {
			const status = run.conclusion || run.status;
			const timeAgo = this.getTimeAgo(run.created_at);
			const commitShort = run.head_sha.substring(0, 7);

			const item = new RunTreeItem(
				`#${run.run_number}`,
				`${this.getStatusLabel(status)} • ${timeAgo} • ${commitShort}`,
				vscode.TreeItemCollapsibleState.None,
				this.getStatusIconName(status),
				this.getStatusIconColor(status)
			);

			item.command = {
				command: 'woa.openRun',
				title: 'Open Run on GitHub',
				arguments: [run.html_url]
			};

			item.tooltip = new vscode.MarkdownString(
				`**Run #${run.run_number}**\n\n` +
				`Status: ${this.getStatusLabel(status)}\n\n` +
				`Commit: \`${commitShort}\`\n\n` +
				`Created: ${new Date(run.created_at).toLocaleString()}\n\n` +
				`Click to open on GitHub`
			);

			return item;
		});

		return Promise.resolve(items);
	}

	private getStatusLabel(status: string | null): string {
		switch (status) {
			case 'success':
				return 'Passed';
			case 'failure':
				return 'Failed';
			case 'cancelled':
				return 'Cancelled';
			case 'skipped':
				return 'Skipped';
			case 'in_progress':
				return 'Running';
			case 'queued':
				return 'Queued';
			case 'pending':
				return 'Pending';
			default:
				return status || 'Unknown';
		}
	}

	private getStatusIconName(status: string | null): string {
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

	private getStatusIconColor(status: string | null): string | undefined {
		switch (status) {
			case 'success':
				return 'testing.iconPassed';
			case 'failure':
			case 'cancelled':
				return 'testing.iconFailed';
			case 'in_progress':
			case 'queued':
			case 'pending':
				return 'testing.iconQueued';
			default:
				return undefined;
		}
	}

	private getTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (seconds < 60) {
			return 'just now';
		}

		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return `${minutes}m ago`;
		}

		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			return `${hours}h ago`;
		}

		const days = Math.floor(hours / 24);
		if (days < 7) {
			return `${days}d ago`;
		}

		return date.toLocaleDateString();
	}
}

export class RunTreeItem extends vscode.TreeItem {
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
