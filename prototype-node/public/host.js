const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
const $ = id => document.getElementById(id);
let code = null, lastCorrect = 0, tally = {};

function fmtTime(s) {
  const m = Math.floor(s / 60), s2 = s % 60;
  return m + ':' + String(s2).padStart(2, '0');
}
function showTimer(remaining) {
  $('timer').textContent = '⏱ ' + fmtTime(remaining);
  $('timer').classList.toggle('low', remaining <= 10);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Modo calma (persistente + respeta preferencia del sistema)
function applyCalm() {
  const on = $('calm').checked;
  document.body.classList.toggle('calm', on);
  localStorage.setItem('calm', on ? '1' : '0');
}
$('calm').checked = localStorage.getItem('calm') === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
applyCalm();
$('calm').addEventListener('change', applyCalm);

ws.onopen = () => ws.send(JSON.stringify({ type: 'host_create' }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'room_created') { code = m.code; $('code').textContent = code; }
  if (m.type === 'players') { renderPlayers(m.players); renderDrawerList(m.players, $('drawer').value); }
  if (m.type === 'round') {
    iAmDrawer = (m.drawerId === 'host');
    canvas.style.opacity = iAmDrawer ? '1' : '0.85';
    $('word').textContent = m.word || '(ves el dibujo de otro)';
    $('wordBox').style.display = 'block';
    renderOptions(m.options);
    lastCorrect = 0;
    $('progress').textContent = '⭐ Aciertos: 0';
    $('timer').textContent = '';
    $('timer').classList.remove('low');
    $('revealBtn').disabled = false;
    $('status').textContent = iAmDrawer ? 'Ronda en curso · dibujas tú' : 'Ronda en curso · alguien dibuja';
  }
  if (m.type === 'progress') {
    if (m.correct > lastCorrect) { $('progress').classList.remove('bump'); void $('progress').offsetWidth; $('progress').classList.add('bump'); }
    lastCorrect = m.correct;
    $('progress').textContent = '⭐ Aciertos: ' + m.correct + ' / ' + m.total;
  }
  if (m.type === 'guess_event') {
    const t = tally[m.clientId] || (tally[m.clientId] = { alias: m.alias, correct: 0 });
    t.alias = m.alias;
    if (m.correct) t.correct++;
    renderPlayers(playersCache);
  }
  if (m.type === 'tick') showTimer(m.remaining);
  if (m.type === 'reveal') { $('word').textContent = m.word; $('status').textContent = 'Respuesta: ' + m.word; $('timer').textContent = ''; $('timer').classList.remove('low'); }
  if (m.type === 'cleared') { $('wordBox').style.display = 'none'; $('options').innerHTML = ''; $('status').textContent = ''; $('timer').textContent = ''; $('timer').classList.remove('low'); clearCanvas(); }
  if (m.type === 'error') alert(m.msg);
};

let playersCache = [];
function renderPlayers(list) {
  playersCache = list || playersCache;
  $('players').innerHTML = (playersCache.length
    ? playersCache.map(p => {
        const stars = tally[p.clientId] ? tally[p.clientId].correct : 0;
        return `<li>${escapeHtml(p.alias)} ${stars ? '⭐'.repeat(stars) : ''}</li>`;
      })
    : ['<li>(sin jugadores)</li>']).join('');
}
function renderDrawerList(list, current) {
  const sel = $('drawer');
  const keep = current && [...sel.options].some(o => o.value === current) ? current : 'host';
  sel.innerHTML = '<option value="host">Educador</option>' +
    (list || []).map(p => `<option value="${p.clientId}">${escapeHtml(p.alias)}</option>`).join('');
  sel.value = keep;
}

fetch('wordbank.json').then(r => r.json()).then(bank => {
  const sel = $('category');
  Object.entries(bank).forEach(([k, v]) => {
    const o = document.createElement('option');
    o.value = k; o.textContent = v.label; sel.appendChild(o);
  });
});

$('start').onclick = () => ws.send(JSON.stringify({
  type: 'host_start',
  category: $('category').value,
  mode: $('mode').value,
  drawerId: $('drawer').value,
  timerEnabled: $('timerOn').checked,
  timerSeconds: Math.max(10, parseInt($('timerSec').value, 10) || 90)
}));
$('revealBtn').onclick = () => ws.send(JSON.stringify({ type: 'host_reveal' }));
$('nextBtn').onclick = () => ws.send(JSON.stringify({ type: 'host_next' }));

$('exportBtn').onclick = () => {
  const rows = [['Alumno', 'Aciertos']];
  Object.values(tally).forEach(t => rows.push([t.alias, t.correct]));
  const csv = rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'participacion.csv';
  a.click();
};

const canvas = $('board');
const ctx = canvas.getContext('2d');
let drawing = false, last = null, iAmDrawer = true;

function pos(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height };
}
function start(e) { if (!iAmDrawer) return; drawing = true; last = pos(e); e.preventDefault(); }
function move(e) {
  if (!drawing || !iAmDrawer) return;
  const p = pos(e);
  drawLine(last, p);
  ws.send(JSON.stringify({ type: 'draw', from: last, to: p, color: $('color').value, size: +$('size').value }));
  last = p; e.preventDefault();
}
function end() { drawing = false; }
function drawLine(a, b) {
  ctx.strokeStyle = $('color').value; ctx.lineWidth = +$('size').value; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
  ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
  ctx.stroke();
}
function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

canvas.addEventListener('mousedown', start);
canvas.addEventListener('mousemove', move);
window.addEventListener('mouseup', end);
canvas.addEventListener('touchstart', start, { passive: false });
canvas.addEventListener('touchmove', move, { passive: false });
canvas.addEventListener('touchend', end);
$('clearBtn').onclick = () => { clearCanvas(); ws.send(JSON.stringify({ type: 'draw_clear' })); };
