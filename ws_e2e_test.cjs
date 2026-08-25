const WebSocket = require('ws');

const URL = 'ws://localhost:8080/ws';
const results = [];
function check(name, cond, extra) { results.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }

function open(tag) {
  const ws = new WebSocket(URL);
  ws._tag = tag; ws._all = [];
  ws.on('message', (d) => { try { ws._all.push(JSON.parse(d)); } catch {} });
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
function send(ws, obj) { ws.send(JSON.stringify(obj)); }
function waitMsg(ws, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout esperando mensaje en ' + ws._tag)), timeout);
    const handler = (data) => {
      let m; try { m = JSON.parse(data); } catch { return; }
      if (predicate(m)) { clearTimeout(t); ws.off('message', handler); resolve(m); }
    };
    ws.on('message', handler);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const host = await open('host');
  const p1 = await open('p1');

  send(host, { type: 'host_create' });
  const created = await waitMsg(host, m => m.type === 'room_created');
  check('host_create -> room_created con codigo', created.code && created.code.length === 4, created);
  const code = created.code;

  const hostClientId = 'host-1';
  send(host, { type: 'join', code, clientId: hostClientId, alias: 'Prof' });
  try {
    const joinedHost = await waitMsg(host, m => m.type === 'joined');
    check('host join -> joined', joinedHost.id === hostClientId && joinedHost.reconnected === false, joinedHost);
  } catch (e) { check('host join -> joined', false, e.message); }

  send(p1, { type: 'join', code, clientId: 'p1', alias: 'Ana' });
  try {
    const joinedP1 = await waitMsg(p1, m => m.type === 'joined');
    check('alumna join -> joined', joinedP1.id === 'p1', joinedP1);
  } catch (e) { check('alumna join -> joined', false, e.message); }

  try {
    const playersMsg = await waitMsg(host, m => m.type === 'players', 3000);
    check('broadcast players tiene 2', playersMsg.players && playersMsg.players.length === 2, playersMsg);
  } catch (e) {
    check('broadcast players tiene 2', false, { err: e.message, hostMsgs: host._all });
  }

  send(host, { type: 'host_start', code, category: 'emociones', mode: 'calm', drawerId: 'p1', timerEnabled: true, timerSeconds: 10 });
  let roundDrawer, roundGuesser;
  try {
    const res = await Promise.all([
      waitMsg(p1, m => m.type === 'round'),
      waitMsg(host, m => m.type === 'round')
    ]);
    roundDrawer = res[0]; roundGuesser = res[1];
  } catch (e) { check('round a drawer y guesser', false, e.message); }
  if (roundDrawer) check('drawer recibe word no nulo', typeof roundDrawer.word === 'string' && roundDrawer.word.length > 0, roundDrawer.word);
  if (roundGuesser) check('guesser recibe word nulo', roundGuesser.word === null, roundGuesser.word);
  if (roundDrawer) check('round trae opciones (>=4)', Array.isArray(roundDrawer.options) && roundDrawer.options.length >= 4, roundDrawer.options && roundDrawer.options.length);
  if (roundDrawer) check('round indica drawerId', roundDrawer.drawerId === 'p1', roundDrawer.drawerId);

  if (roundGuesser) {
    try {
      const drawPromise = waitMsg(host, m => m.type === 'draw');
      send(p1, { type: 'draw', from: 'p1', x0: 0, y0: 0, x1: 10, y1: 10, color: '#000', size: 3 });
      const drawRecv = await drawPromise;
      check('draw se retransmite al guesser', drawRecv.type === 'draw' && drawRecv.x1 === 10, drawRecv);
    } catch (e) { check('draw se retransmite al guesser', false, e.message); }

    try {
      const grPromise = waitMsg(host, m => m.type === 'guess_result');
      const gePromise = waitMsg(p1, m => m.type === 'guess_event');
      const progPromise = waitMsg(host, m => m.type === 'progress', 3000);
      send(host, { type: 'guess', code, clientId: hostClientId, optionId: roundGuesser.options[0].id });
      const gr = await grPromise;
      const ge = await gePromise;
      const prog = await progPromise;
      check('guess -> guess_result al guesser', gr.type === 'guess_result' && typeof gr.correct === 'boolean', gr);
      check('guess -> guess_event al resto', ge.type === 'guess_event' && ge.alias === 'Prof', ge);
      check('progress se emite', prog.type === 'progress' && prog.total >= 1, prog);
    } catch (e) { check('guess flow', false, e.message); }
  }

  p1.close();
  await sleep(300);
  const p1b = await open('p1b');
  send(p1b, { type: 'join', code, clientId: 'p1', alias: 'Ana' });
  try {
    const rejoin = await waitMsg(p1b, m => m.type === 'joined');
    check('reconexion devuelve reconnected=true', rejoin.reconnected === true, rejoin);
  } catch (e) { check('reconexion devuelve reconnected=true', false, e.message); }

  send(host, { type: 'host_next', code });
  try {
    const round2 = await waitMsg(host, m => m.type === 'round', 3000);
    check('host_next -> nueva ronda', round2.type === 'round', round2 && round2.drawerId);
  } catch (e) { check('host_next -> nueva ronda', false, e.message); }

  send(host, { type: 'host_reveal', code });
  try {
    const reveal = await waitMsg(host, m => m.type === 'reveal', 3000);
    check('host_reveal -> reveal con word', reveal.type === 'reveal' && reveal.word, reveal);
  } catch (e) { check('host_reveal -> reveal', false, e.message); }

  host.close(); p1b.close();
  const failed = results.filter(r => !r[1]).length;
  console.log('\nRESULTADO: ' + (results.length - failed) + '/' + results.length + ' pass');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
