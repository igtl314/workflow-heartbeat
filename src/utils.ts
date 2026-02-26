import type { IRepository, TOctokit } from './types';

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
		case 'in_progress':
		case 'queued':
		case 'pending':
			return '$(sync~spin)';
		default:
			return '$(eye)';
	}
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
