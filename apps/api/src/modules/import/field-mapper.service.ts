import { Injectable } from '@nestjs/common';
import { FieldMapper } from '@weaver/jira-import';

@Injectable()
export class FieldMapperService extends FieldMapper {}
