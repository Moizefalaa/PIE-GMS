const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const BANK = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'wordbank.json'), 'utf8'));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/host.html';
  const filePath = path.join(PUBLIC, urlPath);
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function genCode() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}
function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildOptions(category, mode) {
  const cat = BANK[category];
  if (!cat) return null;
  const pool = (mode === 'situations' ? cat.situations : cat.words).filter(Boolean);
  if (pool.length < 4) return null;
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const distract = shuffle(pool.filter(w => w !== correct)).slice(0, 3);
  const options = shuffle([correct, ...distract]).map((text, i) => ({ id: i, text }));
  const correctId = options.find(o => o.text === correct).id;
  return { options, correctId, word: correct };
}
function playersList(room) {
  return [...room.players.values()].map(p => ({ clientId: p.clientId, alias: p.alias }));
}
function sendAll(room, obj) {
  send(room.host, obj);
  room.players.forEach(p => send(p.ws, obj));
}
function broadcast(room, obj, exceptWs) {
  if (room.host && room.host !== exceptWs) send(room.host, obj);
  room.players.forEach(p => { if (p.ws !== exceptWs) send(p.ws, obj); });
}
function clearTimer(room) {
  if (room && room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'host_create') {
      const code = genCode();
      rooms.set(code, { code, host: ws, players: new Map(), round: null, correctCount: 0, timerInterval: null });
      ws.role = 'host'; ws.code = code; ws.clientId = 'host';
      send(ws, { type: 'room_created', code });
      return;
    }

    if (msg.type === 'join') {
      const room = rooms.get(String(msg.code));
      if (!room) { send(ws, { type: 'error', msg: 'Sala no encontrada' }); return; }
      const clientId = String(msg.clientId || ('c' + Math.random().toString(36).slice(2, 10)));
      let p = room.players.get(clientId);
      let reconnected = false;
      if (p) {
        reconnected = true;
        if (p.timer) { clearTimeout(p.timer); p.timer = null; }
        p.ws = ws;
        p.alias = String(msg.alias || p.alias).slice(0, 20);
      } else {
        p = { clientId, alias: String(msg.alias || 'Jugador').slice(0, 20), ws, guessed: false, timer: null };
        room.players.set(clientId, p);
      }
      ws.role = 'player'; ws.code = room.code; ws.clientId = clientId;
      send(ws, { type: 'joined', id: clientId, reconnected });
      if (room.round) {
        const w = (room.round.drawerId === clientId) ? room.round.word : undefined;
        send(ws, { type: 'round', word: w, options: room.round.options, drawerId: room.round.drawerId, mode: room.round.mode });
      }
      send(room.host, { type: 'players', players: playersList(room) });
      return;
    }

    const room = rooms.get(ws.code);
    if (!room) return;

    if (ws.role === 'host') {
      if (msg.type === 'host_start') {
        const built = buildOptions(msg.category, msg.mode);
        if (!built) { send(ws, { type: 'error', msg: 'Categoria sin suficientes palabras' }); return; }
        const drawerId = msg.drawerId || 'host';
        room.round = { ...built, mode: msg.mode, category: msg.category, drawerId };
        room.correctCount = 0;
        room.players.forEach(p => (p.guessed = false));
        clearTimer(room);
        const isDrawerHost = drawerId === 'host';
        send(ws, { type: 'round', word: isDrawerHost ? built.word : undefined, options: built.options, drawerId, mode: msg.mode });
        room.players.forEach(p => {
          const w = (p.clientId === drawerId) ? built.word : undefined;
          send(p.ws, { type: 'round', word: w, options: built.options, drawerId, mode: msg.mode });
        });
        send(ws, { type: 'progress', correct: 0, total: room.players.size });
        if (msg.timerEnabled && msg.timerSeconds > 0) {
          const endsAt = Date.now() + msg.timerSeconds * 1000;
          room.round.endsAt = endsAt;
          broadcast(room, { type: 'tick', remaining: msg.timerSeconds }, null);
          room.timerInterval = setInterval(() => {
            const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            broadcast(room, { type: 'tick', remaining: rem }, null);
            if (rem <= 0) {
              clearTimer(room);
              if (room.round) sendAll(room, { type: 'reveal', word: room.round.word });
            }
          }, 1000);
        }
        return;
      }
      if (msg.type === 'host_reveal') {
        clearTimer(room);
        if (room.round) sendAll(room, { type: 'reveal', word: room.round.word });
        return;
      }
      if (msg.type === 'host_next') {
        clearTimer(room);
        sendAll(room, { type: 'draw_clear' });
        room.round = null;
        send(room.host, { type: 'cleared' });
        return;
      }
    }

    if (ws.role === 'player') {
      if (msg.type === 'guess') {
        if (!room.round) return;
        const p = room.players.get(ws.clientId);
        if (!p || p.guessed) return;
        p.guessed = true;
        const correct = (msg.optionId === room.round.correctId);
        if (correct) room.correctCount++;
        send(ws, { type: 'guess_result', correct, text: room.round.word });
        send(room.host, { type: 'progress', correct: room.correctCount, total: room.players.size });
        send(room.host, { type: 'guess_event', clientId: ws.clientId, alias: p.alias, correct });
        return;
      }
    }

    if (msg.type === 'draw' || msg.type === 'draw_clear') {
      broadcast(room, msg, ws);
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.code);
    if (!room) return;
    if (ws.role === 'host') { clearTimer(room); rooms.delete(room.code); return; }
    if (ws.role === 'player') {
      const p = room.players.get(ws.clientId);
      if (p && p.ws === ws) {
        // gracia de 8s para permitir reconexion sin perder la plaza/turno
        p.timer = setTimeout(() => {
          room.players.delete(ws.clientId);
          send(room.host, { type: 'players', players: playersList(room) });
        }, 8000);
      }
    }
  });
});

server.listen(PORT, () =>
  console.log(`Servidor en http://localhost:${PORT}\n  Proyector (educador): /host.html\n  Alumnos (movil):      /player.html`)
);
