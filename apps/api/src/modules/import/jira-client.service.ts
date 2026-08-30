import { Injectable } from '@nestjs/common';
import { JiraClient } from '@weaver/jira-import';

@Injectable()
export class JiraClientService extends JiraClient {}
