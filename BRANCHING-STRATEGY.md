# ViewVault Branching Strategy

## Overview
This project uses **Git Flow** - a robust branching strategy that ensures stability while enabling development.

## Branch Structure

### 🌟 **Main Branches**

#### `main` (Production)
- **Purpose**: Always stable, deployed to production users
- **When to use**: Only for tested, stable releases
- **Protection**: Should be protected on GitHub
- **Deployment**: Auto-deploys to production NAS

#### `develop` (Development)
- **Purpose**: Integration branch for new features
- **When to use**: Daily development work
- **Protection**: Can be force-pushed during development
- **Deployment**: Can be deployed to test environment

#### `stable/working-version` (Stable)
- **Purpose**: Tested features ready for production
- **When to use**: Before merging to main
- **Protection**: Should be stable and tested
- **Deployment**: Can be deployed to staging

### 🔧 **Supporting Branches**

#### `feature/*` (Feature Development)
- **Purpose**: Individual features or experiments
- **Naming**: `feature/user-authentication`, `feature/dark-mode`
- **Lifecycle**: Created from `develop`, merged back to `develop`
- **Example**: `git checkout -b feature/advanced-search develop`

#### `hotfix/*` (Emergency Fixes)
- **Purpose**: Critical fixes for production
- **Naming**: `hotfix/security-patch`, `hotfix/crash-fix`
- **Lifecycle**: Created from `main`, merged to both `main` and `develop`
- **Example**: `git checkout -b hotfix/critical-bug main`

#### `release/*` (Release Preparation)
- **Purpose**: Prepare releases for production
- **Naming**: `release/v1.2.0`, `release/v2.0.0`
- **Lifecycle**: Created from `develop`, merged to `main` and `develop`
- **Example**: `git checkout -b release/v1.2.0 develop`

## Workflow Examples

### 🚀 **Daily Development Work**

```bash
# 1. Start from develop
git checkout develop
git pull origin develop

# 2. Create feature branch
git checkout -b feature/new-feature

# 3. Make changes and commit
git add .
git commit -m "Add new feature"

# 4. Push feature branch
git push -u origin feature/new-feature

# 5. Create Pull Request on GitHub to merge into develop
```

### 🔄 **Feature Complete - Merge to Develop**

```bash
# 1. Switch to develop and pull latest
git checkout develop
git pull origin develop

# 2. Merge feature branch
git merge feature/new-feature

# 3. Push develop
git push origin develop

# 4. Delete feature branch (optional)
git branch -d feature/new-feature
git push origin --delete feature/new-feature
```

### 📦 **Release to Production**

```bash
# 1. Create release branch from develop
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# 2. Make any final adjustments (version numbers, etc.)
# 3. Merge to main
git checkout main
git merge release/v1.2.0

# 4. Tag the release
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0

# 5. Merge back to develop
git checkout develop
git merge release/v1.2.0

# 6. Push both branches
git push origin main
git push origin develop

# 7. Delete release branch
git branch -d release/v1.2.0
git push origin --delete release/v1.2.0
```

### 🚨 **Emergency Hotfix**

```bash
# 1. Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix

# 2. Fix the issue
git add .
git commit -m "Fix critical issue"

# 3. Merge to main
git checkout main
git merge hotfix/critical-fix

# 4. Tag hotfix
git tag -a v1.2.1 -m "Hotfix for critical issue"
git push origin v1.2.1

# 5. Merge to develop
git checkout develop
git merge hotfix/critical-fix

# 6. Push both branches
git push origin main
git push origin develop

# 7. Delete hotfix branch
git branch -d hotfix/critical-fix
git push origin --delete hotfix/critical-fix
```

## Current Setup

### ✅ **What's Already Set Up**
- `main` - Production branch (current stable version)
- `develop` - Development branch (for new features)
- `stable/working-version` - Stable testing branch

### 🔧 **What You Should Do Next**

1. **Set up branch protection on GitHub**:
   - Protect `main` branch (require PR reviews)
   - Protect `stable/working-version` branch
   - Allow force-push to `develop` for development

2. **Configure deployments**:
   - `main` → Production NAS (current setup)
   - `develop` → Test environment (optional)
   - `stable/working-version` → Staging environment (optional)

## Best Practices

### 🎯 **Do's**
- Always work on feature branches, never directly on main
- Keep `main` stable and deployable
- Use descriptive commit messages
- Test features on `develop` before merging to `main`
- Use tags for releases

### ❌ **Don'ts**
- Never force-push to `main`
- Don't commit directly to `main` or `develop`
- Don't let feature branches get too old
- Don't skip testing before production releases

### 🔍 **When to Use Each Branch**

- **`main`**: Only for tested, stable releases
- **`develop`**: Daily development and feature integration
- **`stable/working-version`**: Testing completed features
- **`feature/*`**: Individual feature development
- **`hotfix/*`**: Critical production fixes
- **`release/*`**: Preparing releases

## Quick Reference Commands

```bash
# See all branches
git branch -a

# Switch to main (production)
git checkout main

# Switch to develop (development)
git checkout develop

# Create feature branch
git checkout -b feature/name develop

# Create hotfix branch
git checkout -b hotfix/name main

# See branch status
git status

# See commit history
git log --oneline --graph --all
```

This strategy gives you:
- **Stability**: `main` is always safe
- **Flexibility**: `develop` for daily work
- **Safety**: Feature branches for experiments
- **Emergency handling**: Hotfix branches for critical issues
- **Release management**: Proper versioning and tagging
