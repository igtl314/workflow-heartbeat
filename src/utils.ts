import type { IRepository, TOctokit, IWorkflowSubscription } from './types';

// Constants for status priority and display
const STATUS_PRIORITY: Record<string, number> = {
	'failure': 0,
	'cancelled': 1,
	'in_progress_failing': 2,
	'in_progress': 3,
	'queued': 4,
	'pending': 5,
	'success': 6,
	'skipped': 7
};

const UNKNOWN_PRIORITY = 999;

/**
 * Creates an authenticated Octokit instance using dynamic import
 * (octokit is ESM-only, so we need to use dynamic import)
 */
export async function getOctokit(token: string): Promise<TOctokit> {
	const { Octokit } = await import('octokit');
	return new Octokit({ auth: token });
}

/**
 * Returns a VS Code icon string based on workflow status
 */
export function getStatusIcon(status: string | undefined): string {
	switch (status) {
		case 'success':
			return '$(check)';
		case 'failure':
			return '$(x)';
		case 'cancelled':
			return '$(circle-slash)';
		case 'skipped':
			return '$(debug-step-over)';
		case 'in_progress':
		case 'queued':
		case 'pending':
		case 'in_progress_failing': // Still running but has failures
			return '$(sync~spin)';
		default:
			return '$(eye)';
	}
}

/**
 * Returns the status label for display
 */
export function getStatusLabel(status: string | null | undefined): string {
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
		case 'in_progress_failing':
			return 'Failing';
		case 'queued':
			return 'Queued';
		case 'pending':
			return 'Pending';
		default:
			return status || 'Unknown';
	}
}

/**
 * Returns the status icon name for VS Code Theme Icons
 */
export function getStatusIconName(status: string | null | undefined): string {
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
		case 'in_progress_failing':
			return 'sync~spin';
		default:
			return 'question';
	}
}

/**
 * Returns the color theme for status icons
 */
export function getStatusIconColor(status: string | null | undefined): string | undefined {
	switch (status) {
		case 'success':
			return 'testing.iconPassed';
		case 'failure':
		case 'cancelled':
		case 'in_progress_failing':
			return 'testing.iconFailed';
		case 'in_progress':
		case 'queued':
		case 'pending':
			return 'testing.iconQueued';
		default:
			return undefined;
	}
}

/**
 * Calculate aggregate status from multiple workflows (worst status wins)
 */
export function getAggregateStatus(workflows: IWorkflowSubscription[]): string | undefined {
	if (workflows.length === 0) {
		return undefined;
	}

	let worstStatus: string | undefined;
	let worstPriority = UNKNOWN_PRIORITY;

	for (const workflow of workflows) {
		const status = workflow.lastStatus;
		if (status) {
			const priority = STATUS_PRIORITY[status] ?? UNKNOWN_PRIORITY;
			if (priority < worstPriority) {
				worstPriority = priority;
				worstStatus = status;
			}
		}
	}

	return worstStatus;
}

/**
 * Parses GitHub owner and repo from a Git repository's remote URL
 * Supports both HTTPS and SSH formats:
 * - HTTPS: https://github.com/owner/repo.git
 * - SSH: git@github.com:owner/repo.git
 */
export function getGitHubInfo(repo: IRepository): { owner: string; repo: string } | undefined {
	for (const remote of repo.state.remotes) {
		const url = remote.fetchUrl || remote.pushUrl;
		if (!url) { continue; }

		const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
		if (match) {
			return {
				owner: match[1],
				repo: match[2].replace(/\.git$/, '')
			};
		}
	}
	return undefined;
}

/**
 * Cleans branch name by removing remote prefix (e.g., "origin/main" -> "main")
 */
export function cleanBranchName(branchName: string): string {
	if (branchName.includes('/')) {
		return branchName.split('/').slice(1).join('/');
	}
	return branchName;
}
