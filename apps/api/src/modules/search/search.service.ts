import { Injectable, BadRequestException } from '@nestjs/common';
import { IssueEntity, WorkflowStatusEntity } from '@weaver/db';
import { PaginatedResponse } from '@weaver/shared';
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

  async search(query: {
    query: string;
    page?: number;
    perPage?: number;
    sort?: string;
  }, user: RequestUser): Promise<PaginatedResponse<IssueEntity>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    const em = await this.tenantConnections.getEntityManager();

    const parsed = this.parseWql(query.query);
    const { whereClause, parameters } = await this.buildWhereClause(parsed, em);

    const qb = em
      .getRepository(IssueEntity)
      .createQueryBuilder('issue');

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

    for (const condition of parsed.conditions) {
      const paramName = `p${paramIndex++}`;
      const clause = await this.buildCondition(condition, paramName, parameters, em);
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
    em: any,
  ): Promise<string> {
    const { field, operator, value } = token;

    switch (field) {
      case 'status': {
        // Lookup status ID by name
        const status = await em
          .getRepository(WorkflowStatusEntity)
          .findOneBy({ name: value });
        if (!status) {
          throw new BadRequestException(`Unknown status "${value}"`);
        }
        parameters[paramName] = status.id;
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
        return `:${paramName} = ANY(issue.labels)`;
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
      case '=': return '=';
      case '!=': return '!=';
      case '>': return '>';
      case '<': return '<';
      case '>=': return '>=';
      case '<=': return '<=';
      case '~': return 'ILIKE';
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
