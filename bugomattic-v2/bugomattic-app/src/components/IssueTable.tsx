import type { LinearIssue } from '../services/linearService';
import type { GitHubIssue } from '../services/githubService';

interface Props {
  issues: LinearIssue[] | GitHubIssue[];
  type: 'linear' | 'github';
}

function isLinearIssue(issue: any): issue is LinearIssue {
  return 'identifier' in issue && 'priorityLabel' in issue;
}

function getStatusClass(type: string): string {
  const map: Record<string, string> = {
    started: 'status-started',
    unstarted: 'status-unstarted',
    backlog: 'status-backlog',
    completed: 'status-completed',
    canceled: 'status-canceled',
    triage: 'status-triage',
  };
  return map[type] || 'status-unstarted';
}

function getPriorityClass(priority: number): string {
  if (priority === 0) return 'priority-urgent';
  if (priority === 1 || priority === 2) return 'priority-high';
  if (priority === 3) return 'priority-medium';
  return 'priority-low';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function stripHtml(html: string | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

export default function IssueTable({ issues, type }: Props) {
  return (
    <div className="bg-white rounded-lg shadow border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-background">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">ID</th>
              <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">Title</th>
              <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">Status</th>
              {type === 'linear' && (
                <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">Priority</th>
              )}
              {type === 'github' && (
                <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">Labels</th>
              )}
              <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">Assignee</th>
              <th className="px-4 py-3 text-left text-sm font-semibold border-b-2 border-border">Updated</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => {
              if (isLinearIssue(issue)) {
                // Linear issue
                const statusClass = getStatusClass(issue.state?.type || '');
                const priorityClass = getPriorityClass(issue.priority || 4);
                const assigneeName = issue.assignee?.name || 'Unassigned';
                const updatedDate = formatDate(issue.updatedAt);
                const description = stripHtml(issue.description).substring(0, 150);

                return (
                  <tr key={issue.id} className="hover:bg-background border-b border-gray-200">
                    <td className="px-4 py-3 align-top">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-dark font-semibold hover:underline"
                      >
                        {issue.identifier}
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium mb-1">{issue.title}</div>
                      {description && (
                        <div className="text-sm text-gray-600 max-w-md line-clamp-2">
                          {description}
                          {(issue.description?.length || 0) > 150 ? '...' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`status-badge ${statusClass}`}>
                        {issue.state?.name || ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`priority-badge ${priorityClass}`}>
                        {issue.priorityLabel || 'No priority'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">{assigneeName}</td>
                    <td className="px-4 py-3 align-top text-sm">{updatedDate}</td>
                  </tr>
                );
              } else {
                // GitHub issue
                const ghIssue = issue as GitHubIssue;
                const updatedDate = formatDate(ghIssue.updatedAt);
                const assignees = ghIssue.assignees.nodes.map((a) => a.login).join(', ') || 'Unassigned';
                const description = stripHtml(ghIssue.body).substring(0, 150);

                return (
                  <tr key={ghIssue.id} className="hover:bg-background border-b border-gray-200">
                    <td className="px-4 py-3 align-top">
                      <a
                        href={ghIssue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-dark font-semibold hover:underline"
                      >
                        #{ghIssue.number}
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium mb-1">{ghIssue.title}</div>
                      {description && (
                        <div className="text-sm text-gray-600 max-w-md line-clamp-2">
                          {description}
                          {(ghIssue.body?.length || 0) > 150 ? '...' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`status-badge ${
                          ghIssue.state === 'OPEN' ? 'status-started' : 'status-completed'
                        }`}
                      >
                        {ghIssue.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {ghIssue.labels.nodes.length > 0 ? (
                          ghIssue.labels.nodes.map((label) => (
                            <span
                              key={label.name}
                              className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                              style={{
                                backgroundColor: `#${label.color}`,
                                color: parseInt(label.color, 16) > 0xffffff / 2 ? '#000' : '#fff',
                              }}
                            >
                              {label.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500">No labels</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-sm">{assignees}</td>
                    <td className="px-4 py-3 align-top text-sm">{updatedDate}</td>
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
