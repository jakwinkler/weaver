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

      const payload = this.jwtService.verify(token);
      (client as any).userId = payload.sub;
      (client as any).tenantId = payload.tenantId;

      if (payload.tenantId) {
        client.join(`tenant:${payload.tenantId}`);
      }
      if (payload.tenantId && payload.sub) {
        client.join(`tenant:${payload.tenantId}:user:${payload.sub}`);
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
  handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectKey: string },
  ) {
    client.join(`project:${data.projectKey}`);
    this.logger.debug(`Client ${client.id} joined project:${data.projectKey}`);
  }

  @SubscribeMessage('leave:project')
  handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectKey: string },
  ) {
    client.leave(`project:${data.projectKey}`);
  }

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  emitToProject(projectKey: string, event: string, data: unknown) {
    this.server.to(`project:${projectKey}`).emit(event, data);
  }

  emitToUser(tenantId: string, userId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}:user:${userId}`).emit(event, data);
  }
}
