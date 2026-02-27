# Workflow Heartbeat

Monitor GitHub Actions workflows directly from VS Code and get notified when they fail.

## Features

**Status Bar Monitoring**
- See your workflow status at a glance in the status bar
- Color-coded indicators: green for success, red for failure, yellow for in-progress
- Click to configure monitoring

**Activity Bar Panel**
- **Configuration View**: Select branch, workflow, and filter notifications by user
- **Recent Runs View**: Browse the last 10 workflow runs with expandable job details

**Smart Notifications**
- Get notified when workflows fail or get cancelled
- Filter notifications by GitHub username - only get alerts for your own commits
- Success notifications when a previously failing workflow passes

**Job Details**
- Expand runs to see all jobs grouped by category
- View current step for in-progress jobs
- See step-by-step status in tooltips
- Click any job to open it on GitHub

## Usage

1. Click the Workflow Heartbeat icon in the activity bar (pulse/heartbeat icon)
2. Select a branch to monitor
3. Select a workflow to monitor
4. Optionally filter notifications to specific users

The extension will poll GitHub every 60 seconds and notify you of any failures.

## Requirements

- A GitHub repository with GitHub Actions workflows
- GitHub authentication (the extension will prompt you to sign in)

## Extension Commands

- `Workflow Heartbeat: Select Branch and Workflow to Monitor` - Set up monitoring
- `Workflow Heartbeat: Select Branch` - Change the monitored branch
- `Workflow Heartbeat: Select Workflow` - Change the monitored workflow
- `Workflow Heartbeat: Select Users to Notify For` - Filter notifications by user
- `Workflow Heartbeat: Stop Monitoring` - Stop monitoring
- `Workflow Heartbeat: Refresh Status` - Manually refresh the status

## Known Issues

- The "current step" feature requires the workflow to have a long-running step to be visible (fast jobs complete before you can see the current step)

## Release Notes

### 1.0.0

Initial release:
- Monitor GitHub Actions workflows
- Status bar integration with color-coded status
- Activity bar panel with configuration and recent runs
- Notification filtering by GitHub username
- Grouped job view for matrix builds
- Step-by-step progress in tooltips

---

**Enjoy!**
