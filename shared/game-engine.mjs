export const MAX_PLAYERS = 8;
export const MAX_ROUNDS = 5;
export const ROUND_MS = 60_000;
export const DISTRICTS = [
  { id: 'exchange', name: 'NEON EXCHANGE', type: 'FINANCE', color: '#52d9ff', reward: '+2 Credits / round' },
  { id: 'grid', name: 'POWER GRID', type: 'ENERGY', color: '#5ef0c0', reward: '+1 Energy / round' },
  { id: 'ghost', name: 'GHOST NETWORK', type: 'INTEL', color: '#d58cff', reward: '+1 Intel / round' },
  { id: 'ward', name: 'IRON WARD', type: 'SECURITY', color: '#ffb85c', reward: '+1 Security / round' },
  { id: 'market', name: 'BLACK MARKET', type: 'HIGH RISK', color: '#ff648e', reward: '+35 Influence / round' },
  { id: 'civic', name: 'CIVIC SECTOR', type: 'STABILITY', color: '#9caeff', reward: '+1 Credit / round' },
];
export const CRISES = [
  { title: 'GRID FAILURE', description: 'Power infrastructure is unstable. Operators with Power Grid control can convert the outage into an advantage.', type: 'energy', objectiveActions: ['generate','recover'], objective: 'Generate or recover energy', outcomes: ['positive','negative','stable'] },
  { title: 'MARKET SHOCK', description: 'Volatility is spiking across the Neon Exchange. Aggressive expansion could pay off—or expose weak reserves.', type: 'finance', objectiveActions: ['expand'], objective: 'Expand into a district', outcomes: ['positive','negative','stable'] },
  { title: 'DATA BREACH', description: 'An unknown actor has leaked fragments of the city network. Intelligence may be more valuable than brute force.', type: 'intel', objectiveActions: ['scout','predict'], objective: 'Scout or predict', outcomes: ['positive','negative','stable'] },
  { title: 'CORPORATE CRACKDOWN', description: 'Security forces are sweeping contested districts. Fortification and careful timing may decide control.', type: 'security', objectiveActions: ['fortify'], objective: 'Fortify your security', outcomes: ['positive','negative','stable'] },
  { title: 'PUBLIC UPRISING', description: 'Civic systems are under pressure. Stable holdings may outperform high-risk operations this round.', type: 'civic', objectiveActions: ['recover','fortify'], objective: 'Recover or fortify', outcomes: ['positive','negative','stable'] },
  { title: 'BLACK MARKET SURGE', description: 'A shadow economy is opening new channels. Risk-takers may profit, but the downside is real.', type: 'risk', objectiveActions: ['sabotage'], objective: 'Launch a sabotage operation', outcomes: ['positive','negative','stable'] },
];
const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const clampName = name => String(name || 'Operator').trim().replace(/[<>]/g, '').slice(0, 18) || 'Operator';
const player = (id, name) => ({ id, name: clampName(name), credits: 10, intel: 3, energy: 5, security: 2, score: 0, districts: [], submitted: false, lastAction: '', predictionsCorrect: 0, streak: 0 });
const addEvent = (room, text, kind = 'INFO') => room.eventLog.push({ id: `${Date.now()}-${uid()}`, text, round: room.round, kind });
function newCrisis(round) {
  const c = CRISES[Math.floor(Math.random() * CRISES.length)];
  return { title: c.title, description: c.description, type: c.type, objective: c.objective, objectiveActions: c.objectiveActions, round, outcome: c.outcomes[Math.floor(Math.random() * c.outcomes.length)] };
}
export function createRoom(playerId, name, now = Date.now()) {
  const code = uid().slice(0, 6);
  return { code, hostId: playerId, status: 'lobby', round: 0, maxRounds: MAX_ROUNDS, deadline: null, createdAt: now, players: [player(playerId, name)], districts: DISTRICTS.map(d => ({ ...d, ownerId: null })), crisis: null, eventLog: [], winnerId: null, pending: {}, resolvedRounds: [] };
}
export function joinRoom(room, playerId, name) {
  if (!room) throw new Error('Room not found. Check the access code.');
  if (room.status !== 'lobby') throw new Error('This match has already started.');
  if (room.players.some(p => p.id === playerId)) return room;
  if (room.players.length >= MAX_PLAYERS) throw new Error('This room is full (8 operators maximum).');
  room.players.push(player(playerId, name));
  addEvent(room, `${clampName(name)} connected to operations.`, 'CONNECT');
  return room;
}
export function startRoom(room, playerId, now = Date.now()) {
  if (room.hostId !== playerId) throw new Error('Only the room commander can start the match.');
  if (room.status !== 'lobby') throw new Error('The match has already started.');
  if (room.players.length < 2) throw new Error('At least two operators are required to start.');
  room.status = 'playing'; room.round = 1; room.deadline = now + ROUND_MS; room.crisis = newCrisis(1); room.pending = {}; room.players.forEach(p => { p.submitted = false; });
  addEvent(room, `Round 1 initiated. Crisis detected: ${room.crisis.title}.`, 'CRISIS');
  return room;
}
function pay(p, cost) { for (const [k,v] of Object.entries(cost)) if ((p[k] ?? 0) < v) throw new Error(`Insufficient ${k}. This action is not affordable.`); for (const [k,v] of Object.entries(cost)) p[k] -= v; }
function validDecision(room, p, d) {
  if (!d || typeof d.action !== 'string') throw new Error('Choose an action before locking your decision.');
  switch (d.action) {
    case 'expand':
      pay(p, { credits: 4 });
      if (!room.districts.some(x => x.id === d.districtId && !x.ownerId)) throw new Error('That district is already controlled. Select an unclaimed district.');
      break;
    case 'generate': break;
    case 'fortify': pay(p, { credits: 2, energy: 1 }); break;
    case 'scout': pay(p, { intel: 1 }); if (!room.districts.some(x => x.id === d.districtId)) throw new Error('Choose a valid district to scout.'); break;
    case 'predict': pay(p, { intel: 1 }); if (!['positive','negative','stable'].includes(d.prediction)) throw new Error('Choose a valid forecast.'); break;
    case 'sabotage': pay(p, { credits: 3, energy: 2 }); if (!room.players.some(x => x.id === d.targetId && x.id !== p.id)) throw new Error('Choose a valid rival.'); break;
    case 'recover': pay(p, { credits: 2 }); break;
    default: throw new Error('Unknown action. Choose an action from the field manual.');
  }
}
export function submitDecision(room, playerId, decision, now = Date.now()) {
  if (room.status !== 'playing') throw new Error('This match is not accepting decisions.');
  if (room.deadline && now >= room.deadline) { resolveRound(room, now); if (room.status !== 'playing') throw new Error('The match has ended.'); throw new Error('Decision window expired. The round has resolved.'); }
  const p = room.players.find(x => x.id === playerId); if (!p) throw new Error('You are not a member of this room.');
  if (p.submitted) throw new Error('Your decision is already locked for this round.');
  const d = { action: decision.action, districtId: decision.districtId, targetId: decision.targetId, prediction: decision.prediction };
  validDecision(room, p, d); p.submitted = true; p.lastAction = d.action; room.pending[p.id] = d;
  addEvent(room, `${p.name} locked a decision.`, 'LOCKED');
  if (room.players.every(x => x.submitted)) resolveRound(room, now, true);
  return room;
}
export function resolveRound(room, now = Date.now(), force = false) {
  if (room.status !== 'playing' || room.resolvedRounds.includes(room.round)) return room;
  if (!force && room.deadline && now < room.deadline) return room;
  const currentRound = room.round; const crisis = room.crisis;
  const startScores = Object.fromEntries(room.players.map(p => [p.id, p.score]));
  for (const p of room.players) {
    const d = room.pending[p.id] || { action: 'generate' };
    if (!room.pending[p.id]) addEvent(room, `${p.name} timed out; emergency generation protocol applied.`, 'TIMEOUT');
    try {
      if (d.action === 'expand') {
        const district = room.districts.find(x => x.id === d.districtId && !x.ownerId);
        if (district && p.credits >= 0) { district.ownerId = p.id; p.districts.push(district.id); p.score += 100; addEvent(room, `${p.name} captured ${district.name} (+100 Influence).`, 'CAPTURE'); }
        else { p.credits += 4; addEvent(room, `${p.name}'s expansion failed; credits refunded.`, 'BLOCKED'); }
      } else if (d.action === 'generate') { p.credits += 3; p.energy += 1; addEvent(room, `${p.name} generated +3 Credits and +1 Energy.`, 'RESOURCE'); }
      else if (d.action === 'fortify') { p.security += 2; addEvent(room, `${p.name} reinforced security (+2).`, 'DEFENSE'); }
      else if (d.action === 'scout') { const district = room.districts.find(x => x.id === d.districtId); p.intel += 1; addEvent(room, `${p.name} scouted ${district?.name || 'a district'} and recovered a signal (+1 Intel).`, 'INTEL'); }
      else if (d.action === 'predict') { if (d.prediction === crisis?.outcome) { p.score += 50; p.predictionsCorrect += 1; addEvent(room, `${p.name} correctly forecast the crisis (+50 Influence).`, 'BONUS'); } else addEvent(room, `${p.name}'s crisis forecast missed.`, 'FORECAST'); }
      else if (d.action === 'sabotage') {
        const target = room.players.find(x => x.id === d.targetId);
        if (target && target.id !== p.id) { const defended = target.security > 0; if (defended) { target.security -= 1; target.score += 30; addEvent(room, `${target.name} contained ${p.name}'s operation and earned a defense bonus (+30 Influence).`, 'DEFENSE'); } else { const district = room.districts.find(x => x.ownerId === target.id); if (district) { district.ownerId = p.id; target.districts = target.districts.filter(id => id !== district.id); p.districts.push(district.id); p.score += 60; addEvent(room, `${p.name} seized ${district.name} from ${target.name} (+60 Influence).`, 'SABOTAGE'); } else { target.credits = Math.max(0, target.credits - 2); p.score += 25; addEvent(room, `${p.name} disrupted ${target.name}'s reserves (+25 Influence).`, 'SABOTAGE'); } } }
      } else if (d.action === 'recover') { p.energy += 2; addEvent(room, `${p.name} recovered +2 Energy.`, 'RESOURCE'); }
    } catch { addEvent(room, `${p.name}'s operation was rejected during resolution.`, 'BLOCKED'); }
  }
  const actionScores = Object.fromEntries(room.players.map(p => [p.id, p.score - startScores[p.id]]));
  for (const p of room.players) {
    const d = room.pending[p.id] || { action: 'generate' };
    if (crisis?.objectiveActions?.includes(d.action)) { p.score += 75; addEvent(room, `${p.name} completed the ${crisis.title} objective (+75 Influence).`, 'OBJECTIVE'); }
  }
  for (const district of room.districts) {
    if (!district.ownerId) continue;
    const p = room.players.find(x => x.id === district.ownerId); if (!p) continue;
    if (district.id === 'exchange') p.credits += 2;
    if (district.id === 'grid') p.energy += 1;
    if (district.id === 'ghost') p.intel += 1;
    if (district.id === 'ward') p.security += 1;
    if (district.id === 'market') p.score += 35;
    if (district.id === 'civic') p.credits += 1;
    p.score += 25;
  }
  if (crisis?.outcome === 'positive') { const leader = [...room.players].sort((a,b)=>b.score-a.score)[0]; if (leader) { leader.score += 25; addEvent(room, `Positive crisis resolution: ${leader.name} capitalized on the moment (+25 Influence).`, 'CRISIS BONUS'); } }
  if (crisis?.outcome === 'negative') { for (const p of room.players) { if (p.security > 0) p.security -= 1; else p.credits = Math.max(0, p.credits - 1); } addEvent(room, 'Negative crisis resolution: all operators absorbed a disruption.', 'CRISIS'); }
  for (const p of room.players) {
    const gained = p.score - startScores[p.id];
    if (gained > 0) p.streak += 1; else p.streak = 0;
    if (p.streak === 3) { p.score += 75; addEvent(room, `${p.name} earned the three-round performance streak (+75 Influence).`, 'BONUS'); p.streak = 0; }
  }
  const efficiency = room.players.map(p => ({ p, score: actionScores[p.id] || 0, spend: Math.max(1, (room.pending[p.id]?.action === 'expand' ? 4 : room.pending[p.id]?.action === 'fortify' ? 3 : room.pending[p.id]?.action === 'sabotage' ? 5 : room.pending[p.id]?.action === 'predict' || room.pending[p.id]?.action === 'scout' ? 1 : room.pending[p.id]?.action === 'recover' ? 2 : 0)) }));
  const best = efficiency.filter(x=>x.score>0).sort((a,b)=>(b.score/b.spend)-(a.score/a.spend))[0];
  if (best) { best.p.score += 50; addEvent(room, `${best.p.name} earned the round efficiency bonus (+50 Influence).`, 'BONUS'); }
  room.resolvedRounds.push(currentRound); room.pending = {};
  for (const p of room.players) p.submitted = false;
  if (currentRound >= room.maxRounds) {
    room.status = 'finished'; room.deadline = null;
    const sorted = [...room.players].sort((a,b)=>b.score-a.score || b.districts.length-a.districts.length || ((b.credits+b.intel+b.energy+b.security)-(a.credits+a.intel+a.energy+a.security)) || b.predictionsCorrect-a.predictionsCorrect);
    room.winnerId = sorted[0]?.id || null; addEvent(room, `Mission complete. ${sorted[0]?.name || 'No operator'} claims the city.`, 'FINALE');
  } else { room.round = currentRound + 1; room.crisis = newCrisis(room.round); room.deadline = now + ROUND_MS; addEvent(room, `Round ${room.round} opened. New crisis: ${room.crisis.title}.`, 'CRISIS'); }
  return room;
}
export function publicRoom(room, playerId) {
  const { pending, ...base } = room;
  return { ...base, players: base.players.map(p => ({ ...p })), districts: base.districts.map(d=>({...d})), crisis: base.crisis ? (({ outcome, ...visible }) => visible)(base.crisis) : null, myPrivate: { prediction: pending?.[playerId]?.action === 'predict' ? pending[playerId].prediction : null } };
}
