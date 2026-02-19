import { BadRequestException } from '@nestjs/common';
import { paginationSchema, PaginatedResponse } from '@weaver/shared';
import { SelectQueryBuilder } from 'typeorm';

export interface PaginationParams {
  page: number;
  perPage: number;
  sort?: string;
}

export function parsePagination(query: Record<string, any>): PaginationParams {
  const result = paginationSchema.safeParse(query);
  if (!result.success) {
    throw new BadRequestException(result.error.issues);
  }
  return result.data;
}

export async function paginate<T>(
  qb: SelectQueryBuilder<T>,
  params: PaginationParams,
  allowedSortFields: string[] = [],
): Promise<PaginatedResponse<T>> {
  // Apply sorting
  if (params.sort) {
    const desc = params.sort.startsWith('-');
    const field = desc ? params.sort.slice(1) : params.sort;

    if (allowedSortFields.length > 0 && !allowedSortFields.includes(field)) {
      throw new BadRequestException(`Invalid sort field: ${field}`);
    }

    const alias = qb.alias;
    qb.orderBy(`${alias}.${field}`, desc ? 'DESC' : 'ASC');
  }

  // Apply pagination
  const skip = (params.page - 1) * params.perPage;
  qb.skip(skip).take(params.perPage);

  const [data, total] = await qb.getManyAndCount();

  return {
    data,
    meta: {
      page: params.page,
      perPage: params.perPage,
      total,
      totalPages: Math.ceil(total / params.perPage),
    },
  };
}
