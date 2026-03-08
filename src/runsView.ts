import * as vscode from 'vscode';
import type { IMonitoringState, IWorkflowRun, IWorkflowJob } from './types';
import { getStatusLabel, getStatusIconName, getStatusIconColor } from './utils';

// Constants
const DEFAULT_DISPLAY_COUNT = 10;
const DISPLAY_COUNT_INCREMENT = 10;
const COMMIT_SHA_SHORT_LENGTH = 7;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

// Extended run interface with jobs
export interface IWorkflowRunWithJobs extends IWorkflowRun {
	jobs?: IWorkflowJob[];
}

type TreeItemType = 'run' | 'job' | 'info' | 'jobGroup' | 'showMore' | 'workflow';

export class RunsViewProvider implements vscode.TreeDataProvider<RunsTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<RunsTreeItem | undefined | null | void> = new vscode.EventEmitter<RunsTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<RunsTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private runs: IWorkflowRunWithJobs[] = [];
	private jobsCache: Map<string, IWorkflowJob[]> = new Map(); // Key: workflowId:runId
	private fetchJobsCallback?: (runId: number) => Promise<IWorkflowJob[]>;
	private displayCount: number = DEFAULT_DISPLAY_COUNT;
	private totalAvailable: number = 0;
	private _hidePassedRuns: boolean = false;
	private treeView?: vscode.TreeView<RunsTreeItem>;

	constructor(
		private context: vscode.ExtensionContext,
		private getMonitoringState: () => IMonitoringState | undefined
	) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	setRuns(runs: IWorkflowRunWithJobs[], totalAvailable?: number): void {
		this.runs = runs;
		if (totalAvailable !== undefined) {
			this.totalAvailable = totalAvailable;
		}
		this.refresh();
	}

	showMoreRuns(): void {
		this.displayCount += DISPLAY_COUNT_INCREMENT;
		this.refresh();
	}

	resetDisplayCount(): void {
		this.displayCount = DEFAULT_DISPLAY_COUNT;
	}

	setTreeView(treeView: vscode.TreeView<RunsTreeItem>): void {
		this.treeView = treeView;
		this.treeView.description = 'Showing all';
	}

	get hidePassedRuns(): boolean {
		return this._hidePassedRuns;
	}

	toggleHidePassedRuns(): void {
		this._hidePassedRuns = !this._hidePassedRuns;
		vscode.commands.executeCommand('setContext', 'woa.hidePassedRuns', this._hidePassedRuns);
		if (this.treeView) {
			this.treeView.description = this._hidePassedRuns ? 'Hiding passed' : 'Showing all';
		}
		this.refresh();
	}

	getActors(): string[] {
		const actors = new Set<string>();
		for (const run of this.runs) {
			if (run.actor) {
				actors.add(run.actor);
			}
		}
		return Array.from(actors);
	}

	setFetchJobsCallback(callback: (runId: number) => Promise<IWorkflowJob[]>): void {
		this.fetchJobsCallback = callback;
	}

	getTreeItem(element: RunsTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: RunsTreeItem): Promise<RunsTreeItem[]> {
		// If element is a job group, return jobs in that group
		if (element && element.itemType === 'jobGroup' && element.runId && element.groupName) {
			return this.getJobsInGroup(element.runId, element.groupName);
		}

		// If element is a run, return jobs/groups for that run
		if (element && element.itemType === 'run' && element.runId) {
			return this.getJobsForRun(element.runId);
		}

		// If element is a workflow section, return runs for that workflow
		if (element && element.itemType === 'workflow' && element.workflowId) {
			return this.getRunsForWorkflow(element.workflowId);
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

		// Check if we have multiple workflows
		const hasMultipleWorkflows = state.workflows && state.workflows.length > 1;

		if (hasMultipleWorkflows) {
			// Show workflow sections at root level
			return this.getWorkflowSections(state.workflows);
		}

		// Single workflow - show runs directly
		return this.getRunItems(this.runs);
	}

	private getWorkflowSections(workflows: { workflowId: number; workflowName: string; lastStatus?: string }[]): RunsTreeItem[] {
		return workflows.map(workflow => {
			// Get runs for this workflow to calculate status
			const workflowRuns = this.runs.filter(r => r.workflowId === workflow.workflowId);
			const runCount = workflowRuns.length;
			const status = workflow.lastStatus ?? null;

			const item = new RunsTreeItem(
				workflow.workflowName,
				`${runCount} run${runCount !== 1 ? 's' : ''}`,
				vscode.TreeItemCollapsibleState.Expanded,
				getStatusIconName(status),
				'workflow',
				getStatusIconColor(status),
				undefined,
				undefined,
				undefined,
				workflow.workflowId
			);

			return item;
		});
	}

	private getRunsForWorkflow(workflowId: number): RunsTreeItem[] {
		const workflowRuns = this.runs.filter(r => r.workflowId === workflowId);
		return this.getRunItems(workflowRuns);
	}

	private getRunItems(runs: IWorkflowRunWithJobs[]): RunsTreeItem[] {
		// Filter out passed runs if the filter is enabled
		let filteredRuns = runs;
		if (this._hidePassedRuns) {
			filteredRuns = runs.filter(run => {
				const status = run.effectiveStatus || run.conclusion || run.status;
				return status !== 'success';
			});
		}

		const items: RunsTreeItem[] = filteredRuns.slice(0, this.displayCount).map(run => {
			const status = run.effectiveStatus || run.conclusion || run.status;
			const timeAgo = this.getTimeAgo(run.created_at);
			const commitShort = run.head_sha.substring(0, COMMIT_SHA_SHORT_LENGTH);

			const item = new RunsTreeItem(
				`#${run.run_number}`,
				`${getStatusLabel(status)} • ${run.actor} • ${timeAgo}`,
				vscode.TreeItemCollapsibleState.Collapsed,
				getStatusIconName(status),
				'run',
				getStatusIconColor(status),
				run.id,
				run.html_url
			);

			item.tooltip = new vscode.MarkdownString(
				`**Run #${run.run_number}**\n\n` +
				`Status: ${getStatusLabel(status)}\n\n` +
				`Author: ${run.actor}\n\n` +
				`Commit: \`${commitShort}\`\n\n` +
				`Created: ${new Date(run.created_at).toLocaleString()}\n\n` +
				`Click to expand and see jobs`
			);

			return item;
		});

		// Add "Show More" button if there are more runs available
		if (filteredRuns.length > this.displayCount) {
			const showMoreItem = new RunsTreeItem(
				'Show More Runs',
				`${Math.min(this.displayCount, filteredRuns.length)} of ${filteredRuns.length} shown`,
				vscode.TreeItemCollapsibleState.None,
				'ellipsis',
				'showMore'
			);
			showMoreItem.command = {
				command: 'woa.showMoreRuns',
				title: 'Show More Runs'
			};
			items.push(showMoreItem);
		}

		return items;
	}

	private async getJobsForRun(runId: number): Promise<RunsTreeItem[]> {
		const run = this.runs.find(r => r.id === runId);
		const isRunInProgress = run && (run.status === 'in_progress' || run.status === 'queued' || run.status === 'pending' || !run.conclusion);
		const cacheKey = `${run?.workflowId || 0}:${runId}`;
		
		// Check cache first for completed runs
		let jobs: IWorkflowJob[] | undefined;
		if (!isRunInProgress && this.jobsCache.has(cacheKey)) {
			jobs = this.jobsCache.get(cacheKey);
		} else if (run?.jobs && run.jobs.length > 0 && !isRunInProgress) {
			jobs = run.jobs;
		}

		// Fetch jobs if not cached or if run is in progress
		if (!jobs && this.fetchJobsCallback) {
			try {
				jobs = await this.fetchJobsCallback(runId);
				
				// Cache the jobs
				this.jobsCache.set(cacheKey, jobs);
				if (run) {
					run.jobs = jobs;
				}
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

		if (!jobs || jobs.length === 0) {
			return [new RunsTreeItem(
				'No jobs found',
				'',
				vscode.TreeItemCollapsibleState.None,
				'info',
				'info'
			)];
		}

		// Group jobs by base name (e.g., "verify (ubuntu)" -> "verify")
		return this.createGroupedJobItems(jobs, runId);
	}

	private getJobsInGroup(runId: number, groupName: string): RunsTreeItem[] {
		const run = this.runs.find(r => r.id === runId);
		const cacheKey = `${run?.workflowId || 0}:${runId}`;
		const jobs = this.jobsCache.get(cacheKey);
		if (!jobs) {
			return [];
		}

		// Filter jobs that belong to this group
		const groupJobs = jobs.filter(job => this.getJobBaseName(job.name) === groupName);
		return this.createJobItems(groupJobs, true); // true = show variant name only
	}

	private getJobBaseName(jobName: string): string {
		// Extract base name from job name like "verify / lint" -> "verify"
		// First check for slash separator (GitHub Actions nested jobs)
		if (jobName.includes(' / ')) {
			return jobName.split(' / ')[0].trim();
		}
		// Then check for parentheses variant like "verify (ubuntu)" -> "verify"
		const match = jobName.match(/^(.+?)\s*\([^)]+\)\s*$/);
		return match ? match[1].trim() : jobName;
	}

	private getJobVariant(jobName: string): string | null {
		// Extract variant from job name
		// First check for slash separator like "verify / lint" -> "lint"
		if (jobName.includes(' / ')) {
			const parts = jobName.split(' / ');
			return parts.slice(1).join(' / ').trim();
		}
		// Then check for parentheses like "verify (ubuntu)" -> "ubuntu"
		const match = jobName.match(/\(([^)]+)\)\s*$/);
		return match ? match[1] : null;
	}

	private createGroupedJobItems(jobs: IWorkflowJob[], runId: number): RunsTreeItem[] {
		// Group jobs by their base name
		const groups = new Map<string, IWorkflowJob[]>();
		
		for (const job of jobs) {
			const baseName = this.getJobBaseName(job.name);
			if (!groups.has(baseName)) {
				groups.set(baseName, []);
			}
			groups.get(baseName)!.push(job);
		}

		const items: RunsTreeItem[] = [];
		
		for (const [groupName, groupJobs] of groups) {
			if (groupJobs.length === 1) {
				// Single job - show directly without grouping
				items.push(...this.createJobItems(groupJobs));
			} else {
				// Multiple jobs - create a group folder
				const groupStatus = this.getGroupStatus(groupJobs);
				const passedCount = groupJobs.filter(j => j.conclusion === 'success' || j.conclusion === 'skipped').length;
				const totalCount = groupJobs.length;
				
				const item = new RunsTreeItem(
					groupName,
					`${passedCount}/${totalCount} passed`,
					vscode.TreeItemCollapsibleState.Collapsed,
					getStatusIconName(groupStatus),
					'jobGroup',
					getStatusIconColor(groupStatus),
					runId,
					undefined,
					groupName
				);
				
				items.push(item);
			}
		}
		
		return items;
	}

	private getGroupStatus(jobs: IWorkflowJob[]): string {
		// Check for failed steps in in_progress jobs first
		const hasFailedSteps = jobs.some(j => 
			(j.status === 'in_progress' || !j.conclusion) && 
			j.steps?.some(s => s.conclusion === 'failure')
		);
		// If any job is in progress, check for failures in steps
		if (jobs.some(j => j.status === 'in_progress')) {
			// Check if any job has failed or any step has failed
			if (jobs.some(j => j.conclusion === 'failure') || hasFailedSteps) {
				return 'in_progress_failing';
			}
			return 'in_progress';
		}
		// If any job is queued/pending (and not completed), group is in progress
		if (jobs.some(j => (j.status === 'queued' || j.status === 'pending') && !j.conclusion)) {
			if (jobs.some(j => j.conclusion === 'failure') || hasFailedSteps) {
				return 'in_progress_failing';
			}
			return 'in_progress';
		}
		// If any job failed, the group failed
		if (jobs.some(j => j.conclusion === 'failure')) {
			return 'failure';
		}
		// If any job was cancelled, the group was cancelled
		if (jobs.some(j => j.conclusion === 'cancelled')) {
			return 'cancelled';
		}
		// If all jobs passed or were skipped
		if (jobs.every(j => j.conclusion === 'success' || j.conclusion === 'skipped')) {
			return 'success';
		}
		// Mixed status - show as in progress
		return 'in_progress';
	}

	private createJobItems(jobs: IWorkflowJob[], useVariantName: boolean = false): RunsTreeItem[] {
		return jobs.map(job => {
			// Determine effective status - check for failed steps in in-progress jobs
			let status = job.conclusion || job.status;
			if (!job.conclusion && (job.status === 'in_progress' || job.status === 'queued' || job.status === 'pending')) {
				const hasFailedStep = job.steps?.some(s => s.conclusion === 'failure');
				if (hasFailedStep) {
					status = 'in_progress_failing';
				}
			}
			const duration = this.getJobDuration(job);

			// Find current running step for in-progress jobs
			let currentStep: string | null = null;
			if (job.status === 'in_progress' && job.steps && job.steps.length > 0) {
				// Find the step that is currently running
				const runningStep = job.steps.find(s => s.status === 'in_progress');
				if (runningStep) {
					currentStep = runningStep.name;
				} else {
					// If no step is in_progress, find the last completed step or first queued
					const completedSteps = job.steps.filter(s => s.conclusion);
					const queuedSteps = job.steps.filter(s => s.status === 'queued');
					if (completedSteps.length > 0) {
						const lastCompleted = completedSteps[completedSteps.length - 1];
						currentStep = `✓ ${lastCompleted.name}`;
					} else if (queuedSteps.length > 0) {
						currentStep = `Starting...`;
					}
				}
			}

			const description = currentStep
				? `${getStatusLabel(status)} • ${currentStep}${duration ? ` • ${duration}` : ''}`
				: `${getStatusLabel(status)}${duration ? ` • ${duration}` : ''}`;

			// Use variant name if in a group, otherwise full name
			const variant = this.getJobVariant(job.name);
			const displayName = (useVariantName && variant) ? variant : job.name;

			const item = new RunsTreeItem(
				displayName,
				description,
				vscode.TreeItemCollapsibleState.None,
				getStatusIconName(status),
				'job',
				getStatusIconColor(status),
				undefined,
				job.html_url
			);

			item.command = {
				command: 'woa.openRun',
				title: 'Open Job on GitHub',
				arguments: [job.html_url]
			};

			// Build tooltip with step info
			let tooltipContent = `**${job.name}**\n\n` +
				`Status: ${getStatusLabel(status)}\n\n` +
				(currentStep ? `Current step: ${currentStep}\n\n` : '') +
				(duration ? `Duration: ${duration}\n\n` : '');
			
			// Add step list for in-progress jobs
			if (job.steps && job.steps.length > 0) {
				tooltipContent += `**Steps:**\n`;
				for (const step of job.steps) {
					const stepIcon = this.getStepIcon(step.status, step.conclusion);
					tooltipContent += `${stepIcon} ${step.name}\n`;
				}
				tooltipContent += '\n';
			}
			
			tooltipContent += `Click to open on GitHub`;

			item.tooltip = new vscode.MarkdownString(tooltipContent);

			return item;
		});
	}

	private getStepIcon(status: string, conclusion: string | null): string {
		if (conclusion === 'success') {
			return '✓';
		}
		if (conclusion === 'failure') {
			return '✗';
		}
		if (conclusion === 'skipped') {
			return '○';
		}
		if (status === 'in_progress') {
			return '▶';
		}
		if (status === 'queued' || status === 'pending') {
			return '◇';
		}
		return '○';
	}

	private getJobDuration(job: IWorkflowJob): string | null {
		if (!job.started_at) {
			return null;
		}

		const start = new Date(job.started_at);
		// For in-progress jobs, calculate time since start
		const end = job.completed_at ? new Date(job.completed_at) : new Date();
		const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);

		if (seconds < SECONDS_PER_MINUTE) {
			return `${seconds}s`;
		}

		const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
		const remainingSeconds = seconds % SECONDS_PER_MINUTE;

		if (minutes < MINUTES_PER_HOUR) {
			return `${minutes}m ${remainingSeconds}s`;
		}

		const hours = Math.floor(minutes / MINUTES_PER_HOUR);
		const remainingMinutes = minutes % MINUTES_PER_HOUR;
		return `${hours}h ${remainingMinutes}m`;
	}

	private getTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (seconds < SECONDS_PER_MINUTE) {
			return 'just now';
		}

		const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
		if (minutes < MINUTES_PER_HOUR) {
			return `${minutes}m ago`;
		}

		const hours = Math.floor(minutes / MINUTES_PER_HOUR);
		if (hours < HOURS_PER_DAY) {
			return `${hours}h ago`;
		}

		const days = Math.floor(hours / HOURS_PER_DAY);
		if (days < DAYS_PER_WEEK) {
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
		public readonly url?: string,
		public readonly groupName?: string,
		public readonly workflowId?: number
	) {
		super(label, collapsibleState);
		this.description = description;
		this.contextValue = itemType;
		
		const color = iconColor ? new vscode.ThemeColor(iconColor) : undefined;
		this.iconPath = new vscode.ThemeIcon(iconName, color);
	}
}
