# Workflow Heartbeat

Monitor GitHub Actions workflows directly from VS Code and get notified when they fail.

## Features

**Multi-Workflow Monitoring**
- Monitor multiple workflows on the same branch simultaneously
- Add and remove workflows easily from the activity bar
- Set a primary workflow for dedicated status bar display
- Secondary status bar shows aggregate pass/fail for other workflows

**Status Bar Monitoring**
- Primary workflow shows full status with name and icon
- Secondary status bar shows `+N` with pass/fail indicator for other workflows
- Color-coded indicators: green for success, red for failure, yellow for in-progress
- Click on status bar to open the workflow run summary on GitHub
- Toggle button to show/hide the status bar indicator

**Activity Bar Panel**
- **Configuration View**: Select branch, manage workflows, and filter notifications by user
- **Workflows List**: View all monitored workflows with status, set primary (★), add/remove
- **GitHub Account Display**: Shows your logged-in GitHub user
- **Recent Runs View**: Browse workflow runs with expandable job details
- **Filter Options**: Hide passed runs or filter out specific users from the view
- **Load More**: "Show More Runs" button to load additional workflow runs

**Smart Notifications**
- Get notified when workflows fail or get cancelled
- Filter notifications by GitHub username - only get alerts for your own commits
- Success notifications when a previously failing workflow passes
- Non-blocking notifications that don't delay UI updates

**Job Details**
- Expand runs to see all jobs grouped by category
- View current step for in-progress jobs
- See step-by-step status in tooltips
- Click any job to open it on GitHub

## Usage

1. Click the Workflow Heartbeat icon in the activity bar (pulse/heartbeat icon)
2. Select a branch to monitor
3. Select a workflow to monitor
4. Add more workflows using "Add Another Workflow" button
5. Set your primary workflow by clicking the star icon
6. Optionally filter notifications to specific users

The extension will poll GitHub every 60 seconds and notify you of any failures.

## Requirements

- A GitHub repository with GitHub Actions workflows
- GitHub authentication (the extension will prompt you to sign in)

## Permissions

This extension requests the `repo` scope when you sign in to GitHub. This permission is required to:
- Read workflow run status and job details
- Access workflow information for private repositories

The extension only reads data and does not make any changes to your repositories.

## Extension Commands

- `Workflow Heartbeat: Select Branch and Workflow to Monitor` - Set up monitoring
- `Workflow Heartbeat: Select Branch` - Change the monitored branch
- `Workflow Heartbeat: Select Workflow` - Change the monitored workflow
- `Workflow Heartbeat: Add Another Workflow` - Add additional workflow to monitor
- `Workflow Heartbeat: Remove Workflow` - Remove a workflow from monitoring
- `Workflow Heartbeat: Set Primary Workflow` - Set which workflow appears in main status bar
- `Workflow Heartbeat: Select Users to Notify For` - Filter notifications by user
- `Workflow Heartbeat: Filter Out Users from Runs` - Hide runs from specific users
- `Workflow Heartbeat: Toggle Status Bar` - Show/hide the status bar
- `Workflow Heartbeat: Stop Monitoring` - Stop monitoring
- `Workflow Heartbeat: Refresh Status` - Manually refresh the status

## Known Issues

- The "current step" feature requires the workflow to have a long-running step to be visible (fast jobs complete before you can see the current step)

## Release Notes

### 1.2.0

New features:
- Multi-workflow monitoring on the same branch
- Dual status bar: primary workflow + aggregate for others
- Set Primary Workflow command and inline star button
- Add/Remove workflows from activity bar

Fixes:
- First workflow loads immediately when added
- Notifications no longer block UI updates

### 1.1.0

New features:
- GitHub account display in Configuration panel with sign in/sign out options
- Filter button to hide passed runs in Recent Runs view
- "Show More Runs" button to load additional workflow runs
- Option to filter out specific users from Recent Runs view
- Toggle button to show/hide status bar indicator
- Click on status bar opens the workflow run on GitHub

Fixes:
- Jobs with failing sub-jobs now correctly marked as failed

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
