import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, startRoom, submitDecision, resolveRound, publicRoom } from '../shared/game-engine.mjs';

test('room starts only with two players and host authority', () => {
  const room = createRoom('p1', 'Nova', 1000);
  assert.throws(() => startRoom(room, 'p1', 1000), /At least two/);
  joinRoom(room, 'p2', 'Cipher');
  assert.throws(() => startRoom(room, 'p2', 1000), /Only the room commander/);
  startRoom(room, 'p1', 1000);
  assert.equal(room.status, 'playing');
  assert.equal(room.round, 1);
});

test('rejects unaffordable actions and duplicate decisions', () => {
  const room = createRoom('p1', 'Nova', 1000); joinRoom(room, 'p2', 'Cipher'); startRoom(room, 'p1', 1000);
  room.players[0].credits = 0;
  assert.throws(() => submitDecision(room, 'p1', { action: 'expand', districtId: 'exchange' }, 1001), /Insufficient credits/);
  submitDecision(room, 'p1', { action: 'generate' }, 1002);
  assert.throws(() => submitDecision(room, 'p1', { action: 'generate' }, 1003), /already locked/);
});

test('two-player three-round match resolves scoring and declares a winner', () => {
  const room = createRoom('p1', 'Nova', 1000); joinRoom(room, 'p2', 'Cipher'); room.maxRounds = 3; startRoom(room, 'p1', 1000);
  for (let r = 1; r <= 3; r++) {
    const free = room.districts.find(d => !d.ownerId);
    submitDecision(room, 'p1', { action: 'expand', districtId: free.id }, 1000 + r * 100);
    submitDecision(room, 'p2', { action: 'generate' }, 1001 + r * 100);
  }
  assert.equal(room.status, 'finished');
  assert.equal(room.resolvedRounds.length, 3);
  assert.ok(room.players.every(p => p.score >= 0));
  assert.ok(room.winnerId === 'p1' || room.winnerId === 'p2');
  assert.ok(room.eventLog.some(e => e.kind === 'FINALE'));
  assert.equal(publicRoom(room, 'p1').crisis?.outcome, undefined);
});

test('round timeout resolves exactly once and gives missing players fallback action', () => {
  const room = createRoom('p1', 'Nova', 1000); joinRoom(room, 'p2', 'Cipher'); startRoom(room, 'p1', 1000);
  submitDecision(room, 'p1', { action: 'generate' }, 1100);
  resolveRound(room, 32001);
  const count = room.resolvedRounds.length;
  resolveRound(room, 32002);
  assert.equal(room.resolvedRounds.length, count);
  assert.ok(room.eventLog.some(e => e.kind === 'TIMEOUT'));
});
