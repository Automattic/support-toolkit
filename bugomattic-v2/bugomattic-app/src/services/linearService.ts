import { GraphQLClient } from 'graphql-request';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  assignee?: {
    name: string;
    email: string;
  };
  state: {
    id: string;
    name: string;
    type: string;
  };
  priority: number;
  priorityLabel: string;
  updatedAt: string;
  createdAt: string;
  url: string;
}

let client: GraphQLClient | null = null;

export async function initializeLinearClient() {
  const apiKey = await window.electron.store.get('linearApiKey');
  if (!apiKey) {
    throw new Error('Linear API key not configured');
  }

  client = new GraphQLClient(LINEAR_API_URL, {
    headers: {
      Authorization: apiKey,
    },
  });

  return client;
}

export async function getLinearTeams(): Promise<LinearTeam[]> {
  if (!client) {
    await initializeLinearClient();
  }

  const allTeams: LinearTeam[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query($after: String) {
        teams(first: 200, after: $after) {
          nodes {
            id
            key
            name
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = cursor ? { after: cursor } : {};
    const data: any = await client!.request(query, variables);

    const teams = data.teams.nodes || [];
    allTeams.push(...teams);

    hasNextPage = data.teams.pageInfo.hasNextPage || false;
    cursor = data.teams.pageInfo.endCursor || null;

    if (teams.length === 0) {
      break;
    }
  }

  return allTeams;
}

export async function getLinearWorkflowStates(teamKey: string): Promise<LinearWorkflowState[]> {
  if (!client) {
    await initializeLinearClient();
  }

  const query = `
    query($teamKey: String!) {
      workflowStates(filter: { team: { key: { eq: $teamKey } } }) {
        nodes {
          id
          name
          type
        }
      }
    }
  `;

  const data: any = await client!.request(query, { teamKey });
  return data.workflowStates.nodes || [];
}

export async function searchLinearIssues(params: {
  teamKey: string;
  search?: string;
  stateId?: string;
}): Promise<LinearIssue[]> {
  if (!client) {
    await initializeLinearClient();
  }

  const { teamKey, search, stateId } = params;

  // Build filter parts
  const filterParts: string[] = ['team: { key: { eq: $teamKey } }'];
  const variables: any = { teamKey };

  if (stateId) {
    filterParts.push('state: { id: { eq: $stateId } }');
    variables.stateId = stateId;
  }

  if (search) {
    filterParts.push('or: [ { title: { containsIgnoreCase: $search } }, { description: { containsIgnoreCase: $search } } ]');
    variables.search = search;
  }

  const filterString = `{ ${filterParts.join(', ')} }`;

  // Build query with conditional variables
  let queryVariables = '$teamKey: String!';
  if (stateId) queryVariables += ', $stateId: ID!';
  if (search) queryVariables += ', $search: String!';

  const query = `
    query(${queryVariables}) {
      issues(filter: ${filterString}, first: 100, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          assignee {
            name
            email
          }
          state {
            id
            name
            type
          }
          priority
          priorityLabel
          updatedAt
          createdAt
          url
        }
      }
    }
  `;

  const data: any = await client!.request(query, variables);
  return data.issues.nodes || [];
}
