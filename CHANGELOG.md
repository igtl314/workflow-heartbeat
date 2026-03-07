# Change Log

All notable changes to the "Workflow Heartbeat" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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