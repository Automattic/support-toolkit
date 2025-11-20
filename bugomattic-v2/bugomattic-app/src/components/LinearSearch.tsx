import { useState, useEffect } from 'react';
import {
  getLinearTeams,
  getLinearWorkflowStates,
  searchLinearIssues,
  type LinearTeam,
  type LinearWorkflowState,
  type LinearIssue,
} from '../services/linearService';
import IssueTable from './IssueTable';

export default function LinearSearch() {
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<LinearTeam | null>(null);
  const [states, setStates] = useState<LinearWorkflowState[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const hasKey = await window.electron.store.has('linearApiKey');
      setHasApiKey(hasKey);
      if (hasKey) {
        loadTeams();
      }
    } catch (err) {
      console.error('Failed to check API key:', err);
    }
  };

  const loadTeams = async () => {
    try {
      setLoading(true);
      const loadedTeams = await getLinearTeams();
      setTeams(loadedTeams);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = async (team: LinearTeam) => {
    setSelectedTeam(team);
    setTeamSearchTerm(`${team.name} (${team.key})`);
    setShowTeamDropdown(false);
    setSelectedState('');
    setIssues([]);

    try {
      setLoading(true);
      const workflowStates = await getLinearWorkflowStates(team.key);
      setStates(workflowStates);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow states');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!selectedTeam) {
      setError('Please select a team first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await searchLinearIssues({
        teamKey: selectedTeam.key,
        search: searchTerm || undefined,
        stateId: selectedState || undefined,
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
    setSelectedTeam(null);
    setTeamSearchTerm('');
    setStates([]);
    setSelectedState('');
    setSearchTerm('');
    setIssues([]);
    setError(null);
  };

  const filteredTeams = teams.filter(
    (team) =>
      team.name.toLowerCase().includes(teamSearchTerm.toLowerCase()) ||
      team.key.toLowerCase().includes(teamSearchTerm.toLowerCase())
  );

  if (!hasApiKey) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            Please configure your Linear API key in Settings to use this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Search Linear Issues</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow border border-border mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          {/* Team Selection */}
          <div className="flex-1 min-w-[200px] relative">
            <label className="block text-sm font-semibold mb-2">Product (Team):</label>
            <input
              type="text"
              value={teamSearchTerm}
              onChange={(e) => {
                setTeamSearchTerm(e.target.value);
                setShowTeamDropdown(true);
              }}
              onFocus={() => setShowTeamDropdown(true)}
              placeholder="Type to search teams..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              autoComplete="off"
            />

            {showTeamDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredTeams.length > 0 ? (
                  filteredTeams.slice(0, 50).map((team) => (
                    <div
                      key={team.id}
                      onClick={() => handleTeamSelect(team)}
                      className={`px-3 py-2 cursor-pointer hover:bg-background border-b border-gray-100 last:border-b-0 ${
                        selectedTeam?.key === team.key ? 'bg-primary text-white' : ''
                      }`}
                    >
                      <span className="font-semibold">[{team.key}]</span>{' '}
                      <span className="text-sm">{team.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-gray-500">No teams found</div>
                )}
              </div>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold mb-2">Status:</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              disabled={!selectedTeam}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">All statuses</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold mb-2">Search:</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search issues..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 items-end">
            <button
              type="submit"
              disabled={loading || !selectedTeam}
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

      {!loading && issues.length === 0 && selectedTeam && (
        <div className="text-center py-10 text-gray-600">
          {searchTerm || selectedState ? 'No issues found.' : 'Enter a search term or select filters to find issues.'}
        </div>
      )}

      {!loading && issues.length > 0 && (
        <IssueTable issues={issues} type="linear" />
      )}

      {/* Click outside handler */}
      {showTeamDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowTeamDropdown(false)}
        />
      )}
    </div>
  );
}
