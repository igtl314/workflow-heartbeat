import * as vscode from 'vscode';
import type { IMonitoringState, IWorkflowRun, IWorkflowJob } from './types';

// Extended run interface with jobs
export interface IWorkflowRunWithJobs extends IWorkflowRun {
	jobs?: IWorkflowJob[];
}

type TreeItemType = 'run' | 'job' | 'info';

export class RunsViewProvider implements vscode.TreeDataProvider<RunsTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<RunsTreeItem | undefined | null | void> = new vscode.EventEmitter<RunsTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<RunsTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private runs: IWorkflowRunWithJobs[] = [];
	private fetchJobsCallback?: (runId: number) => Promise<IWorkflowJob[]>;

	constructor(
		private context: vscode.ExtensionContext,
		private getMonitoringState: () => IMonitoringState | undefined
	) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	setRuns(runs: IWorkflowRunWithJobs[]): void {
		this.runs = runs;
		this.refresh();
	}

	setFetchJobsCallback(callback: (runId: number) => Promise<IWorkflowJob[]>): void {
		this.fetchJobsCallback = callback;
	}

	getTreeItem(element: RunsTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: RunsTreeItem): Promise<RunsTreeItem[]> {
		// If element is provided, return jobs for that run
		if (element && element.itemType === 'run' && element.runId) {
			return this.getJobsForRun(element.runId);
		}

		const state = this.getMonitoringState();

		if (!state) {
			const noConfigItem = new RunsTreeItem(
				'No workflow configured',
				'Select a branch and workflow first',
				vscode.TreeItemCollapsibleState.None,
				'info',
				'info'
			);
			return [noConfigItem];
		}

		if (this.runs.length === 0) {
			const noRunsItem = new RunsTreeItem(
				'No runs found',
				'Waiting for workflow runs...',
				vscode.TreeItemCollapsibleState.None,
				'info',
				'info'
			);
			return [noRunsItem];
		}

		const items: RunsTreeItem[] = this.runs.map(run => {
			const status = run.conclusion || run.status;
			const timeAgo = this.getTimeAgo(run.created_at);
			const commitShort = run.head_sha.substring(0, 7);

			const item = new RunsTreeItem(
				`#${run.run_number}`,
				`${this.getStatusLabel(status)} • ${timeAgo} • ${commitShort}`,
				vscode.TreeItemCollapsibleState.Collapsed,
				this.getStatusIconName(status),
				'run',
				this.getStatusIconColor(status),
				run.id,
				run.html_url
			);

			item.tooltip = new vscode.MarkdownString(
				`**Run #${run.run_number}**\n\n` +
				`Status: ${this.getStatusLabel(status)}\n\n` +
				`Commit: \`${commitShort}\`\n\n` +
				`Created: ${new Date(run.created_at).toLocaleString()}\n\n` +
				`Click to expand and see jobs`
			);

			return item;
		});

		return items;
	}

	private async getJobsForRun(runId: number): Promise<RunsTreeItem[]> {
		// Check if we already have jobs cached
		const run = this.runs.find(r => r.id === runId);
		
		if (run?.jobs && run.jobs.length > 0) {
			return this.createJobItems(run.jobs);
		}

		// Fetch jobs if we have a callback
		if (this.fetchJobsCallback) {
			try {
				const jobs = await this.fetchJobsCallback(runId);
				
				// Cache the jobs
				if (run) {
					run.jobs = jobs;
				}

				if (jobs.length === 0) {
					return [new RunsTreeItem(
						'No jobs found',
						'',
						vscode.TreeItemCollapsibleState.None,
						'info',
						'info'
					)];
				}

				return this.createJobItems(jobs);
			} catch (error) {
				console.error('Error fetching jobs:', error);
				return [new RunsTreeItem(
					'Error loading jobs',
					'',
					vscode.TreeItemCollapsibleState.None,
					'error',
					'info'
				)];
			}
		}

		return [new RunsTreeItem(
			'Jobs not available',
			'',
			vscode.TreeItemCollapsibleState.None,
			'info',
			'info'
		)];
	}

	private createJobItems(jobs: IWorkflowJob[]): RunsTreeItem[] {
		return jobs.map(job => {
			const status = job.conclusion || job.status;
			const duration = this.getJobDuration(job);

			const item = new RunsTreeItem(
				job.name,
				`${this.getStatusLabel(status)}${duration ? ` • ${duration}` : ''}`,
				vscode.TreeItemCollapsibleState.None,
				this.getStatusIconName(status),
				'job',
				this.getStatusIconColor(status),
				undefined,
				job.html_url
			);

			item.command = {
				command: 'woa.openRun',
				title: 'Open Job on GitHub',
				arguments: [job.html_url]
			};

			item.tooltip = new vscode.MarkdownString(
				`**${job.name}**\n\n` +
				`Status: ${this.getStatusLabel(status)}\n\n` +
				(duration ? `Duration: ${duration}\n\n` : '') +
				`Click to open on GitHub`
			);

			return item;
		});
	}

	private getJobDuration(job: IWorkflowJob): string | null {
		if (!job.started_at || !job.completed_at) {
			return null;
		}

		const start = new Date(job.started_at);
		const end = new Date(job.completed_at);
		const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

		if (seconds < 60) {
			return `${seconds}s`;
		}

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		if (minutes < 60) {
			return `${minutes}m ${remainingSeconds}s`;
		}

		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return `${hours}h ${remainingMinutes}m`;
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

export class RunsTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly description: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly iconName: string,
		public readonly itemType: TreeItemType,
		public readonly iconColor?: string,
		public readonly runId?: number,
		public readonly url?: string
	) {
		super(label, collapsibleState);
		this.description = description;
		this.contextValue = itemType;
		
		const color = iconColor ? new vscode.ThemeColor(iconColor) : undefined;
		this.iconPath = new vscode.ThemeIcon(iconName, color);
	}
}
