import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomFieldDefinitionEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { z } from 'zod';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async findAll(entityType?: string): Promise<CustomFieldDefinitionEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CustomFieldDefinitionEntity);

    const where: Record<string, unknown> = {};
    if (entityType) {
      where.entityType = entityType;
    }

    return repo.find({ where, order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<CustomFieldDefinitionEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CustomFieldDefinitionEntity);
    const field = await repo.findOneBy({ id });
    if (!field) {
      throw new NotFoundException(`Custom field definition "${id}" not found`);
    }
    return field;
  }

  async create(dto: {
    name: string;
    slug: string;
    fieldType: string;
    entityType?: string;
    pluginId?: string;
    options: Record<string, unknown> | null;
    validation: Record<string, unknown> | null;
    required: boolean;
  }): Promise<CustomFieldDefinitionEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CustomFieldDefinitionEntity);

    const definition = repo.create({
      name: dto.name,
      slug: dto.slug,
      fieldType: dto.fieldType,
      entityType: dto.entityType || 'issue',
      pluginId: dto.pluginId || null,
      options: dto.options,
      validation: dto.validation,
      required: dto.required,
    });

    return repo.save(definition);
  }

  async update(
    id: string,
    dto: Partial<{
      name: string;
      slug: string;
      fieldType: string;
      options: Record<string, unknown> | null;
      validation: Record<string, unknown> | null;
      required: boolean;
    }>,
  ): Promise<CustomFieldDefinitionEntity> {
    const definition = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CustomFieldDefinitionEntity);

    Object.assign(definition, dto);
    return repo.save(definition);
  }

  async delete(id: string): Promise<void> {
    const definition = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CustomFieldDefinitionEntity);
    await repo.remove(definition);
  }

  async deleteByPluginId(pluginId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CustomFieldDefinitionEntity);
    await repo.delete({ pluginId });
  }

  async validateCustomFields(data: Record<string, unknown>, entityType = 'issue'): Promise<void> {
    const definitions = await this.findAll(entityType);
    const defMap = new Map(definitions.map((d) => [d.slug, d]));

    for (const [slug, value] of Object.entries(data)) {
      const def = defMap.get(slug);
      if (!def) {
        throw new BadRequestException(`Unknown custom field "${slug}"`);
      }

      if (value === null || value === undefined) {
        if (def.required) {
          throw new BadRequestException(`Custom field "${slug}" is required`);
        }
        continue;
      }

      this.validateFieldValue(def, slug, value);
    }

    // Check for missing required fields
    for (const def of definitions) {
      if (def.required && !(def.slug in data)) {
        throw new BadRequestException(`Custom field "${def.slug}" is required`);
      }
    }
  }

  private validateFieldValue(
    def: CustomFieldDefinitionEntity,
    slug: string,
    value: unknown,
  ): void {
    switch (def.fieldType) {
      case 'text':
        if (typeof value !== 'string') {
          throw new BadRequestException(`Custom field "${slug}" must be a string`);
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          throw new BadRequestException(`Custom field "${slug}" must be a number`);
        }
        break;

      case 'select': {
        const choices = (def.options as any)?.choices as string[] | undefined;
        if (!choices || !choices.includes(value as string)) {
          throw new BadRequestException(
            `Custom field "${slug}" must be one of: ${choices?.join(', ') ?? '(none)'}`,
          );
        }
        break;
      }

      case 'multi_select': {
        if (!Array.isArray(value)) {
          throw new BadRequestException(`Custom field "${slug}" must be an array`);
        }
        const msChoices = (def.options as any)?.choices as string[] | undefined;
        for (const v of value) {
          if (!msChoices || !msChoices.includes(v)) {
            throw new BadRequestException(
              `Custom field "${slug}" contains invalid value "${v}". Must be one of: ${msChoices?.join(', ') ?? '(none)'}`,
            );
          }
        }
        break;
      }

      case 'date': {
        const dateSchema = z.string().date();
        const result = dateSchema.safeParse(value);
        if (!result.success) {
          throw new BadRequestException(
            `Custom field "${slug}" must be a valid date string (YYYY-MM-DD)`,
          );
        }
        break;
      }

      case 'user': {
        const uuidSchema = z.string().uuid();
        const result = uuidSchema.safeParse(value);
        if (!result.success) {
          throw new BadRequestException(`Custom field "${slug}" must be a valid UUID`);
        }
        break;
      }

      case 'checkbox':
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`Custom field "${slug}" must be a boolean`);
        }
        break;

      case 'url': {
        const urlSchema = z.string().url();
        const result = urlSchema.safeParse(value);
        if (!result.success) {
          throw new BadRequestException(`Custom field "${slug}" must be a valid URL`);
        }
        break;
      }

      default:
        throw new BadRequestException(`Unknown field type "${def.fieldType}" for "${slug}"`);
    }
  }
}
