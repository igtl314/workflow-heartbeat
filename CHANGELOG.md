# Change Log

All notable changes to the "Workflow Heartbeat" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- "Report Issue" action in the Configuration view that opens the extension GitHub issue page
- **Rerun Failed Jobs**: Right-click a failed run in Recent Runs and select "Rerun Failed Jobs" to trigger a rerun without leaving VS Code; also available on individual job groups — reruns only the failed jobs within that group

### Fixed
- Recent Runs section now updates immediately when filtering out users (previously required manual refresh)

### Changed
- User filter now only applies to the starred (primary) workflow, allowing other monitored workflows to display all runs unfiltered

## [1.3.1]

### Fixed
- Non-grouped job names now display only the segment after the last `/` character instead of the full path (fixes [#3](https://github.com/igtl314/workflow-heartbeat/issues/3))

## [1.3.0] - 2026-03-16

### Added
- **Export Configuration**: Export your current configuration (branch, workflows, user filters) to a JSON file
- **Import Configuration**: Import configuration from a JSON file to easily share or restore settings
- Configuration backup and sharing capabilities for team collaboration

## [1.2.0] - 2026-03-07

### Added
- **Multi-workflow monitoring**: Subscribe to multiple workflows on the same branch
- **Dual status bar**: Primary workflow gets dedicated status bar, secondary shows aggregate pass/fail for other workflows
- **Set Primary Workflow**: Choose which workflow appears in the main status bar (via command palette or inline star button)
- **Add/Remove Workflows**: Easily add or remove workflows from the activity bar
- Primary workflow indicator (★) in the workflows list

### Changed
- Repository info now appears at the top of the Configuration panel
- Removed redundant Status field from Configuration panel
- Account click now opens VS Code Accounts menu for proper sign-out

### Fixed
- First workflow now loads immediately when added (was waiting for second workflow)
- Failed workflow notifications no longer block UI updates
- Removing head workflow now promotes another workflow to primary

## [1.1.0] - 2026-03-06

### Added
- GitHub account display in Configuration panel showing logged-in user
- Sign in and sign out options for GitHub authentication
- Filter button to hide passed runs in the Recent Runs view
- "Show More Runs" button in the action bar to load additional workflow runs
- Option to filter out specific users from the Recent Runs view
- Toggle button to show/hide status bar indicator
- Click on status bar now opens the workflow run summary on GitHub

### Fixed
- Jobs with failing sub-jobs are now correctly marked as failed
- Fixed extension publishing configuration

## [1.0.0] - 2026-02-27

### Added
- Monitor GitHub Actions workflows from VS Code
- Status bar integration with color-coded status indicators
- Activity bar panel with configuration and recent runs views
- Notification filtering by GitHub username
- Grouped job view for matrix builds and nested jobs
- Step-by-step progress display in tooltips
- Click-to-open links for GitHub runs and jobs