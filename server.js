const WebSocket = require("ws");

const server = new WebSocket.Server({
  port: process.env.PORT || 8080,
  host: "0.0.0.0",
});
const clients = new Map();

server.on("connection", (ws) => {
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (data, isBinary) => {
    if (!ws.clientId && !isBinary) {
      try {
        const json = JSON.parse(data.toString());
        if (json.type === "init" && json.clientId) {
          ws.clientId = json.clientId;
          registerClient(ws.clientId, ws);
          return;
        }
      } catch (e) {
        console.warn("Invalid init JSON:", e.message);
        return;
      }
    }

    if (ws.clientId) {
      handleClientMessage(ws.clientId, data, isBinary);
    }
  });

  ws.on("close", () => {
    handleClientClose(ws.clientId);
  });
});

function registerClient(clientId, ws) {
  const client = { ws, isMicOn: false };
  clients.set(clientId, client);
  ws.isAlive = true;

  const existingClients = [];
  for (const [id, otherClient] of clients.entries()) {
    if (id !== clientId) {
      existingClients.push({
        clientId: id,
        isMicOn: otherClient.isMicOn,
      });
    }
  }

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "client_list",
        clients: existingClients,
      })
    );
  }

  broadcast(
    {
      type: "client_status",
      clientId,
      status: "connected",
    },
    clientId
  );
}

function handleClientMessage(clientId, data, isBinary) {
  const client = clients.get(clientId);
  if (!client) return;

  try {
    if (isBinary) {
      if (!client.isMicOn) {
        client.isMicOn = true;
        broadcast(
          {
            type: "mic_status",
            clientId,
            isMicOn: true,
          },
          clientId
        );
      }

      const idBuffer = Buffer.alloc(4);
      idBuffer.writeUInt32BE(clientId);
      const combined = Buffer.concat([idBuffer, data]);

      broadcast(combined, clientId);
      return;
    }

    const str = data.toString();
    const json = JSON.parse(str);

    switch (json.type) {
      case "mic_status":
        if (typeof json.isMicOn === "boolean") {
          client.isMicOn = json.isMicOn;
          broadcast(
            {
              type: "mic_status",
              clientId,
              isMicOn: client.isMicOn,
            },
            clientId
          );
        }
        break;

      case "text_message":
        broadcast(
          {
            type: "text_message",
            clientId,
            message: json.message,
          },
          clientId
        );
        break;

      default:
        console.warn("Unknown message type:", json.type);
        break;
    }
  } catch (e) {
    console.error("Error parsing message:", e.message);
  }
}

function handleClientClose(clientId) {
  clients.delete(clientId);
  broadcast({
    type: "client_status",
    clientId,
    status: "disconnected",
  });
}

function broadcast(data, excludeClientId = null) {
  const isBinary = Buffer.isBuffer(data);
  const message = isBinary
    ? data
    : typeof data === "string"
    ? data
    : JSON.stringify(data);

  if (!isBinary) {
    console.log("📣 broadcast (text):", message);
  }

  for (const [id, client] of clients.entries()) {
    if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

setInterval(() => {
  for (const [id, client] of clients.entries()) {
    if (!client.ws.isAlive) {
      console.warn(`Client ${id} is unresponsive`);
      client.ws.terminate();
      handleClientClose(id);
    } else {
      client.ws.isAlive = false;
      client.ws.ping();
    }
  }
}, 15000);

console.log("✅ WebSocket server running");
