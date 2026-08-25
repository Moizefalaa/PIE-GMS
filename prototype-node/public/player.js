const $ = id => document.getElementById(id);
let clientId = localStorage.getItem('pid');
if (!clientId) { clientId = 'c' + Math.random().toString(36).slice(2, 10); localStorage.setItem('pid', clientId); }

let codeVal = null, aliasVal = null, canGuess = false, iAmDrawer = false, reconnectTimer = null;

function applyCalm() {
  const on = $('calm').checked;
  document.body.classList.toggle('calm', on);
  localStorage.setItem('calm', on ? '1' : '0');
}
$('calm').checked = localStorage.getItem('calm') === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
applyCalm();
$('calm').addEventListener('change', applyCalm);

function fmtTime(s) {
  const m = Math.floor(s / 60), s2 = s % 60;
  return m + ':' + String(s2).padStart(2, '0');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let ws = null;
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => {
    if (codeVal) ws.send(JSON.stringify({ type: 'join', code: codeVal, alias: aliasVal, clientId }));
  };
  ws.onmessage = onMsg;
  ws.onclose = () => {
    if (codeVal) {
      $('status').textContent = 'Reconectando...';
      reconnectTimer = setTimeout(connect, 1500);
    }
  };
}

function onMsg(e) {
  const m = JSON.parse(e.data);
  if (m.type === 'joined') {
    $('join').style.display = 'none';
    $('game').style.display = 'block';
    if (m.reconnected) $('status').textContent = '¡Reconectado!';
  }
  if (m.type === 'error') $('status').textContent = 'Error: ' + m.msg;
  if (m.type === 'round') {
    iAmDrawer = (m.drawerId === clientId);
    canGuess = !iAmDrawer;
    $('reward').style.display = 'none';
    $('timer').textContent = '';
    $('timer').classList.remove('low');
    if (iAmDrawer) {
      $('drawerPanel').style.display = 'block';
      $('wordToDraw').textContent = m.word || '';
      $('options').innerHTML = '';
      $('status').textContent = 'Es tu turno de dibujar. Los demás adivinan.';
    } else {
      $('drawerPanel').style.display = 'none';
      renderOptions(m.options);
      $('feedback').textContent = '';
      $('feedback').className = '';
      $('status').textContent = '¡Adivina! Toca la tarjeta correcta.';
    }
  }
  if (m.type === 'guess_result') {
    canGuess = false;
    if (m.correct) {
      $('reward').style.display = 'block';
      $('feedback').textContent = '✓ ¡Correcto!';
      $('feedback').className = 'ok';
    } else {
      $('reward').style.display = 'none';
      $('feedback').textContent = 'No era ésa, ¡ánimo!';
      $('feedback').className = 'no';
    }
    disableOptions();
  }
  if (m.type === 'reveal') { $('status').textContent = 'Respuesta: ' + m.word; $('timer').textContent = ''; $('timer').classList.remove('low'); }
  if (m.type === 'tick') {
    $('timer').textContent = '⏱ ' + fmtTime(m.remaining);
    $('timer').classList.toggle('low', m.remaining <= 10);
  }
  if (m.type === 'draw_clear') clearCanvas();
  if (m.type === 'draw') drawLine(m.from, m.to, m.color, m.size);
}

$('joinBtn').onclick = () => {
  codeVal = $('codeIn').value.trim();
  aliasVal = $('alias').value.trim();
  if (!codeVal) { $('status').textContent = 'Escribe el código de sala'; return; }
  connect();
};

function renderOptions(opts) {
  $('options').innerHTML = opts.map(o =>
    `<button class="card" data-id="${o.id}" onclick="guess(${o.id})">${escapeHtml(o.text)}</button>`
  ).join('');
}
function guess(id) {
  if (!canGuess || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'guess', optionId: id }));
}
function disableOptions() {
  document.querySelectorAll('#options .card').forEach(b => (b.disabled = true));
}

const canvas = $('board');
const ctx = canvas.getContext('2d');
let drawing = false, last = null;
function pos(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height };
}
function start(e) { if (!iAmDrawer) return; drawing = true; last = pos(e); e.preventDefault(); }
function move(e) {
  if (!drawing || !iAmDrawer || !ws || ws.readyState !== 1) return;
  const p = pos(e);
  drawLine(last, p);
  ws.send(JSON.stringify({ type: 'draw', from: last, to: p, color: '#2b6cb0', size: 4 }));
  last = p; e.preventDefault();
}
function end() { drawing = false; }
canvas.addEventListener('mousedown', start);
canvas.addEventListener('mousemove', move);
window.addEventListener('mouseup', end);
canvas.addEventListener('touchstart', start, { passive: false });
canvas.addEventListener('touchmove', move, { passive: false });
canvas.addEventListener('touchend', end);
$('clearBtn').onclick = () => { clearCanvas(); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'draw_clear' })); };

function drawLine(a, b, color, size) {
  ctx.strokeStyle = color || '#000';
  ctx.lineWidth = size || 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
  ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
  ctx.stroke();
}
function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
