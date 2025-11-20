import { useState, useEffect } from 'react';

export default function Settings() {
  const [linearApiKey, setLinearApiKey] = useState('');
  const [githubApiKey, setGithubApiKey] = useState('');
  const [hasLinearKey, setHasLinearKey] = useState(false);
  const [hasGithubKey, setHasGithubKey] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const linearKeyExists = await window.electron.store.has('linearApiKey');
      const githubKeyExists = await window.electron.store.has('githubApiKey');
      setHasLinearKey(linearKeyExists);
      setHasGithubKey(githubKeyExists);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Save Linear API key if provided
      if (linearApiKey.trim()) {
        await window.electron.store.set('linearApiKey', linearApiKey.trim());
        setHasLinearKey(true);
      }

      // Save GitHub API key if provided
      if (githubApiKey.trim()) {
        await window.electron.store.set('githubApiKey', githubApiKey.trim());
        setHasGithubKey(true);
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setLinearApiKey('');
      setGithubApiKey('');

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
      console.error('Save error:', error);
    }
  };

  const handleDeleteLinearKey = async () => {
    if (window.confirm('Are you sure you want to delete the Linear API key?')) {
      try {
        await window.electron.store.delete('linearApiKey');
        setHasLinearKey(false);
        setMessage({ type: 'success', text: 'Linear API key deleted.' });
        setTimeout(() => setMessage(null), 3000);
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to delete Linear API key.' });
        console.error('Delete error:', error);
      }
    }
  };

  const handleDeleteGithubKey = async () => {
    if (window.confirm('Are you sure you want to delete the GitHub API key?')) {
      try {
        await window.electron.store.delete('githubApiKey');
        setHasGithubKey(false);
        setMessage({ type: 'success', text: 'GitHub API key deleted.' });
        setTimeout(() => setMessage(null), 3000);
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to delete GitHub API key.' });
        console.error('Delete error:', error);
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      {message && (
        <div
          className={`mb-4 p-4 rounded ${
            message.type === 'success'
              ? 'bg-green-100 border-l-4 border-green-500 text-green-700'
              : 'bg-red-100 border-l-4 border-red-500 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Linear API Key */}
        <div className="bg-white p-6 rounded-lg shadow border border-border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Linear API Key</h2>
              <p className="text-sm text-gray-600">
                Generate a read-only API key from{' '}
                <a
                  href="https://linear.app/settings/account/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary-dark underline"
                >
                  Linear Settings → Security
                </a>
              </p>
            </div>
            {hasLinearKey && (
              <button
                type="button"
                onClick={handleDeleteLinearKey}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Delete Key
              </button>
            )}
          </div>

          <input
            type="password"
            value={linearApiKey}
            onChange={(e) => setLinearApiKey(e.target.value)}
            placeholder={hasLinearKey ? '••••••••••••••••••••' : 'Enter Linear API key'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {hasLinearKey && (
            <p className="mt-2 text-sm text-green-600">✓ API key is configured</p>
          )}
        </div>

        {/* GitHub API Key */}
        <div className="bg-white p-6 rounded-lg shadow border border-border">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">GitHub API Key (Personal Access Token)</h2>
              <p className="text-sm text-gray-600">
                Generate a personal access token from{' '}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary-dark underline"
                >
                  GitHub Settings → Developer settings → Personal access tokens
                </a>
                <br />
                Required scopes: <code className="bg-gray-100 px-1 rounded">repo</code>
              </p>
            </div>
            {hasGithubKey && (
              <button
                type="button"
                onClick={handleDeleteGithubKey}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Delete Key
              </button>
            )}
          </div>

          <input
            type="password"
            value={githubApiKey}
            onChange={(e) => setGithubApiKey(e.target.value)}
            placeholder={hasGithubKey ? '••••••••••••••••••••' : 'Enter GitHub personal access token'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {hasGithubKey && (
            <p className="mt-2 text-sm text-green-600">✓ API key is configured</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors font-medium"
          >
            Save Changes
          </button>
          <p className="text-sm text-gray-600 self-center">
            {!linearApiKey && !githubApiKey && 'Leave fields blank to keep existing keys'}
          </p>
        </div>
      </form>
    </div>
  );
}
