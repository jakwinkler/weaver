import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantEntity, TenantMembershipEntity } from '@weaver/db';
import { Repository } from 'typeorm';
import { validateCorsOrigin } from '../security/cors.config';
import type { RequestUser } from '../auth';
import { ProjectAccessService } from '../tenant/project-access.service';
import { RateLimitingGuard } from '../rate-limiting/rate-limiting.guard';
import { PROJECT_KEY_REGEX } from '@weaver/shared';
import { tenantStorage } from '../tenant/tenant.context';

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader
    ?.split(';')
    .map((cookie) => cookie.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=');
}

@WebSocketGateway({
  cors: { origin: validateCorsOrigin, credentials: true },
  namespace: '/ws',
})
@Injectable()
export class WeaverGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly joinWindows = new WeakMap<Socket, { count: number; until: number }>();
  private readonly logger = new Logger(WeaverGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly projectAccess: ProjectAccessService,
    private readonly rateLimiting: RateLimitingGuard,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        readCookie(client.handshake.headers?.cookie, 'weaver_token');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      if (payload.tokenType !== 'access') {
        client.disconnect();
        return;
      }
      const [tenant, membership] = await Promise.all([
        this.tenantRepo.findOneBy({ id: payload.tenantId }),
        this.membershipRepo.findOneBy({
          tenantId: payload.tenantId,
          userId: payload.sub,
        }),
      ]);
      if (!tenant || !membership) {
        client.disconnect();
        return;
      }
      (client as any).userId = payload.sub;
      (client as any).tenantId = payload.tenantId;
      (client as any).tenantSchemaName = tenant.schemaName;
      (client as any).role = membership.role;
      (client as any).userEmail = payload.email;

      if (payload.tenantId) {
        client.join(this.userRoom(payload.tenantId, payload.sub));
      }

      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:project')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectKey: string },
  ): Promise<{ joined: boolean; projectKey?: string }> {
    const tenantId = (client as any).tenantId as string | undefined;
    const schemaName = (client as any).tenantSchemaName as string | undefined;
    const userId = (client as any).userId as string | undefined;
    const role = (client as any).role as string | undefined;
    if (!tenantId || !schemaName || !userId || !role || typeof data?.projectKey !== 'string' || !PROJECT_KEY_REGEX.test(data.projectKey)) {
      return { joined: false };
    }

    const now = Date.now();
    let window = this.joinWindows.get(client);
    if (!window || window.until <= now) {
      window = { count: 0, until: now + 10_000 };
      this.joinWindows.set(client, window);
    }
    if (++window.count > 20 || !await this.rateLimiting.allowProjectJoin(tenantId, userId)) return { joined: false };

    const user: RequestUser = {
      userId,
      tenantId,
      role,
      email: ((client as any).userEmail as string | undefined) ?? '',
    };
    try {
      await tenantStorage.run(
        { tenantId, schemaName },
        () => this.projectAccess.assertProjectKey(data.projectKey, user, 'read'),
      );
    } catch {
      this.logger.warn(`Client ${client.id} denied project room ${data.projectKey}`);
      return { joined: false };
    }

    const room = this.projectRoom(tenantId, data.projectKey);
    client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
    return { joined: true, projectKey: data.projectKey };
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectKey: string },
  ) {
    const tenantId = (client as any).tenantId as string | undefined;
    if (!tenantId || !data?.projectKey) {
      return;
    }

    client.leave(this.projectRoom(tenantId, data.projectKey));
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToProject(tenantId: string, projectKey: string, event: string, data: unknown) {
    this.server.to(this.projectRoom(tenantId, projectKey)).emit(event, data);
  }

  emitToUser(tenantId: string, userId: string, event: string, data: unknown) {
    this.server.to(this.userRoom(tenantId, userId)).emit(event, data);
  }

  disconnectUserFromTenant(userId: string, tenantId: string): void {
    this.server
      .in(this.userRoom(tenantId, userId))
      .disconnectSockets(true);
  }

  private projectRoom(tenantId: string, projectKey: string): string {
    return `tenant:${tenantId}:project:${projectKey}`;
  }

  private userRoom(tenantId: string, userId: string): string {
    return `tenant:${tenantId}:user:${userId}`;
  }
}
