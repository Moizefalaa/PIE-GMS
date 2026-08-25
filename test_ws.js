const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const URL = 'ws://localhost:' + PORT;
let failed = false, code = null, revealed = false, tickSeen = false;
let p1 = null, p2 = null, p1id = null, p2id = null, drawerId = null;
let secondStarted = false, reconnectTested = false;

function ok(msg, cond) { console.log((cond ? 'OK   ' : 'FAIL ') + '- ' + msg); if (!cond) failed = true; }

const host = new WebSocket(URL);
host.on('open', () => host.send(JSON.stringify({ type: 'host_create' })));

host.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.type === 'room_created') {
    code = m.code;
    ok('anfitrion recibe codigo de 4 cifras: ' + code, /^\d{4}$/.test(code));
    p1 = new WebSocket(URL); attachPlayer(p1, 'Dibujante');
    p2 = new WebSocket(URL); attachPlayer(p2, 'Adivino');
  }
  if (m.type === 'players' && m.players.length === 2) {
    p1id = m.players.find(p => p.alias === 'Dibujante').clientId;
    p2id = m.players.find(p => p.alias === 'Adivino').clientId;
    ok('anfitrion ve los 2 jugadores (ids estables)', !!p1id && !!p2id);
    drawerId = p1id;
    host.send(JSON.stringify({ type: 'host_start', category: 'emociones', mode: 'words', drawerId, timerEnabled: true, timerSeconds: 12 }));
  }
  if (m.type === 'round' && !m.word) {
    ok('anfitrion (adivina) NO recibe la palabra', m.options.length === 4 && m.drawerId === drawerId);
  }
  if (m.type === 'tick' && !tickSeen) {
    tickSeen = true;
    ok('anfitrion recibe cuenta atras del temporizador', typeof m.remaining === 'number');
  }
  if (m.type === 'guess_event') {
    ok('anfitrion recibe evento de participacion (' + m.alias + ')', typeof m.correct === 'boolean');
    if (!revealed) host.send(JSON.stringify({ type: 'host_reveal' }));
  }
  if (m.type === 'reveal' && m.word) {
    revealed = true;
    ok('reveal se envia a todos con la palabra', !!m.word);
    if (!secondStarted) {
      secondStarted = true;
      host.send(JSON.stringify({ type: 'host_start', category: 'amistad', mode: 'words', drawerId, timerEnabled: false }));
    }
  }
  if (m.type === 'round' && m.drawerId === drawerId && secondStarted && !reconnectTested) {
    reconnectTested = true;
    ok('segunda ronda inicia con el mismo dibujante', true);
    p1.close();
    const p1b = new WebSocket(URL);
    p1b.on('open', () => p1b.send(JSON.stringify({ type: 'join', code, alias: 'Dibujante', clientId: p1id })));
    p1b.on('message', (d2) => {
      const mm = JSON.parse(d2);
      if (mm.type === 'joined') ok('reconexion reutiliza la MISMA identidad', mm.reconnected === true && mm.id === p1id);
      if (mm.type === 'round' && mm.drawerId === p1id) {
        ok('reconectado recupera su turno de dibujo (recibe la palabra)', !!mm.word);
        setTimeout(() => { [host, p1b, p2].forEach(w => w.close()); console.log(failed ? 'RESULTADO: FALLO' : 'RESULTADO: OK'); process.exit(failed ? 1 : 0); }, 200);
      }
    });
  }
});

function attachPlayer(ws, who) {
  let myId = null;
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, alias: who })));
  ws.on('message', (pd) => {
    const pm = JSON.parse(pd);
    if (pm.type === 'joined') { myId = pm.id; ok('jugador "' + who + '" se une (id=' + myId + ')', true); }
    if (pm.type === 'round' && pm.drawerId) {
      if (pm.drawerId === myId) {
        ok(who + ' recibe la PALABRA y 4 opciones', pm.options.length === 4 && !!pm.word);
        if (!secondStarted) ws.send(JSON.stringify({ type: 'draw', from: { x: 0, y: 0 }, to: { x: 0.7, y: 0.3 }, color: '#2b6cb0', size: 4 }));
      } else {
        ok(who + ' recibe 4 opciones y SIN palabra', pm.options.length === 4 && !pm.word);
        if (!secondStarted) ws.send(JSON.stringify({ type: 'guess', optionId: pm.options[0].id }));
      }
    }
    if (pm.type === 'guess_result') ok('Adivino recibe resultado (booleano)', typeof pm.correct === 'boolean');
  });
}

setTimeout(() => {
  if (!revealed) {
    console.log('TIMEOUT. p1id=' + p1id + ' drawerId=' + drawerId);
    process.exit(1);
  }
}, 10000);
