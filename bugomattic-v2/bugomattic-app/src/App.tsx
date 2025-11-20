import { useState } from 'react';
import LinearSearch from './components/LinearSearch';
import GitHubSearch from './components/GitHubSearch';
import Settings from './components/Settings';

type View = 'linear' | 'github' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<View>('linear');

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-white border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-primary">Bugomattic</h1>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentView('linear')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'linear'
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Linear
              </button>
              <button
                onClick={() => setCurrentView('github')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'github'
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                GitHub
              </button>
              <button
                onClick={() => setCurrentView('settings')}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  currentView === 'settings'
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {currentView === 'linear' && <LinearSearch />}
        {currentView === 'github' && <GitHubSearch />}
        {currentView === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
