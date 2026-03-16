# GitHub Copilot Instructions

## Issue Resolution Workflow

When asked to fix an issue, follow this structured approach:

### 1. Create a Branch

Create a new branch with a descriptive name following this convention:
- Use format: `<type>/<issue-number>-<short-description>`
- Types: `fix/`, `feature/`, `refactor/`, `docs/`
- Use lowercase and hyphens (no spaces or underscores)
- Keep descriptions concise but meaningful

Examples:
- `fix/123-job-name-display`
- `feature/45-export-config`
- `refactor/67-cleanup-utils`

### 2. Draft a Plan

Before writing any code:
- Analyze the issue thoroughly to understand the problem
- Identify the relevant files and components that need changes
- Create a clear, numbered plan with specific steps
- Document the plan in the pull request description

### 3. Implement the Plan

- Follow the plan step by step
- Make focused, incremental changes
- Ensure code follows existing patterns and conventions in this codebase
- Add or update tests if applicable

### 4. Update Documentation for Release

Before creating the pull request, update the following files:

- **CHANGELOG.md**: Add an entry under a new version section (or "Unreleased") describing the changes
- **README.md**: Update the release notes section with user-facing changes and new features

### 5. Create a Pull Request

- Always create a pull request for the changes
- Include in the PR description:
  - Reference to the issue being fixed (e.g., "Fixes #123")
  - The plan that was drafted
  - Summary of changes made
  - Any notes or considerations for reviewers

## Code Style

- This is a VS Code extension written in TypeScript
- Follow existing code patterns in the repository
- Use meaningful variable and function names
- Add comments for complex logic
