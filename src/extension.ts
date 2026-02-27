import * as vscode from 'vscode';
import type { IGitExtension, IMonitoringState, TOctokit, IWorkflowQuickPickItem, IWorkflowRun, IWorkflowJob } from './types';
import { getOctokit, getStatusIcon, getGitHubInfo } from './utils';
import { ConfigViewProvider } from './configView';
import { RunsViewProvider } from './runsView';

// Global state
let statusBarItem: vscode.StatusBarItem;
let pollingInterval: ReturnType<typeof setInterval> | undefined;
let octokit: TOctokit | undefined;
let configViewProvider: ConfigViewProvider;
let runsViewProvider: RunsViewProvider;
let currentState: IMonitoringState | undefined;

// Cache for GitHub info
let cachedGitHubInfo: { owner: string; repo: string } | undefined;

const POLLING_INTERVAL_MS = 60000; // Poll every 60 seconds

export function activate(context: vscode.ExtensionContext) {
	console.log('Workflow Alerter is now active!');

	// Restore previous monitoring state if any
	currentState = context.workspaceState.get<IMonitoringState>('monitoringState');

	// Create view providers for activity bar
	configViewProvider = new ConfigViewProvider(context, () => currentState);
	runsViewProvider = new RunsViewProvider(context, () => currentState);
	
	vscode.window.registerTreeDataProvider('woa.configView', configViewProvider);
	vscode.window.registerTreeDataProvider('woa.runsView', runsViewProvider);

	// Set up callback for fetching jobs when expanding a run
	runsViewProvider.setFetchJobsCallback(async (runId: number): Promise<IWorkflowJob[]> => {
		try {
			const state = currentState;
			if (!state) { return []; }

			if (!octokit) {
				const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
				if (session) {
					octokit = await getOctokit(session.accessToken);
				} else {
					return [];
				}
			}

			// Fetch all jobs with pagination (default is only 30)
			const jobs: any[] = [];
			let page = 1;
			let hasMore = true;
			
			while (hasMore) {
				const { data } = await octokit.rest.actions.listJobsForWorkflowRun({
					owner: state.owner,
					repo: state.repo,
					run_id: runId,
					per_page: 100,
					page: page
				});
				
				jobs.push(...data.jobs);
				hasMore = data.jobs.length === 100;
				page++;
			}

			return jobs.map((job: any) => ({
				id: job.id,
				name: job.name,
				status: job.status,
				conclusion: job.conclusion,
				html_url: job.html_url,
				started_at: job.started_at,
				completed_at: job.completed_at,
				steps: job.steps?.map((step: any) => ({
					name: step.name,
					status: step.status,
					conclusion: step.conclusion,
					number: step.number
				}))
			}));
		} catch (error) {
			console.error('Failed to fetch jobs:', error);
			return [];
		}
	});

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = 'woa.selectWorkflow';
	statusBarItem.tooltip = 'Click to select a workflow to monitor';
	context.subscriptions.push(statusBarItem);

	// Register commands
	const selectWorkflowCmd = vscode.commands.registerCommand('woa.selectWorkflow', () => selectWorkflow(context));
	const selectBranchCmd = vscode.commands.registerCommand('woa.selectBranch', () => selectBranch(context));
	const selectWorkflowOnlyCmd = vscode.commands.registerCommand('woa.selectWorkflowOnly', () => selectWorkflowOnly(context));
	const stopMonitoringCmd = vscode.commands.registerCommand('woa.stopMonitoring', () => stopMonitoring(context));
	const refreshStatusCmd = vscode.commands.registerCommand('woa.refreshStatus', () => refreshStatus(context));
	const selectNotifyUsersCmd = vscode.commands.registerCommand('woa.selectNotifyUsers', () => selectNotifyUsers(context));
	const openRunCmd = vscode.commands.registerCommand('woa.openRun', (url: string) => {
		vscode.env.openExternal(vscode.Uri.parse(url));
	});

	context.subscriptions.push(selectWorkflowCmd, selectBranchCmd, selectWorkflowOnlyCmd, stopMonitoringCmd, refreshStatusCmd, selectNotifyUsersCmd, openRunCmd);

	if (currentState) {
		cachedGitHubInfo = { owner: currentState.owner, repo: currentState.repo };
		startMonitoring(context, currentState);
	} else {
		updateStatusBar(undefined);
	}
}

export function deactivate() {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = undefined;
	}
}

// Exported for testing
export function getStatusBarBackgroundColor(lastStatus: string | undefined): string | undefined {
	if (lastStatus === 'failure' || lastStatus === 'cancelled') {
		return 'statusBarItem.errorBackground';
	} else if (lastStatus === 'in_progress' || lastStatus === 'queued' || lastStatus === 'pending') {
		return 'statusBarItem.warningBackground';
	}
	return undefined;
}

// Exported for testing
export function getStatusBarTextColor(lastStatus: string | undefined): string | undefined {
	if (lastStatus === 'success') {
		return '#69db7c'; // Green text for success
	}
	return undefined;
}

function updateStatusBar(state: IMonitoringState | undefined) {
	if (!state) {
		statusBarItem.text = '$(eye) Monitor Workflow';
		statusBarItem.backgroundColor = undefined;
		statusBarItem.color = undefined;
		statusBarItem.show();
		return;
	}

	const statusIcon = getStatusIcon(state.lastStatus);
	statusBarItem.text = `${statusIcon} ${state.workflowName} (${state.branch})`;

	// Set background color for error and pending states
	const bgColor = getStatusBarBackgroundColor(state.lastStatus);
	statusBarItem.backgroundColor = bgColor ? new vscode.ThemeColor(bgColor) : undefined;

	// Set text color for success state
	statusBarItem.color = getStatusBarTextColor(state.lastStatus);

	statusBarItem.show();
}

async function selectWorkflow(context: vscode.ExtensionContext): Promise<void> {
	try {
		// Get the Git extension
		const gitExtension = vscode.extensions.getExtension<IGitExtension>('vscode.git');
		if (!gitExtension) {
			vscode.window.showErrorMessage('Git extension not found. Please make sure Git is installed.');
			return;
		}

		const git = gitExtension.exports.getAPI(1);
		if (git.repositories.length === 0) {
			vscode.window.showErrorMessage('No Git repository found in the workspace.');
			return;
		}

		const repo = git.repositories[0];

		// Parse GitHub info from remote URL
		const githubInfo = getGitHubInfo(repo);
		if (!githubInfo) {
			vscode.window.showErrorMessage('Could not find a GitHub remote in this repository.');
			return;
		}

		// Cache GitHub info
		cachedGitHubInfo = githubInfo;

		// Get remote branches only
		const remoteBranches = await repo.getBranches({ remote: true });

		if (remoteBranches.length === 0) {
			vscode.window.showErrorMessage('No remote branches found in the repository.');
			return;
		}

		// Let user select a branch
		const branchItems = remoteBranches.map(b => ({
			label: b.name,
			description: 'remote'
		}));

		const selectedBranch = await vscode.window.showQuickPick(branchItems, {
			placeHolder: 'Select a branch to monitor',
			title: 'Workflow Alerter: Select Branch'
		});

		if (!selectedBranch) {
			return; // User cancelled
		}

		// Authenticate with GitHub
		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
		if (!session) {
			vscode.window.showErrorMessage('GitHub authentication failed.');
			return;
		}

		octokit = await getOctokit(session.accessToken);

		// Fetch workflows from GitHub
		const { data: workflowsData } = await octokit.rest.actions.listRepoWorkflows({
			owner: githubInfo.owner,
			repo: githubInfo.repo
		});

		if (workflowsData.workflows.length === 0) {
			vscode.window.showErrorMessage('No workflows found in this repository.');
			return;
		}

		// Let user select a workflow
		const workflowItems: IWorkflowQuickPickItem[] = workflowsData.workflows.map((w: { name: string; path: string; id: number }) => ({
			label: w.name,
			description: w.path,
			workflowId: w.id
		}));

		const selectedWorkflow = await vscode.window.showQuickPick(workflowItems, {
			placeHolder: 'Select a workflow to monitor',
			title: 'Workflow Alerter: Select Workflow'
		});

		if (!selectedWorkflow) {
			return; // User cancelled
		}

		// Clean up branch name (remove remote prefix like "origin/")
		let branchName = selectedBranch.label;
		if (branchName.includes('/')) {
			branchName = branchName.split('/').slice(1).join('/');
		}

		// Create monitoring state
		const state: IMonitoringState = {
			branch: branchName,
			workflowId: selectedWorkflow.workflowId,
			workflowName: selectedWorkflow.label,
			owner: githubInfo.owner,
			repo: githubInfo.repo
		};

		// Start monitoring
		await startMonitoring(context, state);

		vscode.window.showInformationMessage(
			`Now monitoring "${selectedWorkflow.label}" on branch "${branchName}"`
		);

	} catch (error) {
		console.error('Error selecting workflow:', error);
		vscode.window.showErrorMessage(`Failed to set up monitoring: ${error}`);
	}
}

async function selectBranch(context: vscode.ExtensionContext): Promise<void> {
	try {
		// Get the Git extension
		const gitExtension = vscode.extensions.getExtension<IGitExtension>('vscode.git');
		if (!gitExtension) {
			vscode.window.showErrorMessage('Git extension not found. Please make sure Git is installed.');
			return;
		}

		const git = gitExtension.exports.getAPI(1);
		if (git.repositories.length === 0) {
			vscode.window.showErrorMessage('No Git repository found in the workspace.');
			return;
		}

		const repo = git.repositories[0];

		// Parse GitHub info from remote URL
		const githubInfo = getGitHubInfo(repo);
		if (!githubInfo) {
			vscode.window.showErrorMessage('Could not find a GitHub remote in this repository.');
			return;
		}

		// Cache GitHub info
		cachedGitHubInfo = githubInfo;

		// Get remote branches only
		const remoteBranches = await repo.getBranches({ remote: true });

		if (remoteBranches.length === 0) {
			vscode.window.showErrorMessage('No remote branches found in the repository.');
			return;
		}

		// Let user select a branch
		const branchItems = remoteBranches.map(b => ({
			label: b.name,
			description: 'remote'
		}));

		const selectedBranch = await vscode.window.showQuickPick(branchItems, {
			placeHolder: 'Select a branch to monitor',
			title: 'Workflow Alerter: Select Branch'
		});

		if (!selectedBranch) {
			return; // User cancelled
		}

		// Clean up branch name (remove remote prefix like "origin/")
		let branchName = selectedBranch.label;
		if (branchName.includes('/')) {
			branchName = branchName.split('/').slice(1).join('/');
		}

		// Update or create state with new branch
		if (currentState) {
			currentState.branch = branchName;
			currentState.owner = githubInfo.owner;
			currentState.repo = githubInfo.repo;
			currentState.lastRunId = undefined;
			currentState.lastStatus = undefined;
			await startMonitoring(context, currentState);
		} else {
			// No workflow selected yet, create partial state
			const state: IMonitoringState = {
				branch: branchName,
				workflowId: 0,
				workflowName: '',
				owner: githubInfo.owner,
				repo: githubInfo.repo
			};
			currentState = state;
			await context.workspaceState.update('monitoringState', state);
			configViewProvider.refresh();
		}

	} catch (error) {
		console.error('Error selecting branch:', error);
		vscode.window.showErrorMessage(`Failed to select branch: ${error}`);
	}
}

async function selectWorkflowOnly(context: vscode.ExtensionContext): Promise<void> {
	try {
		// Ensure we have GitHub info
		if (!cachedGitHubInfo) {
			const gitExtension = vscode.extensions.getExtension<IGitExtension>('vscode.git');
			if (!gitExtension) {
				vscode.window.showErrorMessage('Git extension not found. Please make sure Git is installed.');
				return;
			}

			const git = gitExtension.exports.getAPI(1);
			if (git.repositories.length === 0) {
				vscode.window.showErrorMessage('No Git repository found in the workspace.');
				return;
			}

			const repo = git.repositories[0];
			cachedGitHubInfo = getGitHubInfo(repo);
			if (!cachedGitHubInfo) {
				vscode.window.showErrorMessage('Could not find a GitHub remote in this repository.');
				return;
			}
		}

		// Authenticate with GitHub
		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
		if (!session) {
			vscode.window.showErrorMessage('GitHub authentication failed.');
			return;
		}

		octokit = await getOctokit(session.accessToken);

		// Fetch workflows from GitHub
		const { data: workflowsData } = await octokit.rest.actions.listRepoWorkflows({
			owner: cachedGitHubInfo.owner,
			repo: cachedGitHubInfo.repo
		});

		if (workflowsData.workflows.length === 0) {
			vscode.window.showErrorMessage('No workflows found in this repository.');
			return;
		}

		// Let user select a workflow
		const workflowItems: IWorkflowQuickPickItem[] = workflowsData.workflows.map((w: { name: string; path: string; id: number }) => ({
			label: w.name,
			description: w.path,
			workflowId: w.id
		}));

		const selectedWorkflow = await vscode.window.showQuickPick(workflowItems, {
			placeHolder: 'Select a workflow to monitor',
			title: 'Workflow Alerter: Select Workflow'
		});

		if (!selectedWorkflow) {
			return; // User cancelled
		}

		// Update or create state with new workflow
		if (currentState && currentState.branch) {
			currentState.workflowId = selectedWorkflow.workflowId;
			currentState.workflowName = selectedWorkflow.label;
			currentState.owner = cachedGitHubInfo.owner;
			currentState.repo = cachedGitHubInfo.repo;
			currentState.lastRunId = undefined;
			currentState.lastStatus = undefined;
			await startMonitoring(context, currentState);
		} else {
			// No branch selected yet, prompt to select branch first
			vscode.window.showWarningMessage('Please select a branch first.');
		}

	} catch (error) {
		console.error('Error selecting workflow:', error);
		vscode.window.showErrorMessage(`Failed to select workflow: ${error}`);
	}
}

async function startMonitoring(context: vscode.ExtensionContext, state: IMonitoringState): Promise<void> {
	// Don't start monitoring if no workflow is selected
	if (!state.workflowId || !state.workflowName) {
		return;
	}

	// Stop any existing monitoring
	if (pollingInterval) {
		clearInterval(pollingInterval);
	}

	// Save state
	currentState = state;
	await context.workspaceState.update('monitoringState', state);

	// Update UI
	updateStatusBar(state);
	configViewProvider.refresh();

	// Ensure we have an authenticated Octokit instance
	if (!octokit) {
		try {
			const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
			if (session) {
				octokit = await getOctokit(session.accessToken);
			}
		} catch {
			// Will try again on next poll
		}
	}

	// Do an initial check
	await checkWorkflowStatus(context, state);

	// Start polling
	pollingInterval = setInterval(() => {
		checkWorkflowStatus(context, state);
	}, POLLING_INTERVAL_MS);
}

async function checkWorkflowStatus(context: vscode.ExtensionContext, state: IMonitoringState): Promise<void> {
	// Don't check if no workflow is selected
	if (!state.workflowId) {
		return;
	}

	if (!octokit) {
		try {
			const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
			if (session) {
				octokit = await getOctokit(session.accessToken);
			} else {
				return; // No session available
			}
		} catch {
			return;
		}
	}

	try {
		// Fetch recent runs for the runs view
		const { data: runsData } = await octokit.rest.actions.listWorkflowRuns({
			owner: state.owner,
			repo: state.repo,
			workflow_id: state.workflowId,
			branch: state.branch,
			per_page: 10
		});

		// Update runs view
		const runs: IWorkflowRun[] = runsData.workflow_runs.map((run: any) => ({
			id: run.id,
			name: run.name,
			status: run.status,
			conclusion: run.conclusion,
			html_url: run.html_url,
			created_at: run.created_at,
			head_sha: run.head_sha,
			run_number: run.run_number,
			actor: run.actor?.login || 'unknown'
		}));
		runsViewProvider.setRuns(runs);

		if (runsData.workflow_runs.length === 0) {
			return; // No runs yet
		}

		const latestRun = runsData.workflow_runs[0];
		const previousStatus = state.lastStatus;
		const previousRunId = state.lastRunId;

		// Update state
		state.lastRunId = latestRun.id;
		state.lastStatus = latestRun.conclusion ?? latestRun.status ?? undefined;
		currentState = state;
		await context.workspaceState.update('monitoringState', state);

		// Update UI
		updateStatusBar(state);
		configViewProvider.refresh();

		// Check if we should notify based on user filter
		const actor = latestRun.actor?.login || 'unknown';
		const shouldNotify = !state.notifyForUsers || state.notifyForUsers.length === 0 || state.notifyForUsers.includes(actor);

		// Show notification if the workflow failed/cancelled and it's a new run (respecting user filter)
		if ((latestRun.conclusion === 'failure' || latestRun.conclusion === 'cancelled') && latestRun.id !== previousRunId && shouldNotify) {
			const statusText = latestRun.conclusion === 'failure' ? 'failed' : 'was cancelled';
			const action = await vscode.window.showErrorMessage(
				`Workflow "${state.workflowName}" ${statusText} on branch "${state.branch}" (by ${actor})`,
				'View on GitHub',
				'Dismiss'
			);

			if (action === 'View on GitHub') {
				vscode.env.openExternal(vscode.Uri.parse(latestRun.html_url));
			}
		} else if (latestRun.conclusion === 'success' && previousStatus === 'failure' && latestRun.id !== previousRunId) {
			// Notify when a previously failing workflow succeeds
			vscode.window.showInformationMessage(
				`Workflow "${state.workflowName}" is now passing on branch "${state.branch}"`
			);
		}

	} catch (error) {
		console.error('Error checking workflow status:', error);
	}
}

async function stopMonitoring(context: vscode.ExtensionContext): Promise<void> {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = undefined;
	}

	currentState = undefined;
	await context.workspaceState.update('monitoringState', undefined);
	updateStatusBar(undefined);
	configViewProvider.refresh();
	runsViewProvider.setRuns([]);

	vscode.window.showInformationMessage('Stopped monitoring workflow.');
}

async function refreshStatus(context: vscode.ExtensionContext): Promise<void> {
	if (currentState) {
		await checkWorkflowStatus(context, currentState);
	}
}

async function selectNotifyUsers(context: vscode.ExtensionContext): Promise<void> {
	if (!currentState) {
		vscode.window.showWarningMessage('Please set up monitoring first.');
		return;
	}

	try {
		// Get current GitHub user from session
		let currentGitHubUser: string | undefined;
		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
		if (session) {
			currentGitHubUser = session.account.label;
		}

		// Use cached actors from runsViewProvider instead of making API call
		const cachedActors = runsViewProvider.getActors();
		const actors = new Set<string>(cachedActors);

		// Always include current user even if they haven't run the workflow
		if (currentGitHubUser) {
			actors.add(currentGitHubUser);
		}

		if (actors.size === 0) {
			vscode.window.showWarningMessage('No workflow runs found to determine users.');
			return;
		}

		// Prepare quick pick items
		const currentlySelected = currentState.notifyForUsers || [];
		const isFirstTimeSetup = currentState.notifyForUsers === undefined;
		
		const userItems = Array.from(actors).sort().map(actor => {
			const isCurrentUser = actor === currentGitHubUser;
			// Auto-select current user on first setup, otherwise use saved selection
			const shouldBePicked = isFirstTimeSetup 
				? isCurrentUser 
				: currentlySelected.includes(actor);
			
			return {
				label: isCurrentUser ? `${actor} (me)` : actor,
				picked: shouldBePicked,
				username: actor // Store actual username for later
			};
		});

		// Show multi-select quick pick
		const selectedUsers = await vscode.window.showQuickPick(userItems, {
			placeHolder: 'Select users to notify for (empty = notify for all)',
			title: 'Workflow Alerter: Filter Notifications by User',
			canPickMany: true
		});

		if (selectedUsers === undefined) {
			return; // User cancelled
		}

		// Update state with selected users (use actual username, not the display label)
		currentState.notifyForUsers = selectedUsers.map(item => item.username);
		await context.workspaceState.update('monitoringState', currentState);
		configViewProvider.refresh();

		const message = currentState.notifyForUsers.length > 0
			? `Will notify for failures from: ${currentState.notifyForUsers.join(', ')}`
			: 'Will notify for failures from all users';
		vscode.window.showInformationMessage(message);

	} catch (error) {
		console.error('Error selecting notify users:', error);
		vscode.window.showErrorMessage(`Failed to select users: ${error}`);
	}
}
