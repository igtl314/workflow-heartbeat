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

const POLLING_INTERVAL_MS = 60_000; // Poll every 60 seconds

export function activate(context: vscode.ExtensionContext) {
	console.log('Workflow Heartbeat is now active!');

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
	const selectFilterUsersCmd = vscode.commands.registerCommand('woa.selectFilterUsers', () => selectFilterUsers(context));
	const toggleStatusBarCmd = vscode.commands.registerCommand('woa.toggleStatusBar', () => toggleStatusBar());
	const openRunCmd = vscode.commands.registerCommand('woa.openRun', (url: string) => {
		vscode.env.openExternal(vscode.Uri.parse(url));
	});
	const openWorkflowPageCmd = vscode.commands.registerCommand('woa.openWorkflowPage', () => {
		if (currentState && currentState.lastRunId) {
			const url = `https://github.com/${currentState.owner}/${currentState.repo}/actions/runs/${currentState.lastRunId}`;
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	});

	context.subscriptions.push(selectWorkflowCmd, selectBranchCmd, selectWorkflowOnlyCmd, stopMonitoringCmd, refreshStatusCmd, selectNotifyUsersCmd, selectFilterUsersCmd, toggleStatusBarCmd, openRunCmd, openWorkflowPageCmd);

	// Listen for configuration changes
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('woa.showStatusBar')) {
			updateStatusBar(currentState);
			configViewProvider.refresh();
		}
	}));

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
	if (lastStatus === 'failure' || lastStatus === 'cancelled' || lastStatus === 'in_progress_failing') {
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

async function toggleStatusBar(): Promise<void> {
	const config = vscode.workspace.getConfiguration('woa');
	const currentValue = config.get<boolean>('showStatusBar', true);
	await config.update('showStatusBar', !currentValue, vscode.ConfigurationTarget.Global);
}

function updateStatusBar(state: IMonitoringState | undefined) {
	const config = vscode.workspace.getConfiguration('woa');
	const showStatusBar = config.get<boolean>('showStatusBar', true);

	if (!showStatusBar) {
		statusBarItem.hide();
		return;
	}

	if (!state) {
		statusBarItem.text = '$(eye) Monitor Workflow';
		statusBarItem.command = 'woa.selectWorkflow';
		statusBarItem.tooltip = 'Click to select a workflow to monitor';
		statusBarItem.backgroundColor = undefined;
		statusBarItem.color = undefined;
		statusBarItem.show();
		return;
	}

	const statusIcon = getStatusIcon(state.lastStatus);
	statusBarItem.text = `${statusIcon} ${state.workflowName} (${state.branch})`;
	statusBarItem.command = 'woa.openWorkflowPage';
	statusBarItem.tooltip = 'Click to open workflow on GitHub';

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
			title: 'Workflow Heartbeat: Select Branch'
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
			title: 'Workflow Heartbeat: Select Workflow'
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
			title: 'Workflow Heartbeat: Select Branch'
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
			title: 'Workflow Heartbeat: Select Workflow'
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

/**
 * Check if an in-progress run has any failed jobs or steps
 */
async function checkRunForFailedSteps(state: IMonitoringState, runId: number): Promise<boolean> {
	if (!octokit) {
		return false;
	}

	try {
		const { data } = await octokit.rest.actions.listJobsForWorkflowRun({
			owner: state.owner,
			repo: state.repo,
			run_id: runId,
			per_page: 100
		});

		for (const job of data.jobs) {
			// Check if job itself has failed
			if (job.conclusion === 'failure') {
				return true;
			}
			// Check if any step has failed
			if (job.steps) {
				for (const step of job.steps) {
					if (step.conclusion === 'failure') {
						return true;
					}
				}
			}
		}
	} catch (error) {
		console.error('Error checking for failed steps:', error);
	}

	return false;
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
		// Fetch recent runs for the runs view (fetch more to allow filtering)
		const { data: runsData } = await octokit.rest.actions.listWorkflowRuns({
			owner: state.owner,
			repo: state.repo,
			workflow_id: state.workflowId,
			branch: state.branch,
			per_page: 30
		});

		// Update runs view - filter out specified users and take first 10
		const filterOutUsers = (state.filterOutUsers || []).map(u => u.toLowerCase());
		const filteredRuns = runsData.workflow_runs
			.filter((run: any) => {
				const actor = (run.actor?.login || '').toLowerCase();
				return !filterOutUsers.includes(actor);
			})
			.slice(0, 10);
		
		// Build runs array and check for failed steps in in-progress runs
		const runs: IWorkflowRun[] = [];
		for (const run of filteredRuns) {
			const baseRun: IWorkflowRun = {
				id: run.id,
				name: run.name,
				status: run.status,
				conclusion: run.conclusion,
				html_url: run.html_url,
				created_at: run.created_at,
				head_sha: run.head_sha,
				run_number: run.run_number,
				actor: run.actor?.login || 'unknown'
			};
			
			// Check for failed steps in in-progress runs
			if (!run.conclusion && (run.status === 'in_progress' || run.status === 'queued' || run.status === 'pending')) {
				const hasFailure = await checkRunForFailedSteps(state, run.id);
				if (hasFailure) {
					baseRun.effectiveStatus = 'in_progress_failing';
				}
			}
			
			runs.push(baseRun);
		}
		runsViewProvider.setRuns(runs);

		if (runsData.workflow_runs.length === 0) {
			return; // No runs yet
		}

		const latestRun = runsData.workflow_runs[0];
		const latestRunData = runs.find(r => r.id === latestRun.id);
		const previousStatus = state.lastStatus;
		const previousRunId = state.lastRunId;

		// Update state - use already calculated effectiveStatus if available, otherwise calculate
		state.lastRunId = latestRun.id;
		if (latestRunData) {
			state.lastStatus = latestRunData.effectiveStatus || (latestRun.conclusion ?? latestRun.status ?? undefined);
		} else {
			// Latest run was filtered out, need to check for failed steps separately
			let effectiveStatus = latestRun.conclusion ?? latestRun.status ?? undefined;
			if (!latestRun.conclusion && (latestRun.status === 'in_progress' || latestRun.status === 'queued' || latestRun.status === 'pending')) {
				const hasFailure = await checkRunForFailedSteps(state, latestRun.id);
				if (hasFailure) {
					effectiveStatus = 'in_progress_failing';
				}
			}
			state.lastStatus = effectiveStatus;
		}
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
			title: 'Workflow Heartbeat: Filter Notifications by User',
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

async function selectFilterUsers(context: vscode.ExtensionContext): Promise<void> {
	if (!currentState) {
		vscode.window.showWarningMessage('Please set up monitoring first.');
		return;
	}

	try {
		// Get octokit instance
		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
		if (!session) {
			vscode.window.showWarningMessage('GitHub authentication required.');
			return;
		}
		const oktokitInstance = await getOctokit(session.accessToken);

		// Fetch workflow runs from the last 30 days with progress indicator
		const actors = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Loading users from workflow runs...',
			cancellable: false
		}, async () => {
			const oneDayAgo = new Date();
			oneDayAgo.setHours(oneDayAgo.getHours() - 24);
			
			const { data: runsData } = await oktokitInstance.rest.actions.listWorkflowRuns({
				owner: currentState!.owner,
				repo: currentState!.repo,
				workflow_id: currentState!.workflowId,
				created: `>=${oneDayAgo.toISOString()}`,
				per_page: 100
			});

			// Extract all unique actors
			const actorSet = new Set<string>();
			for (const run of runsData.workflow_runs) {
				const actor = run.actor?.login;
				if (actor) {
					actorSet.add(actor);
				}
			}

			// Also include any currently filtered users so they remain selectable
			if (currentState!.filterOutUsers) {
				for (const user of currentState!.filterOutUsers) {
					actorSet.add(user);
				}
			}

			return actorSet;
		});

		if (actors.size === 0) {
			// Allow manual entry if no actors found
			const manualEntry = await vscode.window.showInputBox({
				prompt: 'Enter usernames to filter out (comma-separated)',
				placeHolder: 'e.g., renovate[bot], dependabot[bot]',
				value: currentState.filterOutUsers?.join(', ') || ''
			});

			if (manualEntry === undefined) {
				return; // User cancelled
			}

			currentState.filterOutUsers = manualEntry
				.split(',')
				.map(s => s.trim())
				.filter(s => s.length > 0);
			await context.workspaceState.update('monitoringState', currentState);
			configViewProvider.refresh();
			runsViewProvider.refresh();

			const message = currentState.filterOutUsers.length > 0
				? `Filtering out runs from: ${currentState.filterOutUsers.join(', ')}`
				: 'Showing runs from all users';
			vscode.window.showInformationMessage(message);
			return;
		}

		// Prepare quick pick items
		const currentlySelected = currentState.filterOutUsers || [];

		const userItems = Array.from(actors).sort().map(actor => {
			return {
				label: actor,
				picked: currentlySelected.includes(actor),
				username: actor
			};
		});

		// Show multi-select quick pick
		const selectedUsers = await vscode.window.showQuickPick(userItems, {
			placeHolder: 'Select users to filter OUT from runs view (e.g., bots)',
			title: 'Workflow Heartbeat: Filter Out Users from Runs',
			canPickMany: true
		});

		if (selectedUsers === undefined) {
			return; // User cancelled
		}

		// Update state with selected users
		currentState.filterOutUsers = selectedUsers.map(item => item.username);
		await context.workspaceState.update('monitoringState', currentState);
		configViewProvider.refresh();
		
		// Trigger a refresh of the runs view to apply the filter
		refreshStatus(context);

		const message = currentState.filterOutUsers.length > 0
			? `Filtering out runs from: ${currentState.filterOutUsers.join(', ')}`
			: 'Showing runs from all users';
		vscode.window.showInformationMessage(message);

	} catch (error) {
		console.error('Error selecting filter users:', error);
		vscode.window.showErrorMessage(`Failed to select users: ${error}`);
	}
}
