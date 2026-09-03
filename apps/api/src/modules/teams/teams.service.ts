import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantConnectionProvider, requireTenantContext } from '../../core/tenant';

export interface Team {
  id: string;
  name: string;
  created_at: Date;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  joined_at: Date;
}

@Injectable()
export class TeamsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  private schema(): string {
    return requireTenantContext().schemaName;
  }

  async create(name: string): Promise<Team> {
    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();

    const rows = await em.query(
      `INSERT INTO "${s}"."teams" (name) VALUES ($1) RETURNING id, name, created_at`,
      [name],
    );

    return rows[0];
  }

  async findAll(): Promise<Team[]> {
    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();

    return em.query(`SELECT id, name, created_at FROM "${s}"."teams" ORDER BY name ASC`);
  }

  async findById(id: string): Promise<Team> {
    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();

    const rows = await em.query(
      `SELECT id, name, created_at FROM "${s}"."teams" WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Team "${id}" not found`);
    }

    return rows[0];
  }

  async delete(id: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();
    const rows = await em.query(
      `DELETE FROM "${s}"."teams" WHERE id = $1 RETURNING id`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Team "${id}" not found`);
    }
  }

  async addMember(teamId: string, userId: string): Promise<TeamMember> {
    await this.findById(teamId);

    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();

    try {
      const rows = await em.query(
        `INSERT INTO "${s}"."team_members" (team_id, user_id) VALUES ($1, $2) RETURNING team_id, user_id, joined_at`,
        [teamId, userId],
      );
      return rows[0];
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('User is already a member of this team');
      }
      throw err;
    }
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();

    const rows = await em.query(
      `DELETE FROM "${s}"."team_members"
       WHERE team_id = $1 AND user_id = $2
       RETURNING team_id`,
      [teamId, userId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Team membership not found');
    }
  }

  async getMembers(teamId: string): Promise<TeamMember[]> {
    await this.findById(teamId);

    const em = await this.tenantConnections.getEntityManager();
    const s = this.schema();

    return em.query(
      `SELECT team_id, user_id, joined_at FROM "${s}"."team_members" WHERE team_id = $1 ORDER BY joined_at ASC`,
      [teamId],
    );
  }
}
