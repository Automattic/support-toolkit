# GitHub Setup Guide

This guide will walk you through creating a GitHub repository and pushing your Support Toolkit project.

## Prerequisites

- Git installed on your computer
- GitHub account created
- Command line / Terminal access

## Step 1: Verify Local Setup

Your local repository is already initialized. Let's verify everything is ready:

```bash
cd "/Users/mauropereira/Desktop/Support Toolkit_2.5.0"
git status
```

You should see all your files listed as untracked.

## Step 2: Create GitHub Repository

### Option A: Via GitHub Website (Recommended)

1. **Go to GitHub** and log in to your account
2. **Click the "+" icon** in the top-right corner
3. **Select "New repository"**
4. **Configure your repository:**
   - **Repository name:** `support-toolkit` (or your preferred name)
   - **Description:** "A Chrome Extension for Happiness Engineers at Automattic - Quality-of-life improvements for Zendesk workflows"
   - **Visibility:** Choose Public or Private
   - **DO NOT initialize with:**
     - ❌ README (we already have one)
     - ❌ .gitignore (we already have one)
     - ❌ License (we already have one)
5. **Click "Create repository"**

### Option B: Via GitHub CLI (if installed)

```bash
gh repo create support-toolkit --public --source=. --remote=origin --description="A Chrome Extension for Happiness Engineers at Automattic"
```

## Step 3: Initial Commit

Stage all files and create your first commit:

```bash
# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: Support Toolkit v2.5.0

- Complete Chrome Extension codebase
- Interaction tracking system
- Shift management with ICS integration
- AI copilot (Google Gemini)
- Notes system
- Statistics and analytics
- Christmas theme
- Full documentation

Built with vanilla JavaScript for Happiness Engineers at Automattic."
```

## Step 4: Connect to GitHub

If you used Option A above, GitHub will show you commands like this:

```bash
# Add the remote repository (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/support-toolkit.git

# Rename default branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

**Replace `YOUR_USERNAME` with your actual GitHub username!**

### Example:
If your GitHub username is `johndoe`:
```bash
git remote add origin https://github.com/johndoe/support-toolkit.git
git branch -M main
git push -u origin main
```

## Step 5: Verify Upload

1. **Refresh your GitHub repository page**
2. **You should see:**
   - All source files
   - README.md displayed on the homepage
   - LICENSE file recognized by GitHub
   - .gitignore working (no `.DS_Store` or personal files)

## Step 6: Configure Repository Settings

### Add Topics (Tags)

1. Go to your repository page
2. Click the gear icon next to "About"
3. Add topics:
   - `chrome-extension`
   - `zendesk`
   - `productivity`
   - `support-tools`
   - `happiness-engineers`
   - `automattic`
   - `javascript`
   - `vanilla-js`

### Set Homepage (if you create one)

In the same "About" section, you can add:
- Website: Link to Chrome Web Store (once published)
- Description: Auto-filled from creation

### Enable Issues

1. Go to **Settings** → **Features**
2. Ensure **Issues** is checked
3. Enable **Discussions** for community Q&A

### Add Branch Protection (Optional but Recommended)

1. Go to **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging (when CI is set up)
   - ✅ Require conversation resolution before merging

## Step 7: Update README with Correct Links

Now that you have your GitHub repository, update the README.md:

```bash
# Edit README.md and replace placeholder URLs:
# - Change all instances of 'yourusername' to your GitHub username
# - Add Chrome Web Store link when published
# - Update contact email addresses
```

Example replacements:
```markdown
# Before:
https://github.com/yourusername/support-toolkit

# After:
https://github.com/YOUR_ACTUAL_USERNAME/support-toolkit
```

Then commit the changes:
```bash
git add README.md
git commit -m "docs: Update README with correct GitHub links"
git push
```

## Step 8: Create First Release (Optional)

Create a GitHub release for v2.5.0:

1. Go to your repository
2. Click **Releases** → **Create a new release**
3. **Choose a tag:** `v2.5.0` (create new tag)
4. **Release title:** `Support Toolkit v2.5.0 - Christmas Edition`
5. **Description:** Copy from CHANGELOG.md
6. **Attach files:** (optional)
   - ZIP of source code (auto-generated)
   - You can also create a packaged `.zip` of just the extension files
7. Click **Publish release**

## Common Issues & Solutions

### Issue: "Permission denied (publickey)"

**Solution:** Set up SSH keys or use HTTPS URL instead.

For HTTPS (easier):
```bash
git remote set-url origin https://github.com/YOUR_USERNAME/support-toolkit.git
```

### Issue: "Remote origin already exists"

**Solution:** Remove and re-add:
```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/support-toolkit.git
```

### Issue: "Updates were rejected because the remote contains work"

**Solution:** Force push (safe on initial setup):
```bash
git push -u origin main --force
```

### Issue: Files showing up that should be ignored

**Solution:** Remove from git cache:
```bash
git rm -r --cached .
git add .
git commit -m "fix: Apply .gitignore properly"
git push
```

## Next Steps After GitHub Setup

### 1. Update Contact Information

Update these files with real contact info:
- **README.md** - Email in Support & Contact section
- **SECURITY.md** - Security email address
- **CODE_OF_CONDUCT.md** - Reporting email

### 2. Set Up GitHub Actions (Optional - Future)

Create `.github/workflows/` for:
- Automated testing
- Linting checks
- Build verification
- Release automation

### 3. Create Issue Templates

Create `.github/ISSUE_TEMPLATE/`:
- Bug report template
- Feature request template
- Question template

### 4. Create Pull Request Template

Create `.github/PULL_REQUEST_TEMPLATE.md`

### 5. Add Screenshots

Take screenshots of the extension and add them to:
- README.md (create `docs/images/` folder)
- GitHub repository social preview

## Maintenance Workflow

### Daily Development

```bash
# Start new feature
git checkout -b feature/my-feature

# Make changes, test thoroughly

# Commit changes
git add .
git commit -m "feat: Add my feature"

# Push to GitHub
git push origin feature/my-feature

# Create Pull Request on GitHub
# Merge after review
```

### Creating New Releases

```bash
# Update version in manifest.json
# Update CHANGELOG.md with new version

git add manifest.json CHANGELOG.md
git commit -m "chore: Bump version to 2.6.0"
git tag v2.6.0
git push origin main --tags

# Create GitHub Release from tag
```

## Resources

- [GitHub Docs](https://docs.github.com)
- [Git Basics](https://git-scm.com/book/en/v2/Getting-Started-Git-Basics)
- [Chrome Extension Publishing](https://developer.chrome.com/docs/webstore/publish/)
- [Semantic Versioning](https://semver.org/)

## Need Help?

- **Git issues:** [GitHub Support](https://support.github.com)
- **Project questions:** Open a GitHub Discussion
- **Technical issues:** Open a GitHub Issue

---

## Quick Reference

### Most Common Commands

```bash
# Check status
git status

# Stage changes
git add .

# Commit changes
git commit -m "type: description"

# Push to GitHub
git push

# Pull latest changes
git pull

# Create new branch
git checkout -b feature/my-feature

# Switch branches
git checkout main

# View commit history
git log --oneline

# View remotes
git remote -v
```

---

**Congratulations!** Your Support Toolkit project is now on GitHub and ready for open source collaboration!
