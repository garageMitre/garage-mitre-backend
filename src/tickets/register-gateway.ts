import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  
  @WebSocketGateway({ cors: true })
  export class TicketGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
  
    handleConnection(client: Socket) {
    }
  
    handleDisconnect(client: Socket) {
    }
  
    // Método para emitir un evento al cliente
    emitNewRegistration(data: any) {
      this.server.emit('new-registration', data); // Evento "new-registration"
    }
  }
  