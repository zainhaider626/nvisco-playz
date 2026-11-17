// Server-sent events: one long-lived HTTP stream per open browser tab. Pushes a fresh snapshot each tick.
const clients = new Map(); // userId -> Set<res>

export function addClient(uid, res) {
  if (!clients.has(uid)) clients.set(uid, new Set());
  clients.get(uid).add(res);
  res.on('close', () => { const s = clients.get(uid); if (s) { s.delete(res); if (!s.size) clients.delete(uid); } });
}
export const connectedUserIds = () => [...clients.keys()];
export const connectedCount = () => clients.size;
export function sendTo(uid, event, data) {
  const s = clients.get(uid); if (!s) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of s) res.write(msg);
}
export function heartbeat() { for (const s of clients.values()) for (const res of s) res.write(': ping\n\n'); }
