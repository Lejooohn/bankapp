import express, { type Response } from 'express';

const router = express.Router();

interface Client {
  userId: string;
  res: Response;
}

const clients = new Set<Client>();

export function broadcastTransactionsChanged(userId: string, accountId: string) {
  const payload = `data: ${JSON.stringify({ type: 'transactions-changed', accountId })}\n\n`;
  for (const client of clients) {
    if (client.userId === userId) {
      client.res.write(payload);
    }
  }
}

router.get('/events', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(': connected\n\n');

  const client: Client = { userId: req.user.id, res };
  clients.add(client);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
});

export default router;
