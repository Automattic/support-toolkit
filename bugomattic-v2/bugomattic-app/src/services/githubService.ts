import { GraphQLClient } from 'graphql-request';

const GITHUB_API_URL = 'https://api.github.com/graphql';

export interface GitHubRepository {
  id: string;
  name: string;
  nameWithOwner: string;
  owner: {
    login: string;
  };
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  author?: {
    login: string;
  };
  assignees: {
    nodes: Array<{
      login: string;
    }>;
  };
  labels: {
    nodes: Array<{
      name: string;
      color: string;
    }>;
  };
}

let client: GraphQLClient | null = null;

export async function initializeGitHubClient() {
  const apiKey = await window.electron.store.get('githubApiKey');
  if (!apiKey) {
    throw new Error('GitHub API key not configured');
  }

  client = new GraphQLClient(GITHUB_API_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return client;
}

export async function getGitHubRepositories(org?: string): Promise<GitHubRepository[]> {
  if (!client) {
    await initializeGitHubClient();
  }

  // If org is specified, get org repositories, otherwise get user repositories
  const query = org
    ? `
      query($org: String!) {
        organization(login: $org) {
          repositories(first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
            nodes {
              id
              name
              nameWithOwner
              owner {
                login
              }
            }
          }
        }
      }
    `
    : `
      query {
        viewer {
          repositories(first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
            nodes {
              id
              name
              nameWithOwner
              owner {
                login
              }
            }
          }
        }
      }
    `;

  const variables = org ? { org } : {};
  const data: any = await client!.request(query, variables);

  if (org) {
    return data.organization.repositories.nodes || [];
  } else {
    return data.viewer.repositories.nodes || [];
  }
}

export async function searchGitHubIssues(params: {
  owner: string;
  repo: string;
  search?: string;
  state?: 'OPEN' | 'CLOSED';
  type?: 'ISSUE' | 'PULL_REQUEST' | 'ALL';
}): Promise<GitHubIssue[]> {
  if (!client) {
    await initializeGitHubClient();
  }

  const { owner, repo, search, state, type = 'ALL' } = params;

  // Build search query for GitHub
  let searchQuery = `repo:${owner}/${repo}`;
  if (search) {
    searchQuery += ` ${search}`;
  }
  if (state) {
    searchQuery += ` state:${state}`;
  }
  if (type === 'ISSUE') {
    searchQuery += ' type:issue';
  } else if (type === 'PULL_REQUEST') {
    searchQuery += ' type:pr';
  }

  const query = `
    query($searchQuery: String!) {
      search(query: $searchQuery, type: ISSUE, first: 100) {
        nodes {
          ... on Issue {
            id
            number
            title
            body
            state
            createdAt
            updatedAt
            url
            author {
              login
            }
            assignees(first: 10) {
              nodes {
                login
              }
            }
            labels(first: 10) {
              nodes {
                name
                color
              }
            }
          }
          ... on PullRequest {
            id
            number
            title
            body
            state
            createdAt
            updatedAt
            url
            author {
              login
            }
            assignees(first: 10) {
              nodes {
                login
              }
            }
            labels(first: 10) {
              nodes {
                name
                color
              }
            }
          }
        }
      }
    }
  `;

  const data: any = await client!.request(query, { searchQuery });
  return data.search.nodes || [];
}

export async function getGitHubOrganizations(): Promise<string[]> {
  if (!client) {
    await initializeGitHubClient();
  }

  const query = `
    query {
      viewer {
        organizations(first: 100) {
          nodes {
            login
          }
        }
      }
    }
  `;

  const data: any = await client!.request(query);
  return data.viewer.organizations.nodes.map((org: any) => org.login) || [];
}
