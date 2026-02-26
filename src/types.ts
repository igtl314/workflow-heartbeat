import * as vscode from 'vscode';

// Type for Octokit - defined as 'any' since we use dynamic import
export type TOctokit = any;

// Types for the Git extension API
export interface IGitExtension {
	getAPI(version: number): IGitAPI;
}

export interface IGitAPI {
	repositories: IRepository[];
}

export interface IRepository {
	rootUri: vscode.Uri;
	state: IRepositoryState;
	getBranches(query: { remote?: boolean }): Promise<IBranch[]>;
}

export interface IRepositoryState {
	remotes: IRemote[];
}

export interface IRemote {
	name: string;
	fetchUrl?: string;
	pushUrl?: string;
}

export interface IBranch {
	name: string;
	type: number; // 0 = local, 1 = remote
	remote?: string;
}

// State interfaces
export interface IMonitoringState {
	branch: string;
	workflowId: number;
	workflowName: string;
	owner: string;
	repo: string;
	lastRunId?: number;
	lastStatus?: string;
	notifyForUsers?: string[]; // Only notify for failed/cancelled workflows from these users (empty = notify for all)
}

// Quick pick item interfaces
export interface IWorkflowQuickPickItem {
	label: string;
	description: string;
	workflowId: number;
}

// Workflow run interface
export interface IWorkflowRun {
	id: number;
	name: string;
	status: string;
	conclusion: string | null;
	html_url: string;
	created_at: string;
	head_sha: string;
	run_number: number;
	actor: string;
}

// Workflow job interface
export interface IWorkflowJob {
	id: number;
	name: string;
	status: string;
	conclusion: string | null;
	html_url: string;
	started_at: string | null;
	completed_at: string | null;
}
