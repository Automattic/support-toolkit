# Linear Issues Viewer WordPress Plugin

A WordPress admin plugin that allows you to view and search Linear issues directly from your WordPress dashboard.

## Features

- **Team Selection**: Select from all available Linear teams (products)
- **Real-time Status Filtering**: Filter issues by status, with statuses fetched dynamically based on the selected team
- **Issue Search**: Search issues by title, identifier, or description
- **Beautiful UI**: Clean, modern interface integrated with WordPress admin styles
- **Secure**: Uses WordPress nonces and capability checks

## Installation

1. Copy the `linear-issues-viewer` folder to your WordPress `wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to **Linear Issues > Settings** and enter your Linear API key
4. Start using the plugin from **Linear Issues** in the admin menu

## Configuration

### Getting Your Linear API Key

1. Go to Linear Settings
2. Navigate to API section
3. Generate a new API key
4. Copy the key and paste it in the plugin settings

### Default API Key

The plugin comes pre-configured with a default API key. You can change it in the settings if needed.

## Usage

1. Navigate to **Linear Issues** in the WordPress admin menu
2. Select a team (product) from the dropdown
3. Optionally select a status filter
4. Optionally enter a search term
5. Click **Search** to view issues
6. Click on any issue ID to open it in Linear

## API Information

The plugin uses the Linear GraphQL API to fetch:

- **Teams**: All teams with their IDs, keys, and names
- **Workflow States**: Statuses for each team (Todo, In Progress, Done, etc.)
- **Issues**: Issue details including:
  - Identifier (e.g., WOOMOB-1743)
  - Title and description
  - Status and priority
  - Assignee information
  - Creation and update dates
  - Direct links to Linear

## Technical Details

- **WordPress Version**: Requires WordPress 5.0+
- **PHP Version**: Requires PHP 7.4+
- **API**: Linear GraphQL API
- **Security**: Uses WordPress nonces and `manage_options` capability check

## File Structure

```
linear-issues-viewer/
├── linear-issues-viewer.php  # Main plugin file
├── assets/
│   ├── style.css             # Plugin styles
│   └── script.js             # Frontend JavaScript
└── README.md                 # This file
```

## Support

For issues or questions, please refer to the Linear API documentation or contact the plugin developer.

