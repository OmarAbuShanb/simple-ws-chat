const WebSocket = require('ws');

const server = new WebSocket.Server({
  port: process.env.PORT || 8080,
  host: '0.0.0.0'
});
const clients = new Map();

server.on('connection', (socket) => {
    console.log('Client connected');

    socket.isAlive = true;

    socket.on('pong', () => {
        socket.isAlive = true;
    });

    socket.once('message', (nameBuffer) => {
        const name = nameBuffer.toString('utf8');
        clients.set(name, socket);
        console.log(`${name} joined`);

        socket.on('message', (msgBuffer) => {
            const msg = msgBuffer.toString('utf8');
            const [targetName, ...messageParts] = msg.split(':');
            const message = messageParts.join(':').trim();

            const targetSocket = clients.get(targetName);
            if (targetSocket) {
                targetSocket.send(`${name} sent: ${message}`);
            } else {
                socket.send(`User ${targetName} not found`);
            }
        });
    });

    socket.on('close', () => {
        for (const [name, s] of clients.entries()) {
            if (s === socket) {
                clients.delete(name);
                console.log(`${name} disconnected`);
                break;
            }
        }
    });
});

setInterval(() => {
    for (const [name, socket] of clients.entries()) {
        if (!socket.isAlive) {
            console.log(`${name} is not responding. Terminating...`);
            socket.terminate();
            clients.delete(name);
            console.log(`${name} disconnected (timeout)`);
            continue;
        }

        socket.isAlive = false;
        socket.ping();
    }
}, 15000);

console.log('🟢 WebSocket server running on ws://localhost:8080');
