# Bugomattic Desktop App

A cross-platform Electron desktop application for searching and managing issues from Linear and GitHub. Built with React, TypeScript, and Tailwind CSS.

## Features

### Linear Integration
- **Team Selection**: Search and select from all available Linear teams
- **Status Filtering**: Filter issues by workflow states
- **Issue Search**: Search issues by title and description
- **Results Display**: View issue details including ID, title, status, priority, assignee, and last updated date

### GitHub Integration
- **Organization Support**: Search across your personal repositories or organization repositories
- **Repository Selection**: Select any repository you have access to
- **Advanced Filtering**: Filter by issue type (Issues/PRs/All) and state (Open/Closed)
- **Issue Search**: Search issues and pull requests
- **Labels Display**: View issue labels with their original colors

### Security
- **Local Storage**: API keys are stored securely on your local machine using electron-store
- **No Cloud Storage**: All credentials remain on your device
- **Read-Only Access**: Designed for read-only operations

## Installation

### Prerequisites
- Node.js 18+ and npm 9+
- macOS, Windows, or Linux

### Setup

1. **Navigate to the project**
   ```bash
   cd bugomattic-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run electron:build
   ```

## Configuration

### Linear API Key

1. Go to [Linear Settings → Security](https://linear.app/settings/account/security)
2. Generate a new read-only API key
3. Open Bugomattic → Settings
4. Paste your API key and save

### GitHub API Key (Personal Access Token)

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Generate a new token (classic)
3. Required scopes: `repo` (for private repositories) or `public_repo` (for public only)
4. Open Bugomattic → Settings
5. Paste your token and save

## Usage

### Searching Linear Issues

1. Click **Linear** in the navigation
2. Select a Product (Team) from the dropdown
3. (Optional) Filter by Status
4. (Optional) Enter search keywords
5. Click **Search**

### Searching GitHub Issues

1. Click **GitHub** in the navigation
2. (Optional) Select an Organization
3. Select a Repository
4. (Optional) Filter by Type (Issues/PRs/All)
5. (Optional) Filter by State (Open/Closed)
6. (Optional) Enter search keywords
7. Click **Search**

## Tech Stack

- **Electron**: Cross-platform desktop app framework
- **React**: UI framework
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **GraphQL**: API query language for Linear and GitHub
- **electron-store**: Secure local storage for API keys

## Project Structure

```
bugomattic-app/
├── electron/
│   ├── main.ts          # Electron main process
│   └── preload.ts       # Preload script for IPC
├── src/
│   ├── components/
│   │   ├── LinearSearch.tsx      # Linear search interface
│   │   ├── GitHubSearch.tsx      # GitHub search interface
│   │   ├── IssueTable.tsx        # Unified results table
│   │   └── Settings.tsx          # Settings page
│   ├── services/
│   │   ├── linearService.ts      # Linear GraphQL API
│   │   └── githubService.ts      # GitHub GraphQL API
│   ├── types/
│   │   └── electron.d.ts         # TypeScript definitions
│   ├── App.tsx                   # Main app component
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Global styles
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Development

### Running in Development Mode

```bash
npm run dev
```

This starts:
- Vite dev server on http://localhost:5173
- Electron app with hot reload
- DevTools automatically opened

### Building for Production

```bash
npm run electron:build
```

This creates distributable packages in the `dist` folder for your platform.

### Available Scripts

- `npm run dev` - Start development mode
- `npm run build` - Build for production
- `npm run electron:build` - Build and package the Electron app
- `npm run lint` - Run ESLint

## Differences from WordPress Plugin

### Advantages of Desktop App

1. **No WordPress Required**: Standalone application, no server needed
2. **Better Security**: API keys stored locally, not on a shared WordPress site
3. **Cross-Platform**: Works on macOS, Windows, and Linux
4. **GitHub Integration**: Added GitHub issue/PR search
5. **Faster Performance**: No WordPress overhead
6. **Offline Capable**: Once installed, works without internet (except for API calls)
7. **No Installation Hassles**: No need for WordPress test sites

### What's Different

- **Navigation**: Top navigation bar instead of WordPress admin sidebar
- **Settings**: Dedicated settings page accessible via navigation
- **Styling**: Modern, clean interface similar to WordPress admin aesthetic
- **API Keys**: Securely stored in your OS keychain via electron-store

## Troubleshooting

### App Won't Start
- Make sure you've run `npm install`
- Check that Node.js 18+ is installed: `node --version`

### API Errors
- Verify your API keys are correct in Settings
- For Linear: Ensure the key has read permissions
- For GitHub: Ensure the token has `repo` scope

### Search Returns No Results
- Verify you've selected a team/repository
- Try searching without filters first
- Check that your API key has access to the team/repository

## License

GPL v2 or later

## Support

For issues or questions, please create an issue in the repository.

---

Built with ❤️ to solve the problem of scattered issue tracking across Linear and GitHub.
