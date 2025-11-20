import { useState, useEffect } from 'react';
import {
  getGitHubOrganizations,
  getGitHubRepositories,
  searchGitHubIssues,
  type GitHubRepository,
  type GitHubIssue,
} from '../services/githubService';
import IssueTable from './IssueTable';

export default function GitHubSearch() {
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [state, setState] = useState<'OPEN' | 'CLOSED' | ''>('');
  const [type, setType] = useState<'ISSUE' | 'PULL_REQUEST' | 'ALL'>('ALL');
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const hasKey = await window.electron.store.has('githubApiKey');
      setHasApiKey(hasKey);
      if (hasKey) {
        loadOrganizations();
        loadRepositories();
      }
    } catch (err) {
      console.error('Failed to check API key:', err);
    }
  };

  const loadOrganizations = async () => {
    try {
      const orgs = await getGitHubOrganizations();
      setOrganizations(orgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadRepositories = async (org?: string) => {
    try {
      setLoading(true);
      const repos = await getGitHubRepositories(org);
      setRepositories(repos);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  };

  const handleOrgChange = (org: string) => {
    setSelectedOrg(org);
    setSelectedRepo(null);
    setIssues([]);
    if (org) {
      loadRepositories(org);
    } else {
      loadRepositories();
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!selectedRepo) {
      setError('Please select a repository first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await searchGitHubIssues({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        search: searchTerm || undefined,
        state: state || undefined,
        type,
      });
      setIssues(results);
    } catch (err: any) {
      setError(err.message || 'Failed to search issues');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedOrg('');
    setSelectedRepo(null);
    setState('');
    setType('ALL');
    setSearchTerm('');
    setIssues([]);
    setError(null);
    loadRepositories();
  };

  if (!hasApiKey) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            Please configure your GitHub API key in Settings to use this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Search GitHub Issues</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow border border-border mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          {/* Organization Selection */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold mb-2">Organization (Optional):</label>
            <select
              value={selectedOrg}
              onChange={(e) => handleOrgChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Your Repositories</option>
              {organizations.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          </div>

          {/* Repository Selection */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold mb-2">Repository:</label>
            <select
              value={selectedRepo?.id || ''}
              onChange={(e) => {
                const repo = repositories.find((r) => r.id === e.target.value);
                setSelectedRepo(repo || null);
                setIssues([]);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a repository...</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.nameWithOwner}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-semibold mb-2">Type:</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All</option>
              <option value="ISSUE">Issues</option>
              <option value="PULL_REQUEST">Pull Requests</option>
            </select>
          </div>

          {/* State Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-semibold mb-2">State:</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value as typeof state)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold mb-2">Search:</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search issues/PRs..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 items-end">
            <button
              type="submit"
              disabled={loading || !selectedRepo}
              className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {loading && (
        <div className="text-center py-10">
          <p className="text-gray-600">Loading...</p>
        </div>
      )}

      {!loading && issues.length === 0 && selectedRepo && (
        <div className="text-center py-10 text-gray-600">
          {searchTerm || state ? 'No issues found.' : 'Enter a search term or select filters to find issues.'}
        </div>
      )}

      {!loading && issues.length > 0 && (
        <IssueTable issues={issues} type="github" />
      )}
    </div>
  );
}
