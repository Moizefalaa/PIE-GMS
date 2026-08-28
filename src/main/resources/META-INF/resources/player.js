const $ = id => document.getElementById(id);
let clientId = localStorage.getItem('pid');
if (!clientId) { clientId = 'c' + Math.random().toString(36).slice(2, 10); localStorage.setItem('pid', clientId); }

let codeVal = null, aliasVal = null, canGuess = false, iAmDrawer = false, reconnectTimer = null;
let currentGame = 'pinturillo';

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
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
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

let telefonoStepType = null;
function onMsg(e) {
  const m = JSON.parse(e.data);
  if (m.type === 'joined') {
    $('join').style.display = 'none';
    $('game').style.display = 'block';
    if (m.reconnected) $('status').textContent = '¡Reconectado!';
  }
  if (m.type === 'error') $('status').textContent = 'Error: ' + m.msg;
  if (m.type === 'game_selected') {
    currentGame = m.game;
    $('telefonoStatus').textContent = currentGame === 'telefono' ? 'Juego: Teléfono Dibujado' : 'Juego: Pinturillo';
    // limpia estado al cambiar de juego
    $('telefonoChainPlayer').style.display = 'none';
    $('telefonoImage').style.display = 'none';
    $('telefonoChainPlayer').innerHTML = '';
  }
  if (m.type === 'round') {
    currentGame = 'pinturillo';
    telefonoStepType = null;
    $('board').style.display = '';
    $('telefonoImage').style.display = 'none';
    $('telefonoChainPlayer').style.display = 'none';
    iAmDrawer = (m.drawerId === clientId);
    canGuess = !iAmDrawer;
    $('reward').style.display = 'none';
    $('timer').textContent = '';
    $('timer').classList.remove('low');
    if (iAmDrawer) {
      $('drawerPanel').style.display = 'block';
      $('telefonoSubmitBtn').style.display = 'none';
      $('wordToDraw').textContent = m.word || '';
      $('options').innerHTML = '';
      $('status').textContent = 'Es tu turno de dibujar. Los demás adivinan.';
    } else {
      $('drawerPanel').style.display = 'none';
      $('telefonoSubmitBtn').style.display = 'none';
      renderOptions(m.options);
      $('feedback').textContent = '';
      $('feedback').className = '';
      $('status').textContent = '¡Adivina! Toca la tarjeta correcta.';
    }
  }
  if (m.type === 'telefono_round') {
    telefonoStepType = m.stepType;
    currentGame = 'telefono';
    $('reward').style.display = 'none';
    $('feedback').textContent = ''; $('feedback').className = '';
    $('timer').textContent = '';
    $('telefonoChainPlayer').style.display = 'none';
    if (m.stepType === 'draw') {
      const isMe = m.drawerId === clientId;
      iAmDrawer = isMe; canGuess = false;
      $('board').style.display = '';
      $('telefonoImage').style.display = 'none';
      clearCanvas();
      if (isMe) {
        $('drawerPanel').style.display = 'block';
        $('telefonoSubmitBtn').style.display = 'block';
        $('telefonoSubmitBtn').disabled = false;
        $('wordToDraw').textContent = m.word || '';
        $('options').innerHTML = '';
        $('status').textContent = `Tu turno de dibujar (${m.stepIndex + 1}/${m.totalSteps}) — ${m.word ? 'dibuja: ' + m.word : ''}`;
      } else {
        $('drawerPanel').style.display = 'none';
        $('telefonoSubmitBtn').style.display = 'none';
        $('wordToDraw').textContent = '';
        $('options').innerHTML = '';
        $('status').textContent = `${escapeHtml(m.alias || 'Alguien')} está dibujando... (${m.stepIndex + 1}/${m.totalSteps})`;
      }
    } else { // guess
      const isMe = m.guesserId === clientId;
      iAmDrawer = false; canGuess = isMe;
      $('board').style.display = 'none';
      $('drawerPanel').style.display = 'none';
      $('telefonoSubmitBtn').style.display = 'none';
      $('telefonoImage').style.display = m.imageData ? 'block' : 'none';
      if (m.imageData) $('telefonoImage').src = m.imageData;
      if (isMe) {
        renderTelefonoOptions(m.options);
        $('status').textContent = `Te toca elegir — ¿qué representa el dibujo? (${m.stepIndex + 1}/${m.totalSteps})`;
      } else {
        $('options').innerHTML = '';
        $('status').textContent = `${escapeHtml(m.alias || 'Alguien')} está eligiendo... (${m.stepIndex + 1}/${m.totalSteps})`;
      }
    }
  }
  if (m.type === 'telefono_chain_reveal') {
    $('board').style.display = 'none';
    $('drawerPanel').style.display = 'none';
    $('telefonoSubmitBtn').style.display = 'none';
    $('telefonoImage').style.display = 'none';
    $('options').innerHTML = '';
    const box = $('telefonoChainPlayer');
    box.style.display = 'block';
    box.innerHTML = '<h3>Cadena completa</h3>' + m.chain.map((s, i) => {
      if (s.type === 'draw') return `<div style="margin:8px 0;padding:8px;background:#f7fafc;border-radius:8px"><b>${i + 1}. ${escapeHtml(s.alias)} dibujó</b> ${s.word ? ' — <i>' + escapeHtml(s.word) + '</i>' : ''}<br>${s.imageData ? `<img src="${s.imageData}" style="max-width:100%;border:1px solid var(--line);border-radius:8px;margin-top:6px">` : '<span style="color:var(--soft)">(sin imagen)</span>'}</div>`;
      else return `<div style="margin:8px 0;padding:8px;background:#ebf8ff;border-radius:8px"><b>${i + 1}. ${escapeHtml(s.alias)} eligió:</b> ${escapeHtml(s.guessText || '')}</div>`;
    }).join('') + (m.initialWord ? `<p style="font-size:13px;color:var(--soft)">Palabra inicial: <b>${escapeHtml(m.initialWord)}</b></p>` : '');
    $('status').textContent = '¡Cadena revelada!';
  }
  if (m.type === 'telefono_progress') { $('telefonoStatus').textContent = `Paso ${m.step}/${m.total}`; }
  if (m.type === 'telefono_waiting_reveal') { $('status').textContent = 'Cadena lista. ¡El educador va a revelar!'; }
  if (m.type === 'telefono_guess_result') { $('feedback').textContent = '¡Elección enviada!'; $('feedback').className = 'ok'; disableOptions(); canGuess = false; }
  if (m.type === 'telefono_cleared') { $('telefonoChainPlayer').style.display = 'none'; $('telefonoChainPlayer').innerHTML = ''; $('telefonoImage').style.display = 'none'; $('board').style.display = ''; clearCanvas(); $('status').textContent = ''; }
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
  if (m.type === 'cleared') { $('wordToDraw').textContent = ''; $('options').innerHTML = ''; $('status').textContent = ''; $('telefonoChainPlayer').style.display = 'none'; $('telefonoImage').style.display = 'none'; $('board').style.display = ''; clearCanvas(); }
  if (m.type === 'tick') {
    $('timer').textContent = '⏱ ' + fmtTime(m.remaining);
    $('timer').classList.toggle('low', m.remaining <= 10);
  }
  if (m.type === 'amedias_round') {
    currentGame = 'amedias'; telefonoStepType = null;
    $('board').style.display = 'none'; $('telefonoImage').style.display = 'none'; $('ritmoBox').style.display = 'none';
    $('drawerPanel').style.display = 'none'; $('telefonoSubmitBtn').style.display = 'none';
    $('amediasPrompt').style.display = 'block'; $('amediasPrompt').textContent = m.prompt;
    $('telefonoChainPlayer').style.display = 'none';
    renderAmediasOptions(m.options);
    $('feedback').textContent = ''; $('feedback').className = '';
    $('status').textContent = 'Elige la mejor respuesta';
    canGuess = true; iAmDrawer = false;
  }
  if (m.type === 'amedias_guess_result') { $('feedback').textContent = '¡Voto registrado!'; $('feedback').className='ok'; disableOptions(); canGuess=false; }
  if (m.type === 'amedias_reveal') {
    $('amediasPrompt').style.display = 'block';
    $('options').innerHTML = m.options.map(o => {
      const cnt = m.tally ? (m.tally[o.id]||0) : 0;
      const isCorrect = o.id === m.correctId;
      return `<div class="card" style="${isCorrect?'border-color:var(--ok);background:#f0fff4':''}">${escapeHtml(o.text)} ${isCorrect?'✓':''} — ${cnt} voto(s)</div>`;
    }).join('');
    $('feedback').textContent = 'Respuesta más serena: ' + m.correctText;
    $('feedback').className = 'ok';
    $('status').textContent = '¡Revelado!';
    canGuess = false;
  }
  if (m.type === 'amedias_cleared') { $('amediasPrompt').style.display='none'; $('options').innerHTML=''; $('feedback').textContent=''; $('status').textContent=''; canGuess=false; }
  if (m.type === 'ritmo_round') {
    currentGame = 'ritmo'; telefonoStepType = null;
    $('board').style.display = 'none'; $('telefonoImage').style.display='none'; $('drawerPanel').style.display='none';
    $('amediasPrompt').style.display='none'; $('options').innerHTML=''; $('telefonoChainPlayer').style.display='none';
    $('ritmoBox').style.display = 'block';
    $('status').textContent = 'Ritmo de Calma — respira con el círculo';
    startRitmoAnimation(m.cycles, m.cycleMs);
  }
  if (m.type === 'ritmo_end') { $('status').textContent='¡Ritmo completado! Muy bien.'; stopRitmoAnimation(); }
  if (m.type === 'ritmo_cleared') { $('ritmoBox').style.display='none'; stopRitmoAnimation(); $('status').textContent=''; }
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
function renderTelefonoOptions(opts) {
  $('options').innerHTML = (opts || []).map(o =>
    `<button class="card" data-id="${o.id}" onclick="guess(${o.id})">${escapeHtml(o.text)}</button>`
  ).join('');
}
function guess(id) {
  if (!canGuess || !ws || ws.readyState !== 1) return;
  if (currentGame === 'telefono' && telefonoStepType === 'guess') {
    ws.send(JSON.stringify({ type: 'telefono_guess', optionId: id }));
  } else if (currentGame === 'amedias') {
    ws.send(JSON.stringify({ type: 'amedias_guess', optionId: id }));
  } else {
    ws.send(JSON.stringify({ type: 'guess', optionId: id }));
  }
}
function renderAmediasOptions(opts) {
  $('options').innerHTML = (opts||[]).map(o=>`<button class="card" data-id="${o.id}" onclick="guess(${o.id})">${escapeHtml(o.text)}</button>`).join('');
}
let ritmoTimer = null, ritmoScale = 1;
function startRitmoAnimation(cycles, cycleMs){
  stopRitmoAnimation();
  const c = $('ritmoCircle');
  let inhaling = true;
  const half = cycleMs/2;
  c.style.transition = `transform ${half}ms ease`;
  function tick(){
    c.style.transform = inhaling ? 'scale(1.45)' : 'scale(1)';
    inhaling = !inhaling;
  }
  tick();
  ritmoTimer = setInterval(tick, half);
}
function stopRitmoAnimation(){
  if (ritmoTimer) clearInterval(ritmoTimer);
  ritmoTimer = null;
  const c=$('ritmoCircle'); if(c) c.style.transform='scale(1)';
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
$('telefonoSubmitBtn').onclick = () => {
  if (!iAmDrawer || currentGame !== 'telefono' || telefonoStepType !== 'draw') return;
  try {
    const data = canvas.toDataURL('image/png');
    ws.send(JSON.stringify({ type: 'telefono_submit_drawing', imageData: data }));
    $('status').textContent = 'Dibujo enviado. Esperando al siguiente...';
    $('telefonoSubmitBtn').disabled = true;
  } catch (e) { $('status').textContent = 'Error al enviar dibujo'; }
};
$('ritmoTapBtn').onclick = () => {
  if (currentGame !== 'ritmo' || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'ritmo_tap' }));
  const c=$('ritmoCircle'); c.style.background='#fbd38d'; setTimeout(()=>c.style.background='#bee3f8', 200);
};
$('ritmoCircle').onclick = () => $('ritmoTapBtn').click();

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
