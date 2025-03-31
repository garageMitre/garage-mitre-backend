import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // Permitir conexiones desde cualquier origen (cambiar en producción)
    methods: ['GET', 'POST']
  }
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('NotificationGateway');

  afterInit(server: Server) {
  }

  handleConnection(client: Socket) {
  }

  handleDisconnect(client: Socket) {
  }

  sendNotification(message: any) {
    this.server.emit('notification', message);
  }
}
