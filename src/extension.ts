import * as vscode from 'vscode';
import type { IGitExtension, IMonitoringState, ILegacyMonitoringState, IWorkflowSubscription, TOctokit, IWorkflowQuickPickItem, IWorkflowRun, IWorkflowJob } from './types';
import { getOctokit, getStatusIcon, getGitHubInfo } from './utils';
import { ConfigViewProvider } from './configView';
import { RunsViewProvider } from './runsView';

// Global state
let statusBarItem: vscode.StatusBarItem;
let secondaryStatusBarItem: vscode.StatusBarItem; // For other workflows
let pollingInterval: ReturnType<typeof setInterval> | undefined;
let octokit: TOctokit | undefined;
let configViewProvider: ConfigViewProvider;
let runsViewProvider: RunsViewProvider;
let currentState: IMonitoringState | undefined;

// Cache for GitHub info
let cachedGitHubInfo: { owner: string; repo: string } | undefined;

const POLLING_INTERVAL_MS = 60_000; // Poll every 60 seconds

function normalizeHeadWorkflow(state: IMonitoringState): void {
	if (!state.workflows || state.workflows.length === 0) {
		return;
	}

	if (state.workflows.length === 1) {
		state.workflows[0].isHead = true;
		return;
	}

	const headIndices = state.workflows
		.map((workflow, index) => workflow.isHead ? index : -1)
		.filter(index => index !== -1);

	if (headIndices.length === 0) {
		state.workflows[0].isHead = true;
		return;
	}

	const keepHeadAt = headIndices[0];
	for (let i = 0; i < state.workflows.length; i++) {
		state.workflows[i].isHead = i === keepHeadAt;
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Workflow Heartbeat is now active!');

	// Restore previous monitoring state if any, with migration for legacy format
	const savedState = context.workspaceState.get<IMonitoringState | ILegacyMonitoringState>('monitoringState');
	if (savedState) {
		// Check if it's legacy format (has workflowId instead of workflows array)
		if ('workflowId' in savedState && !('workflows' in savedState)) {
			// Migrate legacy state to new format
			const legacyState = savedState as ILegacyMonitoringState;
			currentState = {
				branch: legacyState.branch,
				owner: legacyState.owner,
				repo: legacyState.repo,
				workflows: legacyState.workflowId ? [{
					workflowId: legacyState.workflowId,
					workflowName: legacyState.workflowName,
					lastRunId: legacyState.lastRunId,
					lastStatus: legacyState.lastStatus
				}] : [],
				notifyForUsers: legacyState.notifyForUsers,
				filterOutUsers: legacyState.filterOutUsers
			};
			// Save migrated state
			context.workspaceState.update('monitoringState', currentState);
			console.log('Migrated legacy monitoring state to new format');
		} else {
			currentState = savedState as IMonitoringState;
		}
		if (currentState) {
			normalizeHeadWorkflow(currentState);
			context.workspaceState.update('monitoringState', currentState);
		}
	}

	// Create view providers for activity bar
	configViewProvider = new ConfigViewProvider(context, () => currentState);
	runsViewProvider = new RunsViewProvider(context, () => currentState);
	
	vscode.window.registerTreeDataProvider('woa.configView', configViewProvider);
	const runsTreeView = vscode.window.createTreeView('woa.runsView', { treeDataProvider: runsViewProvider });
	runsViewProvider.setTreeView(runsTreeView);

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

	// Create secondary status bar item for other workflows
	secondaryStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
	secondaryStatusBarItem.command = 'woa.openWorkflowPage';
	context.subscriptions.push(secondaryStatusBarItem);

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
	const openWorkflowPageCmd = vscode.commands.registerCommand('woa.openWorkflowPage', async () => {
		if (!currentState || currentState.workflows.length === 0) {
			return;
		}
		
		// If single workflow, open directly
		if (currentState.workflows.length === 1) {
			const workflow = currentState.workflows[0];
			if (workflow.lastRunId) {
				const url = `https://github.com/${currentState.owner}/${currentState.repo}/actions/runs/${workflow.lastRunId}`;
				vscode.env.openExternal(vscode.Uri.parse(url));
			}
			return;
		}
		
		// Multiple workflows - show quick pick
		const items = currentState.workflows
			.filter(w => w.lastRunId)
			.map(w => ({
				label: w.workflowName,
				description: w.lastStatus || 'unknown',
				workflowId: w.workflowId,
				lastRunId: w.lastRunId
			}));
		
		if (items.length === 0) {
			return;
		}
		
		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a workflow to view on GitHub',
			title: 'Open Workflow on GitHub'
		});
		
		if (selected && selected.lastRunId) {
			const url = `https://github.com/${currentState.owner}/${currentState.repo}/actions/runs/${selected.lastRunId}`;
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	});
	const showMoreRunsCmd = vscode.commands.registerCommand('woa.showMoreRuns', () => {
		runsViewProvider.showMoreRuns();
	});
	const toggleHidePassedRunsCmd = vscode.commands.registerCommand('woa.toggleHidePassedRuns', () => {
		runsViewProvider.toggleHidePassedRuns();
	});
	const signInCmd = vscode.commands.registerCommand('woa.signIn', async () => {
		await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
		configViewProvider.refresh();
	});
	const logoutCmd = vscode.commands.registerCommand('woa.logout', async () => {
		const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false, silent: true });
		if (session) {
			const confirm = await vscode.window.showWarningMessage(
				`To sign out of GitHub account "${session.account.label}", use the Accounts menu in the bottom-left corner of VS Code.`,
				'Open Accounts Menu',
				'Cancel'
			);
			if (confirm === 'Open Accounts Menu') {
				// Open the accounts menu where user can manage sign-out
				vscode.commands.executeCommand('workbench.action.openAccountsMenu');
			}
		}
	});
	
	// Add workflow command - alias for selectWorkflowOnly for clearer naming
	const addWorkflowCmd = vscode.commands.registerCommand('woa.addWorkflow', () => selectWorkflowOnly(context));
	
	// Remove workflow command
	const removeWorkflowCmd = vscode.commands.registerCommand('woa.removeWorkflow', async (arg?: number | { workflowId?: number }) => {
		if (!currentState || currentState.workflows.length === 0) {
			return;
		}
		
		// Handle both direct workflowId and TreeItem with workflowId property
		let targetWorkflowId: number | undefined;
		if (typeof arg === 'number') {
			targetWorkflowId = arg;
		} else if (arg && typeof arg === 'object' && 'workflowId' in arg) {
			targetWorkflowId = arg.workflowId;
		}
		
		// If no workflowId provided, show quick pick
		if (targetWorkflowId === undefined) {
			const items = currentState.workflows.map(w => ({
				label: w.workflowName,
				description: w.lastStatus || 'unknown',
				workflowId: w.workflowId
			}));
			
			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a workflow to remove',
				title: 'Remove Workflow from Monitoring'
			});
			
			if (!selected) {
				return;
			}
			
			targetWorkflowId = selected.workflowId;
		}
		
		// Remove the workflow
		const workflowIndex = currentState.workflows.findIndex(w => w.workflowId === targetWorkflowId);
		if (workflowIndex !== -1) {
			const removed = currentState.workflows.splice(workflowIndex, 1)[0];
			normalizeHeadWorkflow(currentState);
			
			if (currentState.workflows.length === 0) {
				// No more workflows - stop monitoring
				await stopMonitoring(context);
				vscode.window.showInformationMessage(`Removed "${removed.workflowName}" - no more workflows being monitored`);
			} else {
				// Save state and refresh
				await context.workspaceState.update('monitoringState', currentState);
				updateStatusBar(currentState);
				configViewProvider.refresh();
				// Refresh runs to remove the deleted workflow's runs
				await checkWorkflowStatus(context, currentState);
				vscode.window.showInformationMessage(`Removed "${removed.workflowName}" from monitoring`);
			}
		}
	});
	
	// Set head workflow command
	const setHeadWorkflowCmd = vscode.commands.registerCommand('woa.setHeadWorkflow', async (arg?: number | { workflowId?: number }) => {
		if (!currentState || currentState.workflows.length === 0) {
			vscode.window.showWarningMessage('No workflows configured.');
			return;
		}

		if (currentState.workflows.length === 1) {
			vscode.window.showInformationMessage('Only one workflow is configured.');
			return;
		}

		// Handle both direct workflowId and TreeItem with workflowId property
		let targetWorkflowId: number | undefined;
		if (typeof arg === 'number') {
			targetWorkflowId = arg;
		} else if (arg && typeof arg === 'object' && 'workflowId' in arg) {
			targetWorkflowId = arg.workflowId;
		}

		// If no workflowId provided, show quick pick
		if (targetWorkflowId === undefined) {
			const items = currentState.workflows.map(w => ({
				label: w.workflowName,
				description: w.isHead ? '$(star-full) Primary' : (w.lastStatus || 'unknown'),
				workflowId: w.workflowId
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select workflow to set as primary',
				title: 'Set Primary Workflow for Status Bar'
			});

			if (!selected) {
				return;
			}

			targetWorkflowId = selected.workflowId;
		}

		// Update head status
		for (const workflow of currentState.workflows) {
			workflow.isHead = workflow.workflowId === targetWorkflowId;
		}
		normalizeHeadWorkflow(currentState);

		// Save state and refresh UI
		await context.workspaceState.update('monitoringState', currentState);
		updateStatusBar(currentState);
		configViewProvider.refresh();

		const headWorkflow = currentState.workflows.find(w => w.isHead);
		if (headWorkflow) {
			vscode.window.showInformationMessage(`"${headWorkflow.workflowName}" is now the primary workflow`);
		}
	});

	// Export configuration command
	const exportConfigCmd = vscode.commands.registerCommand('woa.exportConfig', async () => {
		if (!currentState) {
			vscode.window.showWarningMessage('No configuration to export. Please set up monitoring first.');
			return;
		}

		try {
			// Prepare configuration for export (clean up runtime-only fields)
			const exportConfig: IMonitoringState = {
				branch: currentState.branch,
				owner: currentState.owner,
				repo: currentState.repo,
				workflows: currentState.workflows.map(w => ({
					workflowId: w.workflowId,
					workflowName: w.workflowName,
					isHead: w.isHead
					// Exclude lastRunId and lastStatus as they're runtime state
				})),
				notifyForUsers: currentState.notifyForUsers,
				filterOutUsers: currentState.filterOutUsers
			};

			// Show save dialog
			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file('workflow-heartbeat-config.json'),
				filters: {
					'JSON Files': ['json'],
					'All Files': ['*']
				},
				title: 'Export Workflow Heartbeat Configuration'
			});

			if (!uri) {
				return; // User cancelled
			}

			// Write configuration to file
			const configJson = JSON.stringify(exportConfig, null, 2);
			await vscode.workspace.fs.writeFile(uri, Buffer.from(configJson, 'utf8'));

			vscode.window.showInformationMessage(`Configuration exported to ${uri.fsPath}`);

		} catch (error) {
			console.error('Error exporting configuration:', error);
			vscode.window.showErrorMessage(`Failed to export configuration: ${error}`);
		}
	});

	// Import configuration command
	const importConfigCmd = vscode.commands.registerCommand('woa.importConfig', async () => {
		try {
			// Show open dialog
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				filters: {
					'JSON Files': ['json'],
					'All Files': ['*']
				},
				title: 'Import Workflow Heartbeat Configuration'
			});

			if (!uris || uris.length === 0) {
				return; // User cancelled
			}

			// Read configuration from file
			const fileContent = await vscode.workspace.fs.readFile(uris[0]);
			const configJson = Buffer.from(fileContent).toString('utf8');
			const importedConfig = JSON.parse(configJson) as IMonitoringState;

			// Validate imported configuration
			if (!importedConfig.branch || !importedConfig.owner || !importedConfig.repo) {
				vscode.window.showErrorMessage('Invalid configuration file: missing required fields (branch, owner, repo).');
				return;
			}

			if (!Array.isArray(importedConfig.workflows)) {
				vscode.window.showErrorMessage('Invalid configuration file: workflows must be an array.');
				return;
			}

			// Confirm import
			const confirmMsg = currentState
				? 'This will replace your current configuration. Continue?'
				: 'Import this configuration?';
			const confirm = await vscode.window.showWarningMessage(
				confirmMsg,
				{ modal: true },
				'Import',
				'Cancel'
			);

			if (confirm !== 'Import') {
				return;
			}

			// Apply imported configuration
			const newState: IMonitoringState = {
				branch: importedConfig.branch,
				owner: importedConfig.owner,
				repo: importedConfig.repo,
				workflows: importedConfig.workflows.map(w => ({
					workflowId: w.workflowId,
					workflowName: w.workflowName,
					isHead: w.isHead
					// lastRunId and lastStatus will be populated on first poll
				})),
				notifyForUsers: importedConfig.notifyForUsers,
				filterOutUsers: importedConfig.filterOutUsers
			};
			normalizeHeadWorkflow(newState);

			// Cache GitHub info
			cachedGitHubInfo = { owner: newState.owner, repo: newState.repo };

			// Start monitoring with imported configuration
			await startMonitoring(context, newState);

			vscode.window.showInformationMessage(
				`Configuration imported successfully. Monitoring ${newState.workflows.length} workflow(s) on branch "${newState.branch}".`
			);

		} catch (error) {
			console.error('Error importing configuration:', error);
			if (error instanceof SyntaxError) {
				vscode.window.showErrorMessage('Failed to import configuration: invalid JSON file.');
			} else {
				vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
			}
		}
	});

	context.subscriptions.push(selectWorkflowCmd, selectBranchCmd, selectWorkflowOnlyCmd, stopMonitoringCmd, refreshStatusCmd, selectNotifyUsersCmd, selectFilterUsersCmd, toggleStatusBarCmd, openRunCmd, openWorkflowPageCmd, showMoreRunsCmd, toggleHidePassedRunsCmd, signInCmd, logoutCmd, addWorkflowCmd, removeWorkflowCmd, setHeadWorkflowCmd, exportConfigCmd, importConfigCmd);

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

// Calculate aggregate status from all workflows (worst status wins)
function getAggregateStatus(workflows: IWorkflowSubscription[]): string | undefined {
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

function updateStatusBar(state: IMonitoringState | undefined) {
	const config = vscode.workspace.getConfiguration('woa');
	const showStatusBar = config.get<boolean>('showStatusBar', true);

	if (!showStatusBar) {
		statusBarItem.hide();
		secondaryStatusBarItem.hide();
		return;
	}

	if (!state || state.workflows.length === 0) {
		statusBarItem.text = '$(eye) Monitor Workflow';
		statusBarItem.command = 'woa.selectWorkflow';
		statusBarItem.tooltip = 'Click to select a workflow to monitor';
		statusBarItem.backgroundColor = undefined;
		statusBarItem.color = undefined;
		statusBarItem.show();
		secondaryStatusBarItem.hide();
		return;
	}

	// Find head workflow and other workflows
	const headWorkflow = state.workflows.find(w => w.isHead) || state.workflows[0];
	const otherWorkflows = state.workflows.filter(w => w !== headWorkflow);

	// Primary status bar - head workflow
	const headStatus = headWorkflow.lastStatus;
	const headIcon = getStatusIcon(headStatus);
	statusBarItem.text = `${headIcon} ${headWorkflow.workflowName}`;
	statusBarItem.command = 'woa.openWorkflowPage';
	statusBarItem.tooltip = `${headWorkflow.workflowName} on ${state.branch}`;
	const headBgColor = getStatusBarBackgroundColor(headStatus);
	statusBarItem.backgroundColor = headBgColor ? new vscode.ThemeColor(headBgColor) : undefined;
	statusBarItem.color = getStatusBarTextColor(headStatus);
	statusBarItem.show();

	// Secondary status bar - other workflows (aggregate pass/fail)
	if (otherWorkflows.length > 0) {
		const otherStatus = getAggregateStatus(otherWorkflows);
		const hasFailed = otherStatus === 'failure' || otherStatus === 'cancelled' || otherStatus === 'in_progress_failing';
		const otherIcon = hasFailed ? '$(x)' : '$(check)';
		secondaryStatusBarItem.text = `${otherIcon} +${otherWorkflows.length}`;
		secondaryStatusBarItem.tooltip = `${otherWorkflows.length} other workflow${otherWorkflows.length > 1 ? 's' : ''}: ${hasFailed ? 'failing' : 'passing'}`;
		secondaryStatusBarItem.backgroundColor = hasFailed 
			? new vscode.ThemeColor('statusBarItem.errorBackground') 
			: undefined;
		secondaryStatusBarItem.color = hasFailed ? undefined : '#69db7c';
		secondaryStatusBarItem.show();
	} else {
		secondaryStatusBarItem.hide();
	}
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

		// Create monitoring state with new multi-workflow format
		const state: IMonitoringState = {
			branch: branchName,
			owner: githubInfo.owner,
			repo: githubInfo.repo,
			workflows: [{
				workflowId: selectedWorkflow.workflowId,
				workflowName: selectedWorkflow.label,
				isHead: true
			}]
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
			// Reset status for all workflows when branch changes
			for (const workflow of currentState.workflows) {
				workflow.lastRunId = undefined;
				workflow.lastStatus = undefined;
			}
			await startMonitoring(context, currentState);
		} else {
			// No workflow selected yet, create partial state
			const state: IMonitoringState = {
				branch: branchName,
				owner: githubInfo.owner,
				repo: githubInfo.repo,
				workflows: []
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

		// Let user select a workflow - filter out already subscribed workflows
		const subscribedIds = new Set(currentState?.workflows.map(w => w.workflowId) || []);
		const availableWorkflows = workflowsData.workflows.filter((w: { id: number }) => !subscribedIds.has(w.id));
		
		if (availableWorkflows.length === 0) {
			vscode.window.showInformationMessage('All workflows are already being monitored.');
			return;
		}
		
		const workflowItems: IWorkflowQuickPickItem[] = availableWorkflows.map((w: { name: string; path: string; id: number }) => ({
			label: w.name,
			description: w.path,
			workflowId: w.id
		}));

		const selectedWorkflow = await vscode.window.showQuickPick(workflowItems, {
			placeHolder: 'Select a workflow to add',
			title: 'Workflow Heartbeat: Add Workflow'
		});

		if (!selectedWorkflow) {
			return; // User cancelled
		}

		// Add workflow to state
		if (currentState && currentState.branch) {
			// Ensure workflows array exists
			if (!currentState.workflows) {
				currentState.workflows = [];
			}
			// Mark as head if it's the first workflow or no head exists
			const isFirstWorkflow = currentState.workflows.length === 0 || !currentState.workflows.some(w => w.isHead);
			currentState.workflows.push({
				workflowId: selectedWorkflow.workflowId,
				workflowName: selectedWorkflow.label,
				isHead: isFirstWorkflow
			});
			currentState.owner = cachedGitHubInfo.owner;
			currentState.repo = cachedGitHubInfo.repo;
			await startMonitoring(context, currentState);
			vscode.window.showInformationMessage(`Added "${selectedWorkflow.label}" to monitoring`);
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
	if (!state.workflows || state.workflows.length === 0) {
		return;
	}

	normalizeHeadWorkflow(state);

	// Stop any existing monitoring
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = undefined;
	}

	// Reset the runs view display count when starting fresh
	runsViewProvider.resetDisplayCount();

	// Save state
	currentState = state;
	await context.workspaceState.update('monitoringState', state);

	// Update UI
	updateStatusBar(state);
	configViewProvider.refresh();
	runsViewProvider.refresh(); // Refresh runs view to show loading state

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

	// Start polling first (so it's always set up)
	pollingInterval = setInterval(() => {
		checkWorkflowStatus(context, state);
	}, POLLING_INTERVAL_MS);

	// Then do an initial check
	await checkWorkflowStatus(context, state);

	// Final refresh to ensure runs view is updated
	runsViewProvider.refresh();
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
	if (!state.workflows || state.workflows.length === 0) {
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
		const filterOutUsers = (state.filterOutUsers || []).map(u => u.toLowerCase());
		
		// Fetch runs for all workflows in parallel
		const workflowRunsPromises = state.workflows.map(async (workflow) => {
			const { data: runsData } = await octokit.rest.actions.listWorkflowRuns({
				owner: state.owner,
				repo: state.repo,
				workflow_id: workflow.workflowId,
				branch: state.branch,
				per_page: 30
			});
			return { workflow, runsData };
		});
		
		const workflowRunsResults = await Promise.all(workflowRunsPromises);
		
		// Process runs for each workflow
		const allRuns: IWorkflowRun[] = [];
		
		for (const { workflow, runsData } of workflowRunsResults) {
			const filteredRuns = runsData.workflow_runs.filter((run: any) => {
				const actor = (run.actor?.login || '').toLowerCase();
				return !filterOutUsers.includes(actor);
			});
			
			// Build runs array and check for failed steps in in-progress runs
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
					actor: run.actor?.login || 'unknown',
					workflowId: workflow.workflowId,
					workflowName: workflow.workflowName
				};
				
				// Check for failed steps in in-progress runs
				if (!run.conclusion && (run.status === 'in_progress' || run.status === 'queued' || run.status === 'pending')) {
					const hasFailure = await checkRunForFailedSteps(state, run.id);
					if (hasFailure) {
						baseRun.effectiveStatus = 'in_progress_failing';
					}
				}
				
				allRuns.push(baseRun);
			}
			
			// Update workflow status based on latest run
			if (runsData.workflow_runs.length > 0) {
				const latestRun = runsData.workflow_runs[0];
				const latestRunFromAllRuns = allRuns.find(r => r.id === latestRun.id);
				const previousStatus = workflow.lastStatus;
				const previousRunId = workflow.lastRunId;
				
				// Update workflow status
				workflow.lastRunId = latestRun.id;
				if (latestRunFromAllRuns) {
					workflow.lastStatus = latestRunFromAllRuns.effectiveStatus || (latestRun.conclusion ?? latestRun.status ?? undefined);
				} else {
					// Latest run was filtered out, need to check for failed steps separately
					let effectiveStatus = latestRun.conclusion ?? latestRun.status ?? undefined;
					if (!latestRun.conclusion && (latestRun.status === 'in_progress' || latestRun.status === 'queued' || latestRun.status === 'pending')) {
						const hasFailure = await checkRunForFailedSteps(state, latestRun.id);
						if (hasFailure) {
							effectiveStatus = 'in_progress_failing';
						}
					}
					workflow.lastStatus = effectiveStatus;
				}
				
				// Check if we should notify based on user filter
				const actor = latestRun.actor?.login || 'unknown';
				const shouldNotify = !state.notifyForUsers || state.notifyForUsers.length === 0 || state.notifyForUsers.includes(actor);

				// Show notification if the workflow failed/cancelled and it's a new run (respecting user filter)
				if ((latestRun.conclusion === 'failure' || latestRun.conclusion === 'cancelled') && latestRun.id !== previousRunId && shouldNotify) {
					const statusText = latestRun.conclusion === 'failure' ? 'failed' : 'was cancelled';
					// Don't await - let notification run in background so UI updates immediately
					vscode.window.showErrorMessage(
						`Workflow "${workflow.workflowName}" ${statusText} on branch "${state.branch}" (by ${actor})`,
						'View on GitHub',
						'Dismiss'
					).then(action => {
						if (action === 'View on GitHub') {
							vscode.env.openExternal(vscode.Uri.parse(latestRun.html_url));
						}
					});
				} else if (latestRun.conclusion === 'success' && previousStatus === 'failure' && latestRun.id !== previousRunId) {
					// Notify when a previously failing workflow succeeds
					vscode.window.showInformationMessage(
						`Workflow "${workflow.workflowName}" is now passing on branch "${state.branch}"`
					);
				}
			}
		}
		
		// Update runs view with all runs sorted by date
		allRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
		runsViewProvider.setRuns(allRuns, allRuns.length);
		
		// Save state
		currentState = state;
		await context.workspaceState.update('monitoringState', state);

		// Update UI
		updateStatusBar(state);
		configViewProvider.refresh();

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

		// Use cached actors from the primary workflow to keep filtering focused
		const headWorkflow = currentState.workflows.find(w => w.isHead) || currentState.workflows[0];
		const cachedActors = headWorkflow
			? runsViewProvider.getActors(headWorkflow.workflowId)
			: runsViewProvider.getActors();
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
		// Use cached actors from the primary workflow to keep filtering focused
		const headWorkflow = currentState.workflows.find(w => w.isHead) || currentState.workflows[0];
		const cachedActors = headWorkflow
			? runsViewProvider.getActors(headWorkflow.workflowId)
			: runsViewProvider.getActors();
		const actors = new Set<string>(cachedActors);

		// Also include any currently filtered users so they remain selectable
		if (currentState.filterOutUsers) {
			for (const user of currentState.filterOutUsers) {
				actors.add(user);
			}
		}

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
			await refreshStatus(context);

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
		await refreshStatus(context);

		const message = currentState.filterOutUsers.length > 0
			? `Filtering out runs from: ${currentState.filterOutUsers.join(', ')}`
			: 'Showing runs from all users';
		vscode.window.showInformationMessage(message);

	} catch (error) {
		console.error('Error selecting filter users:', error);
		vscode.window.showErrorMessage(`Failed to select users: ${error}`);
	}
}
