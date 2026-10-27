import { getStore } from '@netlify/blobs';
import { createRoom, joinRoom, startRoom, submitDecision, resolveRound, publicRoom } from '../../shared/game-engine.mjs';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (message: string, status = 400) => json({ error: message }, status);
const roomKey = (code: string) => `room:${String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}`;
const token = () => crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');

async function mutateRoom(store: ReturnType<typeof getStore>, code: string, mutator: (room: any) => any) {
  const key = roomKey(code);
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!current?.data) throw new Error('Room not found. Check the access code.');
    const room = structuredClone(current.data as any);
    const result = mutator(room);
    const saved = await store.setJSON(key, room, { onlyIfMatch: current.etag });
    if (saved.modified) return { room, result };
  }
  throw new Error('The room changed at the same time as your request. Please retry.');
}
function requireMember(room: any, playerId: string, playerToken: string) {
  if (!playerId || !playerToken || room.playerTokens?.[playerId] !== playerToken || !room.players.some((p: any) => p.id === playerId)) {
    throw new Error('Your operator session is not valid for this room. Rejoin with the room code.');
  }
}
function cleanRoom(room: any, playerId: string) {
  const safe = publicRoom(room, playerId) as any;
  delete safe.playerTokens;
  return safe;
}

// Netlify Functions v2 uses the Web Request/Response API. Netlify Blobs injects
// its site credentials for this function API; create the store inside the handler.
export default async function game(request: Request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const method = request.method || 'GET';
  let body: any = {};
  try {
    if (method === 'GET') {
      const url = new URL(request.url);
      body = Object.fromEntries(url.searchParams.entries());
    } else {
      body = await request.json();
    }
  } catch {
    return fail('Invalid JSON request.');
  }

  const action = String(body.action || (method === 'GET' ? 'state' : ''));
  const playerId = String(body.playerId || '').slice(0, 80);
  const playerToken = String(body.playerToken || '');
  const code = String(body.code || '').toUpperCase();

  try {
    const store = getStore({ name: 'pressure-point-rooms', consistency: 'strong' });

    if (action === 'create') {
      if (!playerId) return fail('Missing operator identity.');
      let room: any;
      const newToken = token();
      let saved = false;
      for (let i = 0; i < 8; i++) {
        room = createRoom(playerId, body.name);
        room.playerTokens = { [playerId]: newToken };
        const write = await store.setJSON(roomKey(room.code), room, { onlyIfNew: true });
        if (write.modified) { saved = true; break; }
      }
      if (!saved) return fail('Could not allocate a room code. Please try again.', 503);
      return json({ room: cleanRoom(room, playerId), playerToken: newToken });
    }

    if (action === 'join') {
      if (!playerId) return fail('Missing operator identity.');
      let newToken = token();
      const updated = await mutateRoom(store, code, (room) => {
        if (!room.playerTokens) room.playerTokens = {};
        const already = room.players.some((p: any) => p.id === playerId);
        if (already) {
          if (room.playerTokens[playerId] && room.playerTokens[playerId] !== playerToken) throw new Error('This operator identity is already registered. Refresh your browser identity and rejoin.');
          newToken = room.playerTokens[playerId] || newToken;
          room.playerTokens[playerId] = newToken;
        } else {
          joinRoom(room, playerId, body.name);
          room.playerTokens[playerId] = newToken;
        }
      });
      return json({ room: cleanRoom(updated.room, playerId), playerToken: newToken });
    }

    if (!code) return fail('Enter a room code.');
    if (action === 'state') {
      const current = await store.getWithMetadata(roomKey(code), { type: 'json', consistency: 'strong' });
      if (!current?.data) return fail('Room not found. Check the access code.', 404);
      const currentRoom: any = current.data;
      requireMember(currentRoom, playerId, playerToken);
      if (currentRoom.status === 'playing' && currentRoom.deadline && Date.now() >= currentRoom.deadline) {
        const resolved = await mutateRoom(store, code, (room) => {
          requireMember(room, playerId, playerToken);
          if (room.status === 'playing' && room.deadline && Date.now() >= room.deadline) resolveRound(room, Date.now());
        });
        return json({ room: cleanRoom(resolved.room, playerId) });
      }
      return json({ room: cleanRoom(currentRoom, playerId) });
    }

    const result = await mutateRoom(store, code, (room) => {
      requireMember(room, playerId, playerToken);
      if (action === 'start') startRoom(room, playerId, Date.now());
      else if (action === 'submit') submitDecision(room, playerId, body.decision, Date.now());
      else throw new Error('Unknown game action.');
    });
    return json({ room: cleanRoom(result.room, playerId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected game service error.';
    const status = message.includes('not found') ? 404 : message.includes('not valid') ? 401 : 400;
    console.error('PRESSURE POINT game function error:', error);
    return fail(message, status);
  }
}
