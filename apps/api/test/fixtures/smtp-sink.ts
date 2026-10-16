import { createServer, type Socket } from 'node:net';

/** A loopback SMTP receiver. No message can leave the test machine. */
export async function smtpSink() {
  const messages: Array<{ recipients: string[]; body: string }> = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    let pending = '';
    let data = false;
    let body: string[] = [];
    let recipients: string[] = [];
    socket.write('220 fixture SMTP ready\r\n');
    socket.on('data', (chunk) => {
      pending += chunk;
      let newline: number;
      while ((newline = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 2);
        if (data) {
          if (line !== '.') {
            body.push(line.replace(/^\.\./, '.'));
            continue;
          }
          messages.push({ recipients: [...recipients], body: body.join('\r\n') });
          data = false;
          socket.write('250 message captured\r\n');
          continue;
        }
        if (/^EHLO|^HELO/i.test(line)) socket.write('250-fixture\r\n250 SIZE 1000000\r\n');
        else if (/^MAIL FROM/i.test(line)) {
          recipients = [];
          body = [];
          socket.write('250 sender ok\r\n');
        } else if (/^RCPT TO/i.test(line)) {
          recipients.push(line.slice(8).trim());
          socket.write('250 recipient ok\r\n');
        } else if (/^DATA/i.test(line)) {
          data = true;
          socket.write('354 send message\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 goodbye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  return {
    messages,
    port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
