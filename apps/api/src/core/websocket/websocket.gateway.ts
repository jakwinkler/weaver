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
import { PROJECT_KEY_REGEX } from '@weaver/shared';

interface WebSocketJwtPayload {
  sub?: unknown;
  tenantId?: unknown;
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/ws' })
@Injectable()
export class WeaverGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WeaverGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<WebSocketJwtPayload>(token);
      if (typeof payload.sub !== 'string' || typeof payload.tenantId !== 'string') {
        client.disconnect();
        return;
      }

      client.data.userId = payload.sub;
      client.data.tenantId = payload.tenantId;

      await client.join(this.tenantRoom(payload.tenantId));

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
  ) {
    const tenantId = this.getTenantId(client);
    if (!tenantId || !PROJECT_KEY_REGEX.test(data?.projectKey)) {
      return { joined: false };
    }

    const room = this.projectRoom(tenantId, data.projectKey);
    await client.join(room);
    this.logger.debug(`Client ${client.id} joined ${room}`);
    return { joined: true };
  }

  @SubscribeMessage('leave:project')
  async handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectKey: string },
  ) {
    const tenantId = this.getTenantId(client);
    if (!tenantId || !PROJECT_KEY_REGEX.test(data?.projectKey)) {
      return { left: false };
    }

    await client.leave(this.projectRoom(tenantId, data.projectKey));
    return { left: true };
  }

  emitToTenant(tenantId: string, event: string, data: unknown, projectKey?: string) {
    const rooms = [this.tenantRoom(tenantId)];
    if (projectKey) {
      rooms.push(this.projectRoom(tenantId, projectKey));
    }

    // Socket.IO emits once to the union, even when a socket is in both rooms.
    this.server.to(rooms).emit(event, data);
  }

  emitToProject(tenantId: string, projectKey: string, event: string, data: unknown) {
    this.server.to(this.projectRoom(tenantId, projectKey)).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    for (const [, socket] of this.server.sockets.sockets) {
      if (socket.data.userId === userId) {
        socket.emit(event, data);
      }
    }
  }

  private getTenantId(client: Socket): string | undefined {
    return typeof client.data.tenantId === 'string' ? client.data.tenantId : undefined;
  }

  private tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  private projectRoom(tenantId: string, projectKey: string): string {
    return `${this.tenantRoom(tenantId)}:project:${projectKey}`;
  }
}
