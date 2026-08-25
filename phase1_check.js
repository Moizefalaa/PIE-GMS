const fs = require('fs');
const bank = JSON.parse(fs.readFileSync('src/main/resources/wordbank.json', 'utf8'));

let failed = false;
function ok(msg, cond) { console.log((cond ? 'OK   ' : 'FAIL ') + '- ' + msg); if (!cond) failed = true; }

// 1) Estructura del banco
const keys = Object.keys(bank);
ok('el banco tiene 12 categorias', keys.length === 12);
for (const k of keys) {
  const c = bank[k];
  const w = (c.words || []).length;
  const s = (c.situations || []).length;
  ok(`categoria "${k}" tiene >=4 palabras (${w}) y >=4 situaciones (${s})`, w >= 4 && s >= 4);
}

// 2) Algoritmo de startRound (idéntico al de RoomService.java)
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startRound(bank, key, mode) {
  const cat = bank[key];
  const pool = mode === 'situations' ? cat.situations : cat.words;
  if (!pool || pool.length < 4) return null;
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const distract = shuffle(pool.filter(w => w !== correct)).slice(0, 3);
  const all = shuffle([correct, ...distract]);
  const options = all.map((t, i) => ({ id: i, text: t }));
  const correctId = options.find(o => o.text === correct).id;
  return { category: key, mode, word: correct, options, correctId };
}

let trials = 0;
for (const k of keys) {
  for (const mode of ['words', 'situations']) {
    for (let i = 0; i < 2000; i++) {
      const r = startRound(bank, k, mode);
      trials++;
      const texts = r.options.map(o => o.text);
      const distinct = new Set(texts).size === 4;
      const hasCorrect = r.options.some(o => o.id === r.correctId && o.text === r.word);
      const idOk = r.correctId >= 0 && r.correctId <= 3;
      if (!(r.options.length === 4 && distinct && hasCorrect && idOk)) {
        ok('invariante de ronda (' + k + '/' + mode + ')', false);
        failed = true; break;
      }
    }
  }
}
ok(`todas las rondas cumplen invariables (${trials} intentos)`, trials > 0 && !failed);

console.log(failed ? '\nRESULTADO: FALLO' : '\nRESULTADO: OK');
process.exit(failed ? 1 : 0);
