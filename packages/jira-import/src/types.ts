import type {
  ImportJobError,
  JiraConnectionConfig,
  JiraImportJobData,
  JiraProjectSummary,
} from '@weaver/shared';

export type { JiraConnectionConfig, JiraImportJobData, JiraProjectSummary };

export interface JiraUser {
  accountId?: string;
  key?: string;
  name?: string;
  emailAddress?: string;
  displayName?: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory?: { key?: string; name?: string; colorName?: string };
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask?: boolean;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  content: string;
  created?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, any> & {
    summary?: string;
    description?: unknown;
    priority?: { name?: string };
    status?: JiraStatus;
    issuetype?: JiraIssueType;
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    labels?: string[];
    attachment?: JiraAttachment[];
    parent?: { id?: string; key?: string };
    created?: string;
    updated?: string;
    duedate?: string;
  };
}

export interface JiraComment {
  id: string;
  body: unknown;
  author?: JiraUser;
  created?: string;
  updated?: string;
}

export interface JiraSprint {
  id: number | string;
  name: string;
  goal?: string;
  state?: 'future' | 'active' | 'closed' | string;
  startDate?: string;
  endDate?: string;
  originBoardId?: number;
}

export interface JiraBoard {
  id: number | string;
  name?: string;
  type?: string;
}

export interface JiraProjectDetails extends JiraProjectSummary {
  description?: string;
  issueTypes?: JiraIssueType[];
}

export interface JiraProjectIssueTypeStatuses extends JiraIssueType {
  statuses: JiraStatus[];
}

export interface MappedJiraIssue {
  summary: string;
  description: Record<string, unknown> | null;
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  status: JiraStatus | null;
  issueType: JiraIssueType | null;
  assigneeEmail: string | null;
  reporterEmail: string | null;
  labels: string[];
  dueDate: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  storyPoints: number | null;
  customFields: Record<string, unknown>;
  customFieldNames: Record<string, string>;
  sprintExternalId: string | null;
  parentExternalId: string | null;
}

export interface ImportProgress {
  currentStep: string;
  totalItems: number;
  importedItems: number;
  skippedItems: number;
  errors: ImportJobError[];
}
