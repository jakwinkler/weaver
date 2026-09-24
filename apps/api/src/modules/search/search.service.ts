import { Injectable, BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import { IssueEntity, WorkflowStatusEntity } from '@weaver/db';
import { dateOnlySchema, ISSUE_PRIORITIES, PaginatedResponse } from '@weaver/shared';
import { z } from 'zod';
import { TenantConnectionProvider } from '../../core/tenant';
import { ProjectAccessService } from '../../core/tenant';
import type { RequestUser } from '../../core/auth';

interface WqlToken {
  field: string;
  operator: string;
  value: string;
}

interface ParsedWql {
  conditions: WqlToken[];
  connectors: ('AND' | 'OR')[];
}

@Injectable()
export class SearchService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async search(
    query: {
      query: string;
      page?: number;
      perPage?: number;
      sort?: string;
    },
    user: RequestUser,
  ): Promise<PaginatedResponse<IssueEntity>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    const em = await this.tenantConnections.getEntityManager();

    const parsed = this.parseWql(query.query);
    const { whereClause, parameters } = await this.buildWhereClause(parsed, em);

    const qb = em.getRepository(IssueEntity).createQueryBuilder('issue');

    if (whereClause) {
      qb.where(`(${whereClause})`, parameters);
    }

    const projectIds = await this.projectAccess.accessibleProjectIds(user);
    if (projectIds !== null) {
      if (projectIds.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('issue.project_id IN (:...projectIds)', { projectIds });
      }
    }

    if (query.sort) {
      const [field, direction] = query.sort.split(':');
      const column = this.mapSortField(field);
      qb.orderBy(`issue.${column}`, direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC');
    } else {
      qb.orderBy('issue.created_at', 'DESC');
    }

    qb.skip((page - 1) * perPage).take(perPage);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  private parseWql(wql: string): ParsedWql {
    const conditions: WqlToken[] = [];
    const connectors: ('AND' | 'OR')[] = [];

    if (wql.length > 10000)
      throw new BadRequestException('WQL query cannot exceed 10000 characters');
    const trimmed = wql.trim();
    if (!trimmed) {
      return { conditions, connectors };
    }

    // Tokenize: split by AND/OR while preserving quoted strings
    const parts: string[] = [];
    const connectorList: ('AND' | 'OR')[] = [];

    // Split by AND/OR connectors that are not inside quotes
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (inQuotes) {
        current += char;
        if (char === quoteChar) {
          inQuotes = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
        current += char;
        continue;
      }

      // Check for AND/OR
      const remaining = trimmed.slice(i);
      if (/^AND\s/i.test(remaining)) {
        parts.push(current.trim());
        connectorList.push('AND');
        current = '';
        i += 3; // skip "AND "
        continue;
      }
      if (/^OR\s/i.test(remaining)) {
        parts.push(current.trim());
        connectorList.push('OR');
        current = '';
        i += 2; // skip "OR "
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    if (parts.length > 50) throw new BadRequestException('WQL query cannot exceed 50 conditions');

    // Parse each condition
    for (const part of parts) {
      const token = this.parseCondition(part);
      if (token) {
        conditions.push(token);
      }
    }

    connectors.push(...connectorList);

    return { conditions, connectors };
  }

  private parseCondition(part: string): WqlToken | null {
    // Match: field operator "value"
    const match = part.match(/^(\w+)\s*(=|!=|~|>|<|>=|<=)\s*"([^"]*)"$/);
    if (!match) {
      throw new BadRequestException(`Invalid WQL condition: "${part}"`);
    }

    return {
      field: match[1],
      operator: match[2],
      value: match[3],
    };
  }

  private async buildWhereClause(
    parsed: ParsedWql,
    em: any,
  ): Promise<{ whereClause: string; parameters: Record<string, unknown> }> {
    if (parsed.conditions.length === 0) {
      return { whereClause: '', parameters: {} };
    }

    const clauses: string[] = [];
    const parameters: Record<string, unknown> = {};
    let paramIndex = 0;

    const statusNames = [
      ...new Set(
        parsed.conditions
          .filter((condition) => condition.field === 'status')
          .map((condition) => condition.value),
      ),
    ];
    const statuses: WorkflowStatusEntity[] = statusNames.length
      ? await em
          .getRepository(WorkflowStatusEntity)
          .find({ where: { name: In(statusNames) }, order: { id: 'ASC' } })
      : [];
    const statusIds = new Map<string, string>();
    for (const status of statuses)
      if (!statusIds.has(status.name)) statusIds.set(status.name, status.id);
    for (const condition of parsed.conditions) {
      const paramName = `p${paramIndex++}`;
      const clause = await this.buildCondition(condition, paramName, parameters, statusIds);
      clauses.push(clause);
    }

    // Join clauses with connectors
    let whereClause = clauses[0];
    for (let i = 0; i < parsed.connectors.length; i++) {
      const connector = parsed.connectors[i];
      whereClause += ` ${connector} ${clauses[i + 1]}`;
    }

    return { whereClause, parameters };
  }

  private async buildCondition(
    token: WqlToken,
    paramName: string,
    parameters: Record<string, unknown>,
    statusIds: Map<string, string>,
  ): Promise<string> {
    const { field, operator, value } = token;
    const idFields = ['assignee', 'reporter', 'project'];
    const equalityFields = [...idFields, 'status', 'priority', 'label'];
    if (
      (equalityFields.includes(field) && !['=', '!='].includes(operator)) ||
      (['created', 'updated'].includes(field) && operator === '~')
    ) {
      throw new BadRequestException(`Unsupported operator for ${field}`);
    }
    if (idFields.includes(field) && !z.string().uuid().safeParse(value).success) {
      throw new BadRequestException(`${field} must be a UUID`);
    }
    if (
      ['created', 'updated'].includes(field) &&
      !dateOnlySchema.safeParse(value).success &&
      !(
        z.string().datetime({ offset: true }).safeParse(value).success &&
        dateOnlySchema.safeParse(value.slice(0, 10)).success
      )
    ) {
      throw new BadRequestException(`${field} must be a valid ISO date or timestamp`);
    }
    if (field === 'priority' && !(ISSUE_PRIORITIES as readonly string[]).includes(value)) {
      throw new BadRequestException('Invalid priority');
    }

    switch (field) {
      case 'status': {
        // Lookup status ID by name
        const status = statusIds.get(value);
        if (!status) {
          throw new BadRequestException(`Unknown status "${value}"`);
        }
        parameters[paramName] = status;
        return `issue.status_id ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'priority': {
        parameters[paramName] = value;
        return `issue.priority ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'assignee': {
        parameters[paramName] = value;
        return `issue.assignee_id ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'reporter': {
        parameters[paramName] = value;
        return `issue.reporter_id ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'label': {
        parameters[paramName] = value;
        return operator === '!='
          ? `NOT (:${paramName} = ANY(issue.labels))`
          : `:${paramName} = ANY(issue.labels)`;
      }

      case 'summary': {
        if (operator === '~') {
          parameters[paramName] = `%${value}%`;
          return `issue.summary ILIKE :${paramName}`;
        }
        parameters[paramName] = value;
        return `issue.summary ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'created': {
        parameters[paramName] = value;
        return `issue.created_at ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'updated': {
        parameters[paramName] = value;
        return `issue.updated_at ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'project': {
        parameters[paramName] = value;
        return `issue.project_id ${this.mapOperator(operator)} :${paramName}`;
      }

      case 'key': {
        parameters[paramName] = value;
        return `issue.key ${this.mapOperator(operator)} :${paramName}`;
      }

      default:
        throw new BadRequestException(`Unknown WQL field "${field}"`);
    }
  }

  private mapOperator(op: string): string {
    switch (op) {
      case '=':
        return '=';
      case '!=':
        return '!=';
      case '>':
        return '>';
      case '<':
        return '<';
      case '>=':
        return '>=';
      case '<=':
        return '<=';
      case '~':
        return 'ILIKE';
      default:
        throw new BadRequestException(`Unknown operator "${op}"`);
    }
  }

  private mapSortField(field: string): string {
    const mapping: Record<string, string> = {
      created: 'created_at',
      updated: 'updated_at',
      priority: 'priority',
      summary: 'summary',
      key: 'key',
    };
    return mapping[field] ?? 'created_at';
  }
}
