import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLogger(context: vscode.ExtensionContext): vscode.OutputChannel {
	channel = vscode.window.createOutputChannel('Workflow Heartbeat');
	context.subscriptions.push(channel);
	return channel;
}

export function logInfo(msg: string): void {
	channel?.appendLine(`[info]  ${new Date().toISOString()} ${msg}`);
}

export function logError(msg: string, err?: unknown): void {
	const detail = err instanceof Error
		? `${err.message}\n${err.stack ?? ''}`
		: err !== undefined ? String(err) : '';
	channel?.appendLine(`[error] ${new Date().toISOString()} ${msg}${detail ? ' — ' + detail : ''}`);
}
