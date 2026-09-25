import type { Issue } from './index';
import type { PaginatedResponse } from '../schemas';

export type PublicIssue = Pick<Issue, 'id' | 'key' | 'summary' | 'statusId'> & { priority: string };
export interface PublicProject {
  id: string;
  key: string;
  name: string;
  description: string | null;
}
export interface PublicWorkflowStatus {
  id: string;
  name: string;
  color: string;
  position: number;
}
export interface PublicBoardData {
  issues: PublicIssue[];
  statuses: PublicWorkflowStatus[];
  meta: PaginatedResponse<PublicIssue>['meta'];
}
