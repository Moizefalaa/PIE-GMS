const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
const $ = id => document.getElementById(id);
let code = null, lastCorrect = 0, tally = {};
let currentGame = 'pinturillo';

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

function updateGameUI() {
  const isTelefono = currentGame === 'telefono';
  const p = document.getElementById('pinturilloOpts');
  if (p) p.style.display = isTelefono ? 'none' : 'block';
  $('start').textContent = isTelefono ? 'Iniciar Teléfono Dibujado' : 'Iniciar ronda';
  $('revealBtn').textContent = isTelefono ? 'Revelar cadena' : 'Revelar respuesta';
  $('telefonoStatus').textContent = isTelefono ? 'Teléfono: dibujo → elección en cadena' : '';
  $('options').style.display = isTelefono ? 'none' : 'grid';
  const tc = $('telefonoChain'); if (tc && !isTelefono) tc.style.display = 'none';
}
$('game').addEventListener('change', () => {
  currentGame = $('game').value;
  ws.send(JSON.stringify({ type: 'host_select_game', game: currentGame }));
  updateGameUI();
});
updateGameUI();

ws.onopen = () => ws.send(JSON.stringify({ type: 'host_create' }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'room_created') { code = m.code; $('code').textContent = code; }
  if (m.type === 'players') { renderPlayers(m.players); renderDrawerList(m.players, $('drawer').value); }
  if (m.type === 'game_selected') { currentGame = m.game; $('game').value = m.game; updateGameUI(); if (m.game === 'telefono') $('status').textContent = 'Juego: Teléfono Dibujado'; }
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
  if (m.type === 'telefono_round') {
    clearCanvas();
    $('revealBtn').disabled = false;
    $('wordBox').style.display = 'none';
    const tc = $('telefonoChain');
    if (tc) { tc.innerHTML = ''; tc.style.display = 'none'; }
    if (m.stepType === 'draw') {
      const isHostDraw = m.drawerId === 'host';
      iAmDrawer = isHostDraw;
      canvas.style.opacity = isHostDraw ? '1' : '0.85';
      if (isHostDraw && m.word) { $('word').textContent = m.word; $('wordBox').style.display = 'block'; }
      $('status').textContent = `Teléfono · Paso ${m.stepIndex + 1}/${m.totalSteps} · ${escapeHtml(m.alias)} dibuja` + (isHostDraw && m.word ? ': ' + escapeHtml(m.word) : '');
    } else {
      iAmDrawer = false; canvas.style.opacity = '0.85';
      $('status').textContent = `Teléfono · Paso ${m.stepIndex + 1}/${m.totalSteps} · ${escapeHtml(m.alias)} está eligiendo`;
      if (m.imageData) {
        const tc2 = $('telefonoChain');
        tc2.style.display = 'block';
        tc2.innerHTML = `<p style="font-size:13px;color:var(--soft)">Dibujo previo:</p><img src="${m.imageData}" style="max-width:100%;border:1px solid var(--line);border-radius:8px">` +
          (m.options ? `<div class="cards" style="margin-top:8px">${m.options.map(o=>`<div class="card">${escapeHtml(o.text)}</div>`).join('')}</div>` : '');
      }
    }
  }
  if (m.type === 'telefono_chain_reveal') {
    const tc = $('telefonoChain');
    tc.style.display = 'block';
    tc.innerHTML = '<h3>Cadena completa</h3>' + m.chain.map((s, i) => {
      if (s.type === 'draw') return `<div style="margin:8px 0;padding:8px;background:#f7fafc;border-radius:8px"><b>${i + 1}. ${escapeHtml(s.alias)} dibujó</b> ${s.word ? ' — <i>' + escapeHtml(s.word) + '</i>' : ''}<br>${s.imageData ? `<img src="${s.imageData}" style="max-width:100%;border:1px solid var(--line);border-radius:8px;margin-top:6px">` : '<span style="color:var(--soft)">(sin imagen)</span>'}</div>`;
      else return `<div style="margin:8px 0;padding:8px;background:#ebf8ff;border-radius:8px"><b>${i + 1}. ${escapeHtml(s.alias)} eligió:</b> ${escapeHtml(s.guessText || '')}</div>`;
    }).join('') + (m.initialWord ? `<p style="font-size:13px;color:var(--soft)">Palabra inicial: <b>${escapeHtml(m.initialWord)}</b></p>` : '');
    $('status').textContent = '¡Cadena revelada!';
    $('revealBtn').disabled = true;
  }
  if (m.type === 'telefono_progress') { $('progress').textContent = `Paso ${m.step}/${m.total}`; }
  if (m.type === 'telefono_waiting_reveal') { $('status').textContent = 'Cadena lista. Pulsa Revelar cadena.'; $('revealBtn').disabled = false; }
  if (m.type === 'telefono_cleared') { const tc = $('telefonoChain'); if (tc) { tc.innerHTML = ''; tc.style.display = 'none'; } $('wordBox').style.display = 'none'; $('status').textContent = ''; $('revealBtn').disabled = true; clearCanvas(); }
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

$('start').onclick = () => {
  if (currentGame === 'telefono') {
    ws.send(JSON.stringify({
      type: 'telefono_start',
      category: $('category').value,
      mode: $('mode').value
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'host_start',
      category: $('category').value,
      mode: $('mode').value,
      drawerId: $('drawer').value,
      timerEnabled: $('timerOn').checked,
      timerSeconds: Math.max(10, parseInt($('timerSec').value, 10) || 90)
    }));
  }
};
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
