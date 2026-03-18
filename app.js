// app.js — main application logic

// ── Storage helpers ───────────────────────────────────────────────
const Store = {
  get(k, def) { try { const v=localStorage.getItem(k); return v!==null?JSON.parse(v):def; } catch(e){return def;} },
  set(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};

// ── Settings ──────────────────────────────────────────────────────
let settings = Store.get('settings', { lang:'de', sound:true, speech:true, timer:0, dark:false });

// ── Dark mode ─────────────────────────────────────────────────────
function applyDarkMode(on) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
}
applyDarkMode(settings.dark);

// ── Profiles ──────────────────────────────────────────────────────
function loadProfiles() { return Store.get('profiles', []); }
function saveProfiles(p) { Store.set('profiles', p); }

const EMOJIS = ['🧒','👦','👧','🧑','🌟','🚀','🦁','🐯','🐸','🦊','🦋','🎮'];

let profiles = loadProfiles();
let currentProfile = null;
let currentProfileIdx = -1;

// ── Game state ────────────────────────────────────────────────────
let G = {
  mode: 0, diff: 2,
  tH: 3, tM: 0,
  uH: 6, uM: 0,
  answered: false,
  dragging: null,
  wordAnswer: [], wordBank: [],
  timerInterval: null,
  timerRemaining: 0,
  dailyDone: 0,
  dailyTotal: 5
};

// ── Learning path ─────────────────────────────────────────────────
const PATH_THRESHOLDS = [0, 3, 8, 15, 25, 40, 60, 85, 120];
function getPathStep(totalAll) {
  let step = 0;
  for (let i = 0; i < PATH_THRESHOLDS.length; i++) { if (totalAll >= PATH_THRESHOLDS[i]) step = i; }
  return Math.min(step, PATH_THRESHOLDS.length - 1);
}

// ── Adaptive learning (per language) ─────────────────────────────
function getLangWeights() {
  if (!currentProfile) return {};
  const lw = currentProfile.langWeights = currentProfile.langWeights || {};
  if (!lw[settings.lang]) lw[settings.lang] = {};
  return lw[settings.lang];
}

function recordAttempt(h, m, correct) {
  if (!currentProfile) return;
  const key = `${h}:${m}`;
  const w = getLangWeights();
  if (!w[key]) w[key] = { attempts: 0, wrong: 0 };
  w[key].attempts++;
  if (!correct) w[key].wrong++;
  // Also update global weights for path/badge tracking
  const gw = currentProfile.weights = currentProfile.weights || {};
  if (!gw[key]) gw[key] = { attempts: 0, wrong: 0 };
  gw[key].attempts++;
  if (!correct) gw[key].wrong++;
}

function randTime(diff) {
  const mins = DIFFS[diff].minutes;
  const w = getLangWeights();
  if (w && Object.keys(w).length > 0) {
    const pool = [];
    for (let h = 0; h <= 23; h++) {
      for (const m of mins) {
        const key = `${h}:${m}`;
        const weight = w[key] ? Math.max(1, w[key].wrong * 2 + 1) : 1;
        for (let i = 0; i < weight; i++) pool.push({h, m});
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return { h: Math.floor(Math.random()*24), m: mins[Math.floor(Math.random()*mins.length)] };
}

// ── Mode stats helpers ────────────────────────────────────────────
function getModeStats(lang, mode) {
  if (!currentProfile) return { total:0, correct:0 };
  const ms = currentProfile.modeStats = currentProfile.modeStats || {};
  const key = `${lang}_${mode}`;
  if (!ms[key]) ms[key] = { total:0, correct:0 };
  return ms[key];
}

// ── Language stats helpers ────────────────────────────────────────
function getLangStats(lang) {
  if (!currentProfile) return { total:0, correct:0, streak:0, bestStreak:0 };
  const ls = currentProfile.langStats = currentProfile.langStats || {};
  if (!ls[lang]) ls[lang] = { total:0, correct:0, streak:0, bestStreak:0 };
  return ls[lang];
}

function getLangSession(lang) {
  if (!currentProfile) return { correct:0, total:0, streak:0 };
  const ls = currentProfile.langSession = currentProfile.langSession || {};
  if (!ls[lang]) ls[lang] = { correct:0, total:0, streak:0 };
  return ls[lang];
}

function wrongAnswers(h, m, lang, diff) {
  const pool = [];
  const mins = DIFFS[diff].minutes;
  const correct = fmtTime(h, m, lang);
  for (let dh = -3; dh <= 3; dh++) {
    for (const dm of mins) {
      if (dh===0 && dm===m) continue;
      const wh = (h + dh + 24) % 24;
      const txt = fmtTime(wh, dm, lang);
      if (txt !== correct) pool.push(txt);
    }
  }
  return [...new Set(pool)].sort(()=>Math.random()-.5).slice(0, 3);
}

// ── Speech-safe time string (removes ambiguity for TTS) ───────────
function fmtTimeSpeak(h, m, lang) {
  const t = fmtTime(h, m, lang);
  // For German: TTS sometimes adds "Uhr" after "halb X" or "Viertel X"
  // We keep fmtTime output as-is — it's already correct.
  // But for the correction phrase, wrap non-full-hour DE times to avoid TTS artifact
  if (lang === 'de' && m !== 0) {
    // Remove any trailing " Uhr" that might have crept in
    return t.replace(/\s+Uhr\s*$/, '');
  }
  return t;
}
function wrongExplanation(h, m, uH, uM, lang) {
  const h12v = h % 12 === 0 ? 12 : h % 12;
  const uH12v = uH % 12 === 0 ? 12 : uH % 12;
  const hDisp = lang === 'de' ? (NUM_DE[h]||h) : lang === 'it' ? (NUM_IT[h]||h) : lang === 'en' ? (NUM_EN[h12v]||h) : h;
  const uHDisp = lang === 'de' ? (NUM_DE[uH]||uH) : lang === 'it' ? (NUM_IT[uH]||uH) : lang === 'en' ? (NUM_EN[uH12v]||uH) : uH;
  if (lang === 'de') {
    if (uH%12 !== h%12 && uM !== m) return `Der kurze Zeiger zeigt auf ${hDisp}, der lange auf ${m} Min.`;
    if (uH%12 !== h%12) return `Der kurze Zeiger (Stunden) zeigt auf ${hDisp}, nicht auf ${uHDisp}.`;
    if (uM !== m) return `Der lange Zeiger (Minuten) zeigt auf ${m} Min., nicht auf ${uM} Min.`;
  }
  if (lang === 'it') {
    if (uH%12 !== h%12 && uM !== m) return `La lancetta corta indica ${hDisp}, quella lunga ${m} min.`;
    if (uH%12 !== h%12) return `La lancetta corta (ore) indica ${hDisp}, non ${uHDisp}.`;
    if (uM !== m) return `La lancetta lunga (minuti) indica ${m} min., non ${uM} min.`;
  }
  if (lang === 'en') {
    if (uH%12 !== h%12 && uM !== m) return `Short hand → ${hDisp}, long hand → ${m} min.`;
    if (uH%12 !== h%12) return `Short hand (hours) points to ${hDisp}, not ${uHDisp}.`;
    if (uM !== m) return `Long hand (minutes) points to ${m} min., not ${uM} min.`;
  }
  if (lang === 'ja') {
    if (uH%12 !== h%12) return `短い針は${h}を指します（${uH}ではありません）。`;
    if (uM !== m) return `長い針は${m}分を指します（${uM}分ではありません）。`;
  }
  return LANGS[lang].fb.wrong;
}

// ── Sliders for set mode (touch-friendly alternative) ─────────────
function buildSliders(L, diff, onUpdate) {
  const wrap = document.createElement('div');
  wrap.id = 'sliders-wrap';
  wrap.style.cssText = 'margin-bottom:.875rem;display:flex;flex-direction:column;gap:10px;';

  const mins = DIFFS[diff].minutes;

  function makeSlider(labelTxt, min, max, val, step, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-size:12px;color:var(--muted);min-width:56px;font-weight:500;';
    lbl.textContent = labelTxt;
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = min; slider.max = max; slider.value = val; slider.step = step;
    slider.style.cssText = 'flex:1;';
    const valLbl = document.createElement('span');
    valLbl.style.cssText = 'font-size:14px;font-weight:700;color:var(--primary);min-width:28px;text-align:right;';
    valLbl.textContent = val;
    slider.oninput = ()=>{ valLbl.textContent = slider.value; onChange(parseInt(slider.value)); };
    // Prevent drag from reaching clock SVG
    slider.ontouchstart = (e)=>e.stopPropagation();
    row.appendChild(lbl); row.appendChild(slider); row.appendChild(valLbl);
    return { row, slider, valLbl };
  }

  const hSlider = makeSlider(L.sliderHours, 0, 23, G.uH, 1, (v)=>{
    G.uH = v;
    Clock.draw(document.getElementById('clock-svg'), G.uH, G.uM, true, null);
    Audio.play('drag');
  });
  const mSlider = makeSlider(L.sliderMinutes, 0, 55, G.uM, mins.length > 2 ? 5 : 30, (v)=>{
    // Snap to nearest valid minute
    let best = mins[0], bd = 999;
    for (const m of mins) { const d = Math.abs(v-m); if(d<bd){bd=d;best=m;} }
    G.uM = best;
    mSlider.slider.value = best;
    mSlider.valLbl.textContent = best;
    Clock.draw(document.getElementById('clock-svg'), G.uH, G.uM, true, null);
    Audio.play('drag');
  });

  wrap.appendChild(hSlider.row);
  wrap.appendChild(mSlider.row);
  return wrap;
}

function insertSliders(L, diff) {
  // Remove old sliders if any
  const old = document.getElementById('sliders-wrap');
  if (old) old.remove();
  const fb = document.getElementById('feedback');
  const sliders = buildSliders(L, diff, ()=>{});
  fb.parentNode.insertBefore(sliders, fb);
}

// ── Speech helper: ensure German ends with "Uhr" ─────────────────
function withUhr(timeStr, lang) {
  if (lang !== 'de') return timeStr;
  return timeStr.endsWith(' Uhr') ? timeStr : timeStr + ' Uhr';
}

// ── Number exercise ───────────────────────────────────────────────
let numExerciseCounter = 0; // counts clock tasks since last number popup

const BALANCE_MAX = 10; // max times a mode can be done before it's locked

function getBalanceStats() {
  if (!currentProfile) return {};
  currentProfile.balance = currentProfile.balance || { counts: [0,0,0,0,0], round: 1 };
  return currentProfile.balance;
}

function isModeLocked(modeIdx) {
  const b = getBalanceStats();
  return b.counts[modeIdx] >= BALANCE_MAX;
}

function recordModePlay(modeIdx) {
  const b = getBalanceStats();
  b.counts[modeIdx] = (b.counts[modeIdx]||0) + 1;
  // Check if all modes reached BALANCE_MAX → reset
  if (b.counts.every(c => c >= BALANCE_MAX)) {
    b.counts = [0,0,0,0,0];
    b.round = (b.round||1) + 1;
    showBalanceResetToast();
  }
  saveCurrentProfile();
}

function showBalanceResetToast() {
  const toast = document.getElementById('badge-toast');
  const L = LANGS[settings.lang];
  const msgs = {
    de: '🎉 Runde abgeschlossen! Alle Übungen frei.',
    it: '🎉 Round completato! Tutti gli esercizi disponibili.',
    en: '🎉 Round complete! All exercises unlocked.',
    ja: '🎉 ラウンド完了！全ての練習が解放されました。'
  };
  toast.textContent = msgs[settings.lang]||msgs.de;
  toast.style.background = 'var(--success)';
  toast.style.display = 'block';
  Audio.play('correct');
  launchConfetti();
  setTimeout(()=>{ toast.style.display='none'; toast.style.background=''; }, 3500);
}

function getNumStats() {
  if (!currentProfile) return { total:0, correct:0, perNum:{} };
  currentProfile.numStats = currentProfile.numStats || { total:0, correct:0, perNum:{} };
  return currentProfile.numStats;
}

function randNum() {
  // Adaptive: weight numbers that were wrong more often
  const ns = getNumStats();
  const pool = [];
  for (const n of NUM_POOL) {
    const s = ns.perNum[n];
    const weight = s ? Math.max(1, (s.failed||0)*2 + 1) : 1;
    for (let i=0; i<weight; i++) pool.push(n);
  }
  return pool[Math.floor(Math.random()*pool.length)];
}

function showNumPopup(countInBalance = false) {
  const L = LANGS[settings.lang];
  const n = randNum();
  const correct = (NUM_WORDS[settings.lang]||NUM_WORDS.de)[n].toLowerCase().replace(/ß/g, 'ss');
  const overlay = document.getElementById('num-popup-overlay');
  const fb = document.getElementById('num-popup-feedback');
  const inp = document.getElementById('num-popup-input');
  const btns = document.getElementById('num-popup-btns');

  document.getElementById('num-popup-title').textContent = L.numPopupTitle;
  document.getElementById('num-popup-sub').textContent = L.numPopupSub;
  document.getElementById('num-popup-number').textContent = n;
  inp.value = ''; inp.disabled = false; inp.placeholder = L.numPlaceholder;
  inp.style.borderColor = 'var(--border)';
  fb.className = 'fb-neutral'; fb.textContent = '';
  btns.innerHTML = '';
  // Don't touch G.answered here — it belongs to the clock task behind the popup
  // We reset it only when the popup closes (so the clock task remains resumable)
  overlay.classList.remove('hidden');

  const MAX_TRIES = 3;
  let attempt = 0;    // how many attempts used so far
  let firstTry = true; // is this the first attempt?

  // Init stats for this number
  const ns = getNumStats();
  ns.total = (ns.total||0) + 1;
  if (!ns.perNum[n]) ns.perNum[n] = { total:0, correct1:0, correct2:0, correct3:0, failed:0 };
  ns.perNum[n].total++;

  const retryMessages = {
    de: ['Noch nicht ganz — schreib es nochmal!', 'Fast! Ein letzter Versuch.'],
    it: ['Non ancora — riscrivilo!', 'Quasi! Un ultimo tentativo.'],
    en: ['Not quite — write it again!', 'Almost! One last try.'],
    ja: ['もう少し — もう一度書いてみて！', 'あと少し！最後の挑戦。']
  };

  function buildCheckBtn() {
    btns.innerHTML = '';
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn'; skipBtn.textContent = '×';
    skipBtn.title = 'Überspringen';
    skipBtn.onclick = ()=>{ overlay.classList.add('hidden'); G.answered = false; renderNumStats(); };
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-primary'; checkBtn.textContent = L.check;
    checkBtn.style.flex = '1';
    checkBtn.onclick = checkAnswer;
    inp.onkeydown = (e)=>{ if(e.key==='Enter') checkAnswer(); };
    btns.appendChild(skipBtn);
    btns.appendChild(checkBtn);
  }

  function buildNextBtn() {
    btns.innerHTML = '';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary'; nextBtn.textContent = L.next;
    nextBtn.style.flex = '1';
    nextBtn.onclick = ()=>{ overlay.classList.add('hidden'); G.answered = false; renderNumStats(); };
    btns.appendChild(nextBtn);
  }

  function checkAnswer() {
    const val = normalizeInput(inp.value);
    if (!val) { inp.focus(); return; }
    attempt++;
    Audio.play('tick');

    if (val === correct) {
      // Correct!
      Audio.play('correct');
      if (firstTry) {
        ns.correct = (ns.correct||0) + 1;
        ns.perNum[n][`correct${attempt}`]++;
      } else {
        // Correct on retry — count as retry success
        ns.perNum[n][`correct${attempt}`]++;
      }
      fb.className = 'fb-success';
      fb.textContent = L.fb.correct + (attempt > 1 ? ` (${attempt}. Versuch)` : '');
      Audio.speak(correct, settings.lang);
      saveCurrentProfile(); renderNumStats();
      inp.disabled = true;
      buildNextBtn();
    } else {
      // Wrong
      Audio.play('wrong');
      if (attempt >= MAX_TRIES) {
        // Out of tries
        ns.perNum[n].failed++;
        const phrases = {
          de: `Nicht geschafft. Die richtige Antwort ist: ${correct}`,
          it: `Non ce l'hai fatta. La risposta corretta è: ${correct}`,
          en: `Not managed. The correct answer is: ${correct}`,
          ja: `残念。正しい答えは：${correct}`
        };
        fb.className = 'fb-error'; fb.textContent = phrases[settings.lang]||phrases.de;
        Audio.speak(phrases[settings.lang]||phrases.de, settings.lang);
        saveCurrentProfile(); renderNumStats();
        inp.disabled = true;
        buildNextBtn();
      } else {
        // Still tries left — show correct answer, ask to retype
        firstTry = false;
        const msgs = retryMessages[settings.lang]||retryMessages.de;
        const attemptsLeft = MAX_TRIES - attempt;
        fb.className = 'fb-error';
        fb.textContent = msgs[attempt-1] || msgs[msgs.length-1];
        // Show correct answer in subtitle as hint
        document.getElementById('num-popup-sub').textContent =
          `✏️ ${correct} — ${attemptsLeft === 1 ?
            {de:'noch 1 Versuch',it:'ancora 1 tentativo',en:'1 try left',ja:'あと1回'}[settings.lang]||'1 try left' :
            {de:`noch ${attemptsLeft} Versuche`,it:`ancora ${attemptsLeft} tentativi`,en:`${attemptsLeft} tries left`,ja:`あと${attemptsLeft}回`}[settings.lang]||`${attemptsLeft} tries left`
          }`;
        inp.value = ''; inp.focus();
        buildCheckBtn();
      }
    }
  }

  buildCheckBtn();
  setTimeout(()=>inp.focus(), 100);
}

function renderNumStats() {
  const L = LANGS[settings.lang];
  const ns = getNumStats();
  const sec = document.getElementById('num-stats-section');
  const grid = document.getElementById('num-stats-grid');
  const totalEl = document.getElementById('num-stats-total');
  const lbl = document.getElementById('lbl-num-stats');

  if (ns.total === 0) { sec.style.display='none'; return; }
  sec.style.display = 'block';
  lbl.textContent = L.numStatsTitle;

  const c1 = Object.values(ns.perNum||{}).reduce((s,v)=>s+(v.correct1||0),0);
  const c2 = Object.values(ns.perNum||{}).reduce((s,v)=>s+(v.correct2||0),0);
  const c3 = Object.values(ns.perNum||{}).reduce((s,v)=>s+(v.correct3||0),0);
  const fail = Object.values(ns.perNum||{}).reduce((s,v)=>s+(v.failed||0),0);
  totalEl.innerHTML = `${L.numStatsTotal}: ${ns.total} &nbsp;|&nbsp; 🟢 ${c1} &nbsp; 🟡 ${c2} &nbsp; 🟠 ${c3} &nbsp; 🔴 ${fail}`;

  grid.innerHTML = '';
  for (const n of NUM_POOL) {
    const s = ns.perNum[n] || { total:0 };
    const c1n = s.correct1||0, c2n = s.correct2||0, c3n = s.correct3||0, fn = s.failed||0;
    const tried = s.total || 0;
    let dot = '—', bg = 'var(--surface)';
    if (tried > 0) {
      if (c1n > 0) { dot = '🟢'; bg = 'var(--success-light)'; }
      else if (c2n > 0 || c3n > 0) { dot = '🟡'; bg = 'var(--warm-light)'; }
      else { dot = '🔴'; bg = 'var(--danger-light)'; }
    }
    const cell = document.createElement('div');
    cell.className = 'num-stat-cell';
    cell.id = `num-cell-${n}`;
    cell.style.cssText = `background:${bg};cursor:pointer;transition:transform .1s,box-shadow .1s;`;
    cell.innerHTML = `<div class="num-stat-n">${n}</div>
      <div class="num-stat-s">${tried>0?tried+'×':''} ${dot}</div>`;
    cell.title = tried > 0 ? `${n}: ${tried}× — 🟢${c1n} 🟡${c2n} 🟠${c3n} 🔴${fn}` : `${n}: noch nicht geübt — klicken zum Üben`;
    cell.onmouseenter = ()=>{ cell.style.transform='scale(1.08)'; cell.style.boxShadow='0 2px 8px rgba(0,0,0,.12)'; };
    cell.onmouseleave = ()=>{ cell.style.transform=''; cell.style.boxShadow=''; };
    cell.onclick = ()=>showNumPopupForN(n);
    grid.appendChild(cell);
  }
}

// Show number popup for a specific number (from stats click — no balance counting)
function showNumPopupForN(n) {
  const L = LANGS[settings.lang];
  const correct = (NUM_WORDS[settings.lang]||NUM_WORDS.de)[n].toLowerCase().replace(/ß/g, 'ss');
  const overlay = document.getElementById('num-popup-overlay');
  const fb = document.getElementById('num-popup-feedback');
  const inp = document.getElementById('num-popup-input');
  const btns = document.getElementById('num-popup-btns');

  document.getElementById('num-popup-title').textContent = L.numTask(n).replace('?','! 🎯');
  document.getElementById('num-popup-sub').textContent = L.numSub();
  document.getElementById('num-popup-number').textContent = n;
  inp.value = ''; inp.disabled = false; inp.placeholder = L.numPlaceholder;
  fb.className = 'fb-neutral'; fb.textContent = '';
  btns.innerHTML = '';
  overlay.classList.remove('hidden');

  const MAX_TRIES = 3;
  let attempt = 0;
  const ns = getNumStats();
  if (!ns.perNum[n]) ns.perNum[n] = { total:0, correct1:0, correct2:0, correct3:0, failed:0 };
  ns.total = (ns.total||0) + 1;
  ns.perNum[n].total++;
  let statsRecorded = false;

  function updateCell(ok) {
    const cell = document.getElementById(`num-cell-${n}`);
    if (!cell) return;
    const s = ns.perNum[n] || {};
    const c1n = s.correct1||0, c2n = s.correct2||0, c3n = s.correct3||0;
    let bg, dot;
    if (c1n > 0) { bg = 'var(--success-light)'; dot = '🟢'; }
    else if (c2n > 0 || c3n > 0) { bg = 'var(--warm-light)'; dot = '🟡'; }
    else { bg = 'var(--danger-light)'; dot = '🔴'; }
    cell.style.background = bg;
    cell.querySelector('.num-stat-s').textContent = `${s.total||0}× ${dot}`;
  }

  function buildCheckBtn() {
    btns.innerHTML = '';
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn'; skipBtn.textContent = '×';
    skipBtn.title = 'Überspringen';
    skipBtn.onclick = ()=>{ overlay.classList.add('hidden'); G.answered = false; renderNumStats(); };
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn btn-primary'; checkBtn.textContent = L.check;
    checkBtn.style.flex = '1';
    checkBtn.onclick = checkAnswer;
    inp.onkeydown = (e)=>{ if(e.key==='Enter') checkAnswer(); };
    btns.appendChild(skipBtn);
    btns.appendChild(checkBtn);
  }

  function buildCloseBtn() {
    btns.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-primary'; closeBtn.textContent = L.next;
    closeBtn.style.flex = '1';
    closeBtn.onclick = ()=>{ overlay.classList.add('hidden'); G.answered = false; renderNumStats(); };
    btns.appendChild(closeBtn);
  }

  function checkAnswer() {
    const val = normalizeInput(inp.value);
    if (!val) { inp.focus(); return; }
    attempt++;
    Audio.play('tick');
    const ok = val === correct;

    if (ok) {
      if (!statsRecorded) {
        statsRecorded = true;
        ns.perNum[n][`correct${Math.min(attempt,3)}`]++;
        if (attempt === 1) ns.correct = (ns.correct||0) + 1;
      }
      Audio.play('correct');
      fb.className = 'fb-success';
      fb.textContent = L.fb.correct + (attempt > 1 ? ` (${attempt}. Versuch)` : '');
      Audio.speak(correct, settings.lang);
      inp.disabled = true;
      updateCell(true);
      saveCurrentProfile();
      buildCloseBtn();
    } else {
      Audio.play('wrong');
      if (attempt >= MAX_TRIES) {
        if (!statsRecorded) { statsRecorded = true; ns.perNum[n].failed++; }
        const phrases={de:`Nicht geschafft. Richtig: ${correct}`,it:`Non ce l'hai fatta. Corretto: ${correct}`,en:`Not managed. Correct: ${correct}`,ja:`残念。正解：${correct}`};
        fb.className='fb-error'; fb.textContent = phrases[settings.lang]||phrases.de;
        Audio.speak(phrases[settings.lang]||phrases.de, settings.lang);
        inp.disabled = true;
        updateCell(false);
        saveCurrentProfile();
        buildCloseBtn();
      } else {
        const left = MAX_TRIES - attempt;
        const msgs={de:['Noch nicht — versuch es nochmal!','Fast! Ein letzter Versuch.'],it:['Non ancora — riprova!','Quasi! Un ultimo tentativo.'],en:['Not quite — try again!','Almost! One last try.'],ja:['もう少し！','最後の挑戦！']};
        fb.className='fb-error'; fb.textContent = (msgs[settings.lang]||msgs.de)[attempt-1];
        document.getElementById('num-popup-sub').textContent = `✏️ ${correct} — ${
          {de:`noch ${left} Versuch${left===1?'':'e'}`,it:`ancora ${left} tentativ${left===1?'o':'i'}`,en:`${left} tr${left===1?'y':'ies'} left`,ja:`あと${left}回`}[settings.lang]||`${left} left`}`;
        inp.value=''; inp.focus();
        buildCheckBtn();
      }
    }
  }

  buildCheckBtn();
  setTimeout(()=>inp.focus(), 100);
}
function launchConfetti() {
  const cel = document.getElementById('celebrate');
  cel.style.display = 'block'; cel.innerHTML = '';
  const cols = ['#2563eb','#16a34a','#f59e0b','#dc2626','#7c3aed','#0891b2'];
  for (let i = 0; i < 42; i++) {
    const c = document.createElement('div'); c.className = 'confetti';
    c.style.left = Math.random()*100+'%'; c.style.top = '-10px';
    c.style.background = cols[Math.floor(Math.random()*cols.length)];
    c.style.animationDelay = Math.random()*.5+'s';
    c.style.animationDuration = (.7+Math.random()*.6)+'s';
    c.style.width = (8+Math.random()*8)+'px'; c.style.height = (8+Math.random()*8)+'px';
    cel.appendChild(c);
  }
  setTimeout(()=>{ cel.style.display='none'; cel.innerHTML=''; }, 1500);
}

// ── Badge toast ───────────────────────────────────────────────────
function showBadgeToast(badges, lang) {
  const toast = document.getElementById('badge-toast');
  const b = badges[0];
  toast.textContent = b.icon + ' ' + Badges.getLabel(b, lang) + '!';
  toast.style.display = 'block';
  Audio.play('badge');
  setTimeout(()=>{ toast.style.display='none'; }, 3000);
}

// ── Task transition ───────────────────────────────────────────────
function animateTransition(cb) {
  const card = document.getElementById('task-card');
  card.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
  card.style.opacity = '0';
  card.style.transform = 'translateY(6px)';
  setTimeout(()=>{
    cb();
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }, 180);
}

// ── Profile save ──────────────────────────────────────────────────
function saveCurrentProfile() {
  if (currentProfileIdx < 0) return;
  profiles[currentProfileIdx] = currentProfile;
  saveProfiles(profiles);
}

// ── Daily task ────────────────────────────────────────────────────
function checkDaily() {
  if (!currentProfile) return;
  const today = new Date().toDateString();
  if (!currentProfile.stats.lastDay) currentProfile.stats.lastDay = '';
  if (currentProfile.stats.lastDay !== today) {
    const yesterday = new Date(Date.now()-86400000).toDateString();
    currentProfile.stats.dailyStreak = currentProfile.stats.lastDay === yesterday ? (currentProfile.stats.dailyStreak||0)+1 : 1;
    currentProfile.stats.lastDay = today;
    currentProfile.dailyDone = 0;
    saveCurrentProfile();
  }
  G.dailyDone = currentProfile.dailyDone || 0;
  renderDailyBanner();
}

function renderDailyBanner() {
  const L = LANGS[settings.lang];
  const banner = document.getElementById('daily-banner');
  const done = G.dailyDone, total = G.dailyTotal;
  if (done >= total) { banner.style.display='none'; return; }
  banner.style.display = 'flex';
  document.getElementById('daily-text').textContent = L.dailyText + ' ' + done + '/' + total;
  const dots = document.getElementById('daily-dots'); dots.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'daily-dot' + (i < done ? ' done' : '');
    dots.appendChild(d);
  }
}

// ── Timer ─────────────────────────────────────────────────────────
function startTimer() {
  if (settings.timer === 0) return;
  clearInterval(G.timerInterval);
  G.timerRemaining = settings.timer;
  const wrap = document.getElementById('timer-bar-wrap');
  const bar = document.getElementById('timer-bar');
  wrap.style.display = 'block'; bar.style.width = '100%'; bar.classList.remove('urgent');
  G.timerInterval = setInterval(()=>{
    G.timerRemaining -= 0.1;
    const pct = Math.max(0, (G.timerRemaining / settings.timer) * 100);
    bar.style.width = pct + '%';
    if (G.timerRemaining <= settings.timer * 0.3) bar.classList.add('urgent');
    if (G.timerRemaining <= 0) { clearInterval(G.timerInterval); if (!G.answered) timeOut(); }
  }, 100);
}

function stopTimer() {
  clearInterval(G.timerInterval);
  document.getElementById('timer-bar-wrap').style.display = 'none';
}

function timeOut() {
  const L = LANGS[settings.lang];
  G.answered = true; G.timerInterval = null;
  Audio.play('wrong');
  const ls = getLangStats(settings.lang);
  const sess = getLangSession(settings.lang);
  currentProfile.stats.bestStreak = Math.max(currentProfile.stats.bestStreak||0, ls.streak||0);
  ls.streak = 0; sess.streak = 0;
  currentProfile.stats.totalAll = (currentProfile.stats.totalAll||0) + 1;
  ls.total = (ls.total||0) + 1; sess.total = (sess.total||0) + 1;
  const fb = document.getElementById('feedback');
  fb.className = 'fb-error';
  fb.textContent = '⏱ ' + fmtTime(G.tH, G.tM, settings.lang);
  saveCurrentProfile(); renderScores();
  const btnRow = document.getElementById('btn-row'); btnRow.innerHTML = '';
  addNextBtn(btnRow, L);
}

// ── Screens ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
}

// ── Profile Screen ────────────────────────────────────────────────
function renderProfileScreen() {
  const L = LANGS[settings.lang];
  document.getElementById('ph-title').textContent = L.whoPlays;
  document.getElementById('btn-add-profile').textContent = '+ ' + L.newProfile;
  renderProfileList();
  renderLangBarProfile();
  renderHighscore();
  // About section on profile page
  let aboutProfile = document.getElementById('about-profile');
  if (!aboutProfile) {
    aboutProfile = document.createElement('div');
    aboutProfile.id = 'about-profile';
    aboutProfile.style.cssText = 'margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border);';
    document.querySelector('.profile-wrap').appendChild(aboutProfile);
  }
  aboutProfile.innerHTML = '';
  const Lp = LANGS[settings.lang];
  const aboutTitleEl = document.createElement('div');
  aboutTitleEl.style.cssText = 'font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.75rem;';
  aboutTitleEl.textContent = Lp.aboutTitle;
  const aboutTextEl = document.createElement('p');
  aboutTextEl.style.cssText = 'font-size:12px;color:var(--muted);line-height:1.7;white-space:pre-line;';
  aboutTextEl.textContent = Lp.aboutText;
  aboutProfile.appendChild(aboutTitleEl);
  aboutProfile.appendChild(aboutTextEl);
}

function renderLangBarProfile() {
  const lb = document.getElementById('lang-bar-profile'); lb.innerHTML = '';
  Object.entries(LANGS).forEach(([k, L])=>{
    const b = document.createElement('button'); b.className = 'lang-btn'+(k===settings.lang?' active':'');
    b.textContent = L.flag+' '+L.name;
    b.onclick = ()=>{ Audio.play('tick'); settings.lang=k; Store.set('settings',settings); renderProfileScreen(); };
    lb.appendChild(b);
  });
}

function renderHighscore() {
  let hs = document.getElementById('highscore-box');
  if (!hs) {
    hs = document.createElement('div'); hs.id = 'highscore-box';
    hs.style.cssText = 'margin-top:1.25rem;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem;';
    document.querySelector('.profile-wrap').appendChild(hs);
  }
  const L = LANGS[settings.lang];
  if (profiles.length < 2) { hs.style.display='none'; return; }
  hs.style.display = 'block';
  // Sort by correct answers in current language
  const sorted = [...profiles].sort((a,b)=>{
    const aS = (a.langStats && a.langStats[settings.lang]) || {};
    const bS = (b.langStats && b.langStats[settings.lang]) || {};
    return (bS.correct||0) - (aS.correct||0);
  });
  hs.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.75rem;">🏆 ${L.highscoreTitle||'Highscore'} — ${LANGS[settings.lang].flag}</div>`;
  sorted.forEach((p, i)=>{
    const ls = (p.langStats && p.langStats[settings.lang]) || { correct:0, total:0, bestStreak:0 };
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);';
    if (i === sorted.length-1) row.style.borderBottom = 'none';
    const medal = ['🥇','🥈','🥉'][i] || `${i+1}.`;
    row.innerHTML = `<span style="font-size:18px;width:28px;text-align:center">${medal}</span>
      <span style="font-size:20px">${p.emoji||'🧒'}</span>
      <span style="flex:1;font-weight:600;font-size:14px;color:var(--text)">${p.name}</span>
      <span style="font-size:13px;color:var(--muted)">🔥${ls.bestStreak||0} &nbsp;✓${ls.correct||0}/${ls.total||0}</span>`;
    hs.appendChild(row);
  });
}

function renderProfileList() {
  const list = document.getElementById('profile-list');
  [...list.children].forEach(c=>{ if(!c.classList.contains('new-profile-form')) c.remove(); });
  profiles.forEach((p, i)=>{
    const card = document.createElement('div'); card.className = 'profile-card';
    card.style.flexDirection = 'column'; card.style.alignItems = 'stretch'; card.style.gap = '10px';

    // Top row: avatar + name + delete
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:12px;';
    const av = document.createElement('div'); av.className = 'profile-avatar';
    av.style.background = profileColor(i); av.textContent = p.emoji || '🧒';
    const info = document.createElement('div'); info.className = 'profile-info';
    const name = document.createElement('div'); name.className = 'profile-name'; name.textContent = p.name;
    const sub = document.createElement('div'); sub.className = 'profile-stats';
    sub.textContent = `${p.stats?.correctAll||0}/${p.stats?.totalAll||0} ✓ gesamt  🔥${p.stats?.dailyStreak||0}`;
    info.appendChild(name); info.appendChild(sub);
    const del = document.createElement('button'); del.className = 'profile-del'; del.textContent = '×';
    del.onclick = (e)=>{ e.stopPropagation(); if(confirm('Profil löschen?')){profiles.splice(i,1);saveProfiles(profiles);renderProfileList();renderHighscore();} };
    topRow.appendChild(av); topRow.appendChild(info); topRow.appendChild(del);

    // Language summary row
    const langRow = document.createElement('div');
    langRow.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;';
    Object.entries(LANGS).forEach(([k, Lv])=>{
      const ls = (p.langStats && p.langStats[k]) || { total:0, correct:0, bestStreak:0 };
      const pct = ls.total > 0 ? Math.round(ls.correct/ls.total*100) : 0;
      const cell = document.createElement('div');
      cell.style.cssText = 'background:var(--surface);border-radius:var(--radius-sm);padding:6px 4px;text-align:center;';
      cell.innerHTML = `<div style="font-size:16px">${Lv.flag}</div>
        <div style="font-size:11px;font-weight:600;color:var(--text)">${ls.correct}/${ls.total}</div>
        <div style="font-size:10px;color:var(--muted)">${ls.total>0?pct+'%':'—'} 🔥${ls.bestStreak||0}</div>`;
      langRow.appendChild(cell);
    });

    const L = LANGS[settings.lang];
    // Mode stats toggle
    const modeToggle = document.createElement('button');
    modeToggle.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;color:var(--primary);font-weight:600;text-align:left;padding:0;';
    modeToggle.textContent = '▶ ' + L.modeDetails;

    const modeTable = document.createElement('div');
    modeTable.style.display = 'none';
    modeTable.style.cssText = 'display:none;overflow-x:auto;';

    // Build table: rows = modes, cols = languages
    const modeNames = L.modes;
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

    // Header row
    const thead = document.createElement('tr');
    thead.innerHTML = `<th style="text-align:left;padding:4px 6px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);">Modus</th>`;
    Object.entries(LANGS).forEach(([k,Lv])=>{
      thead.innerHTML += `<th style="text-align:center;padding:4px 4px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);">${Lv.flag}</th>`;
    });
    table.appendChild(thead);

    // Data rows — clock modes
    [0,1,2,3].forEach(modeIdx=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:4px 6px;color:var(--text);font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;">${modeNames[modeIdx]}</td>`;
      Object.keys(LANGS).forEach(k=>{
        const key = `${k}_${modeIdx}`;
        const ms = (p.modeStats && p.modeStats[key]) || { total:0, correct:0 };
        const pct = ms.total > 0 ? Math.round(ms.correct/ms.total*100) : null;
        const color = pct === null ? 'var(--muted)' : pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warm)' : 'var(--danger)';
        tr.innerHTML += `<td style="text-align:center;padding:4px 4px;border-bottom:1px solid var(--border);">
          <span style="font-weight:600;color:${color}">${ms.total>0?ms.correct+'/'+ms.total:'—'}</span>
          ${pct!==null?`<br><span style="color:var(--muted);font-size:10px">${pct}%</span>`:''}
        </td>`;
      });
      table.appendChild(tr);
    });
    // Number exercise row (language-independent)
    const ns = p.numStats || { total:0, correct:0 };
    const nsPct = ns.total > 0 ? Math.round(ns.correct/ns.total*100) : null;
    const nsColor = nsPct === null ? 'var(--muted)' : nsPct >= 80 ? 'var(--success)' : nsPct >= 50 ? 'var(--warm)' : 'var(--danger)';
    const numTr = document.createElement('tr');
    numTr.innerHTML = `<td style="padding:4px 6px;color:var(--text);font-weight:500;white-space:nowrap;">🔢 ${LANGS[settings.lang].numMode}</td>`;
    // Span all language columns with combined stats
    numTr.innerHTML += `<td colspan="4" style="text-align:center;padding:4px 4px;">
      <span style="font-weight:600;color:${nsColor}">${ns.total>0?ns.correct+'/'+ns.total:'—'}</span>
      ${nsPct!==null?`<br><span style="color:var(--muted);font-size:10px">${nsPct}%</span>`:''}
    </td>`;
    table.appendChild(numTr);
    modeTable.appendChild(table);

    modeToggle.onclick = (e)=>{
      e.stopPropagation();
      const open = modeTable.style.display !== 'none';
      modeTable.style.display = open ? 'none' : 'block';
      modeToggle.textContent = (open ? '▶' : '▼') + ' ' + L.modeDetails;
    };

    card.appendChild(topRow);
    card.appendChild(langRow);
    card.appendChild(modeToggle);
    card.appendChild(modeTable);
    card.onclick = (e)=>{ if(e.target.closest('.profile-del')||e.target===modeToggle) return; Audio.play('tick'); selectProfile(i); };
    list.insertBefore(card, list.firstChild);
  });
}

function profileColor(i) {
  const cols = ['#dbeafe','#dcfce7','#fef3c7','#ede9fe','#fee2e2','#e0f2fe'];
  return cols[i % cols.length];
}

let newProfileForm = null;
document.getElementById('btn-add-profile').onclick = ()=>{
  if (newProfileForm) return;
  const L = LANGS[settings.lang];
  const form = document.createElement('div'); form.className = 'new-profile-form';
  newProfileForm = form;
  const inp = document.createElement('input'); inp.placeholder = L.profileName; inp.maxLength = 20;
  const picker = document.createElement('div'); picker.className = 'emoji-picker';
  let selEmoji = EMOJIS[0];
  EMOJIS.forEach(em=>{
    const opt = document.createElement('span'); opt.className = 'emoji-opt'+(em===selEmoji?' selected':'');
    opt.textContent = em;
    opt.onclick = ()=>{ selEmoji=em; picker.querySelectorAll('.emoji-opt').forEach(x=>x.classList.remove('selected')); opt.classList.add('selected'); };
    picker.appendChild(opt);
  });
  const btns = document.createElement('div'); btns.className = 'form-btns';
  const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary'; saveBtn.textContent = '✓';
  saveBtn.onclick = ()=>{
    const name = inp.value.trim(); if (!name) { inp.focus(); return; }
    const p = { id:Date.now(), name, emoji:selEmoji, stats:{totalAll:0,correctAll:0,bestStreak:0,perfectRun:0,dailyStreak:0,lastDay:'',modesUsed:[],langsUsed:[]}, earned:[], sessionCorrect:0, sessionTotal:0, sessionStreak:0, dailyDone:0, weights:{} };
    profiles.push(p); saveProfiles(profiles);
    form.remove(); newProfileForm=null;
    renderProfileList(); renderHighscore();
  };
  const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn'; cancelBtn.textContent = '×';
  cancelBtn.onclick = ()=>{ form.remove(); newProfileForm=null; };
  btns.appendChild(cancelBtn); btns.appendChild(saveBtn);
  const hint = document.createElement('p');
  hint.style.cssText = 'font-size:11px;color:var(--muted);line-height:1.5;margin-top:8px;';
  hint.textContent = L.localStorageHint;
  form.appendChild(inp); form.appendChild(picker); form.appendChild(btns); form.appendChild(hint);
  document.getElementById('profile-list').appendChild(form);
  inp.focus();
};

function selectProfile(idx) {
  currentProfile = profiles[idx];
  currentProfileIdx = idx;
  if (Array.isArray(currentProfile.stats.modesUsed)) currentProfile.stats.modesUsed = new Set(currentProfile.stats.modesUsed);
  else currentProfile.stats.modesUsed = new Set();
  if (Array.isArray(currentProfile.stats.langsUsed)) currentProfile.stats.langsUsed = new Set(currentProfile.stats.langsUsed);
  else currentProfile.stats.langsUsed = new Set();
  // Init per-language structures
  currentProfile.langStats   = currentProfile.langStats   || {};
  currentProfile.langWeights = currentProfile.langWeights || {};
  currentProfile.numStats    = currentProfile.numStats    || { total:0, correct:0, perNum:{} };
  currentProfile.balance     = currentProfile.balance     || { counts:[0,0,0,0,0], round:1 };
  currentProfile.langSession = {};
  G.mode = currentProfile.lastMode || 0;
  G.diff = currentProfile.lastDiff !== undefined ? currentProfile.lastDiff : 2; // default: Schwer
  // If saved mode is locked, redirect to first free mode
  if (isModeLocked(G.mode)) {
    G.mode = getFirstFreeMode();
    currentProfile.lastMode = G.mode;
  }
  checkDaily();
  showScreen('app');
  renderApp();
}

// ── App Screen ────────────────────────────────────────────────────
function renderApp() {
  const L = LANGS[settings.lang];
  document.getElementById('player-name-display').textContent = (currentProfile.emoji||'') + ' ' + currentProfile.name;
  renderModeTabs();
  renderDifficulty();
  renderScores();
  renderPathRow();
  renderDailyBanner();
  renderBalanceBanner();
  Badges.render(currentProfile.earned, settings.lang);
  document.getElementById('lbl-badges').textContent = L.badgesTitle;
  renderNumStats();
  newTask();
  renderTask();
}

function renderModeTabs() {
  const L = LANGS[settings.lang];
  const mt = document.getElementById('mode-tabs'); mt.innerHTML = '';
  const b = getBalanceStats();
  L.modes.forEach((m, i)=>{
    const locked = isModeLocked(i);
    const count = b.counts[i]||0;
    const b2 = document.createElement('button');
    b2.className = 'mode-tab' + (i===G.mode?' active':'') + (locked?' mode-tab-locked':'');
    b2.style.position = 'relative';
    b2.innerHTML = `${locked?'🔒 ':''}${m}<br><span style="font-size:10px;opacity:.7">${count}/${BALANCE_MAX}</span>`;
    b2.disabled = locked;
    b2.onclick = ()=>{
      if (locked) {
        const msgs={de:'🔒 Diese Übung ist gesperrt!',it:'🔒 Esercizio bloccato!',en:'🔒 This exercise is locked!',ja:'🔒 このモードはロック中！'};
        const toast=document.getElementById('badge-toast');
        toast.textContent=msgs[settings.lang]||msgs.de; toast.style.background='var(--danger)'; toast.style.display='block';
        setTimeout(()=>{toast.style.display='none';toast.style.background='';},2000);
        return;
      }
      Audio.play('tick'); G.mode=i; currentProfile.lastMode=i; saveCurrentProfile();
      if (i === 4) { renderTask(); renderModeTabs(); }
      else { newTask(); animateTransition(renderTask); renderModeTabs(); }
    };
    mt.appendChild(b2);
  });
}

function renderDifficulty() {
  const L = LANGS[settings.lang];
  const dr = document.getElementById('difficulty-row');
  document.getElementById('lbl-level').textContent = L.level;
  dr.querySelectorAll('.diff-btn').forEach(b=>b.remove());
  L.levels.forEach((lv, i)=>{
    const b = document.createElement('button'); b.className = 'diff-btn'+(i===G.diff?' active':'');
    b.textContent = lv;
    b.onclick = ()=>{ Audio.play('tick'); G.diff=i; currentProfile.lastDiff=i; saveCurrentProfile(); newTask(); renderApp(); };
    dr.appendChild(b);
  });
}

function renderBalanceBanner() {
  const banner = document.getElementById('balance-banner');
  if (!banner) return;
  const b = getBalanceStats();
  const L = LANGS[settings.lang];
  const modeNames = L.modes;
  const locked = b.counts.map((c,i)=>c>=BALANCE_MAX ? modeNames[i] : null).filter(Boolean);
  if (locked.length === 0) { banner.style.display='none'; return; }
  banner.style.display = 'block';
  const remaining = b.counts.map((c,i)=>BALANCE_MAX-c).filter(c=>c>0);
  const minLeft = Math.min(...remaining);
  const msgs = {
    de: `🔒 ${locked.join(', ')} gesperrt — noch mind. ${minLeft} Aufgabe(n) in anderen Modi`,
    it: `🔒 ${locked.join(', ')} bloccato — ancora min. ${minLeft} esercizi in altri modi`,
    en: `🔒 ${locked.join(', ')} locked — at least ${minLeft} more task(s) in other modes`,
    ja: `🔒 ${locked.join(', ')} ロック中 — 他のモードであと${minLeft}問`
  };
  banner.textContent = msgs[settings.lang]||msgs.de;
}

function renderScores() {
  const L = LANGS[settings.lang];
  document.getElementById('lbl-correct').textContent = L.correct;
  document.getElementById('lbl-total').textContent   = L.total;
  document.getElementById('lbl-streak').textContent  = L.streak;
  // Show per-language session stats
  const ls = getLangSession(settings.lang);
  document.getElementById('score-correct').textContent = ls.correct || 0;
  document.getElementById('score-total').textContent   = ls.total   || 0;
  const str = ls.streak || 0;
  document.getElementById('score-streak').textContent = str>0 ? '⭐'.repeat(Math.min(str,5)) : '—';
  const tot = ls.total || 0, cor = ls.correct || 0;
  document.getElementById('progress-bar').style.width = (tot>0?Math.round(cor/tot*100):0)+'%';
}

function renderPathRow() {
  const row = document.getElementById('path-row'); row.innerHTML = '';
  const step = getPathStep(currentProfile.stats.totalAll||0);
  const icons = ['🌱','⭐','🌙','🌟','🔥','💫','🏆','👑','🎓'];
  PATH_THRESHOLDS.forEach((thresh, i)=>{
    const el = document.createElement('div');
    let cls = 'path-step';
    if (i < step) cls += ' done';
    else if (i === step) cls += ' current';
    else cls += ' locked';
    el.className = cls; el.textContent = icons[i] || i;
    el.title = thresh > 0 ? `${thresh} ✓` : 'Start';
    row.appendChild(el);
  });
}

// ── Back / Settings ───────────────────────────────────────────────
document.getElementById('btn-back').onclick = ()=>{
  stopTimer();
  if (currentProfile) {
    currentProfile.stats.modesUsed = [...(currentProfile.stats.modesUsed||new Set())];
    currentProfile.stats.langsUsed = [...(currentProfile.stats.langsUsed||new Set())];
    saveCurrentProfile();
  }
  showScreen('profile');
  renderProfileScreen();
};

document.getElementById('btn-settings').onclick = ()=>{ renderSettingsScreen(); showScreen('settings'); };
document.getElementById('btn-settings-back').onclick = ()=>{ showScreen('app'); renderApp(); };

function renderSettingsScreen() {
  const L = LANGS[settings.lang];
  document.getElementById('settings-title').textContent = L.settingsTitle;
  document.getElementById('lbl-timer-setting').textContent = L.timerLabel;
  document.getElementById('lbl-speech-setting').textContent = L.speechLabel;
  document.getElementById('lbl-sound-setting').textContent = L.soundLabel;
  document.getElementById('lbl-lang-setting').textContent = L.langLabel;
  document.getElementById('lbl-reset').textContent = L.resetLabel;

  // Dark mode
  const dm = document.getElementById('btn-dark-toggle');
  if (dm) {
    dm.textContent = settings.dark ? L.on : L.off;
    dm.className = 'toggle-btn' + (settings.dark?' on':'');
    dm.onclick = ()=>{ settings.dark=!settings.dark; applyDarkMode(settings.dark); Store.set('settings',settings); renderSettingsScreen(); };
  }

  // Timer
  const to = document.getElementById('timer-options'); to.innerHTML = '';
  [0,5,10,15].forEach((v,i)=>{
    const b = document.createElement('button'); b.className='timer-opt'+(settings.timer===v?' active':'');
    b.textContent = L.timerOpts[i];
    b.onclick=()=>{ settings.timer=v; Store.set('settings',settings); renderSettingsScreen(); };
    to.appendChild(b);
  });

  // Speech
  const sp = document.getElementById('btn-speech-toggle');
  sp.textContent = Audio.isSpeechOn() ? L.on : L.off;
  sp.className = 'toggle-btn' + (Audio.isSpeechOn()?' on':'');
  sp.onclick = ()=>{ Audio.setSpeechEnabled(!Audio.isSpeechOn()); settings.speech=Audio.isSpeechOn(); Store.set('settings',settings); renderSettingsScreen(); };

  // Sound
  const snd = document.getElementById('btn-sound-toggle');
  snd.textContent = Audio.isSoundOn() ? L.on : L.off;
  snd.className = 'toggle-btn' + (Audio.isSoundOn()?' on':'');
  snd.onclick = ()=>{ Audio.setSoundEnabled(!Audio.isSoundOn()); settings.sound=Audio.isSoundOn(); Store.set('settings',settings); renderSettingsScreen(); };

  // Lang
  const lb = document.getElementById('lang-bar-settings'); lb.innerHTML = '';
  Object.entries(LANGS).forEach(([k,Lv])=>{
    const b=document.createElement('button'); b.className='lang-btn'+(k===settings.lang?' active':'');
    b.textContent=Lv.flag+' '+Lv.name;
    b.onclick=()=>{ settings.lang=k; Store.set('settings',settings); renderSettingsScreen(); };
    lb.appendChild(b);
  });

  // Reset
  document.getElementById('btn-reset').onclick = ()=>{
    if (confirm('Wirklich zurücksetzen?')) {
      currentProfile.stats={totalAll:0,correctAll:0,bestStreak:0,perfectRun:0,dailyStreak:0,lastDay:'',modesUsed:[],langsUsed:[]};
      currentProfile.earned=[]; currentProfile.weights={};
      currentProfile.langStats={}; currentProfile.langWeights={}; currentProfile.langSession={};
      currentProfile.modeStats={}; currentProfile.numStats={ total:0, correct:0, perNum:{} };
      currentProfile.balance={ counts:[0,0,0,0,0], round:1 };
      saveCurrentProfile(); showScreen('app'); renderApp();
    }
  };

  // About
  const about = document.getElementById('about-section');
  about.innerHTML = '';
  about.style.cssText = 'margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border);';
  const aboutTitle = document.createElement('div');
  aboutTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.75rem;';
  aboutTitle.textContent = L.aboutTitle;
  const aboutText = document.createElement('p');
  aboutText.style.cssText = 'font-size:12px;color:var(--muted);line-height:1.7;white-space:pre-line;';
  aboutText.textContent = L.aboutText;
  about.appendChild(aboutTitle);
  about.appendChild(aboutText);
}

// ── Live clock label ──────────────────────────────────────────────
function updateLiveLabel() {
  let lbl = document.getElementById('live-time-label');
  if (!lbl) {
    lbl = document.createElement('div'); lbl.id = 'live-time-label';
    lbl.style.cssText = 'text-align:center;font-size:22px;font-weight:700;color:var(--primary);margin-bottom:.5rem;letter-spacing:.5px;min-height:30px;';
    const cw = document.getElementById('clock-wrap');
    cw.parentNode.insertBefore(lbl, cw.nextSibling);
  }
  lbl.textContent = fmtTime(G.uH, G.uM, settings.lang);
}

function removeLiveLabel() {
  const lbl = document.getElementById('live-time-label');
  if (lbl) lbl.remove();
}

// ── Drag setup ────────────────────────────────────────────────────
function teardownDrag() {
  const svg = document.getElementById('clock-svg');
  if (svg && svg._onMove) { document.removeEventListener('mousemove', svg._onMove); document.removeEventListener('touchmove', svg._onMove); svg._onMove = null; }
  if (svg && svg._onUp)   { document.removeEventListener('mouseup',  svg._onUp);   document.removeEventListener('touchend',  svg._onUp);   svg._onUp   = null; }
  const wordArea = document.getElementById('word-area');
  if (wordArea && wordArea._stopDrag) { wordArea.removeEventListener('touchstart', wordArea._stopDrag); wordArea._stopDrag = null; }
  G.dragging = null;
}

function setupDrag() {
  teardownDrag(); // clean up any previous listeners first
  const svg = document.getElementById('clock-svg');
  // Only start drag when touch/click originates on a hand handle inside the SVG
  svg.onmousedown = svg.ontouchstart = (e)=>{
    const t = e.target.closest('[data-hand]');
    if (!t) return;
    // Extra check: make sure the handle is inside this SVG
    if (!svg.contains(t)) return;
    e.preventDefault();
    e.stopPropagation();
    G.dragging = t.dataset.hand;
    svg.style.cursor = 'grabbing';
  };
  const onMove = (e)=>{
    if (!G.dragging) return;
    e.preventDefault();
    const ang = Clock.getAngle(e);
    if (G.dragging==='hour') { const nH=Clock.snapH(ang); if(nH!==G.uH){G.uH=nH;Audio.play('drag');} }
    else { const nM=Clock.snapM(ang,G.diff); if(nM!==G.uM){G.uM=nM;Audio.play('drag');} }
    Clock.draw(document.getElementById('clock-svg'), G.uH, G.uM, true, G.dragging);
  };
  const onUp = ()=>{
    if (!G.dragging) return;
    G.dragging = null;
    svg.style.cursor = 'default';
    Clock.draw(document.getElementById('clock-svg'), G.uH, G.uM, true, null);
  };
  svg._onMove = onMove;
  svg._onUp   = onUp;
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  // touchmove on document but only acts when G.dragging is set (which requires touch on SVG handle)
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('touchend', onUp);
  // Also block any stray touchmove on the word-area from reaching the drag handler
  const wordArea = document.getElementById('word-area');
  if (wordArea) {
    wordArea._stopDrag = (e)=>{ if(G.dragging) return; e.stopPropagation(); };
    wordArea.addEventListener('touchstart', wordArea._stopDrag, {passive:false});
  }
}

// ── Hide helpers ──────────────────────────────────────────────────
function hideAll() {
  // Hide static elements
  ['answer-grid','text-task-box','word-area','sliders-wrap'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  // Remove dynamic number elements
  ['num-inline-display','num-inline-input'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.remove();
  });
  removeLiveLabel();
  teardownDrag();
}

// ── Render Task ───────────────────────────────────────────────────
function renderTask() {
  const L = LANGS[settings.lang];
  const fb = document.getElementById('feedback');
  const btnRow = document.getElementById('btn-row');
  const ag = document.getElementById('answer-grid');
  fb.className='fb-neutral'; fb.textContent=''; btnRow.innerHTML=''; ag.innerHTML='';
  hideAll(); G.answered = false;
  stopTimer();

  document.getElementById('difficulty-row').style.display = G.mode === 4 ? 'none' : 'flex';

  if (currentProfile.stats.modesUsed instanceof Set) currentProfile.stats.modesUsed.add(G.mode);
  if (currentProfile.stats.langsUsed instanceof Set) currentProfile.stats.langsUsed.add(settings.lang);

  if (G.mode === 0) {
    // ── READ ──
    document.getElementById('task-text').textContent = L.readTask();
    document.getElementById('task-sub').textContent = L.readSub();
    document.getElementById('clock-wrap').style.display = 'flex';
    Clock.draw(document.getElementById('clock-svg'), G.tH, G.tM, false, null);
    // No speech — would reveal the answer
    ag.style.display = 'grid';
    const wrong = wrongAnswers(G.tH, G.tM, settings.lang, G.diff);
    const opts = [...wrong, fmtTime(G.tH,G.tM,settings.lang)].sort(()=>Math.random()-.5);
    opts.forEach(opt=>{
      const b = document.createElement('button'); b.className='answer-btn'; b.textContent=opt;
      b.onclick=()=>{
        if (G.answered) return;
        G.answered=true; stopTimer(); Audio.play('tick');
        const ok = opt===fmtTime(G.tH,G.tM,settings.lang);
        const correctTime = fmtTime(G.tH, G.tM, settings.lang);
        const correctSpeak = fmtTimeSpeak(G.tH, G.tM, settings.lang);
        const optSpeak = settings.lang === 'de' && G.tM !== 0 ? opt.replace(/\s+Uhr\s*$/, '') : opt;
        if (ok) {
          Audio.speak(correctSpeak, settings.lang);
        } else {
          const phrases = {
            de: `Das ist nicht ${optSpeak}. Die richtige Antwort wäre ${correctSpeak}.`,
            it: `Non è ${opt}. La risposta corretta è ${correctSpeak}.`,
            en: `That's not ${opt}. The correct answer is ${correctSpeak}.`,
            ja: `${opt}ではありません。正しい答えは${correctSpeak}です。`
          };
          Audio.speak(phrases[settings.lang] || phrases.de, settings.lang);
        }
        setTimeout(()=>{
          handleResult(ok, L);
          b.classList.add(ok?'correct':'wrong');
          if (!ok) ag.querySelectorAll('.answer-btn').forEach(x=>{ if(x.textContent===correctTime)x.classList.add('correct'); });
          ag.querySelectorAll('.answer-btn').forEach(x=>x.disabled=true);
          addNextBtn(btnRow, L);
        }, 80);
      };
      ag.appendChild(b);
    });
    startTimer();

  } else if (G.mode === 1) {
    // ── SET ──
    document.getElementById('task-text').textContent = L.setTask(G.tH, G.tM);
    document.getElementById('task-sub').textContent = L.setSub();
    document.getElementById('clock-wrap').style.display = 'flex';
    G.uH = (G.tH + 6) % 24; G.uM = 0;
    Clock.draw(document.getElementById('clock-svg'), G.uH, G.uM, true, null);
    setupDrag();
    insertSliders(L, G.diff);
    addHintAndCheck(btnRow, L, ()=>{
      const ok = G.uH%12===G.tH%12 && G.uM===G.tM;
      if (!ok) {
        const fb = document.getElementById('feedback');
        fb.className = 'fb-error';
        fb.textContent = wrongExplanation(G.tH, G.tM, G.uH, G.uM, settings.lang);
        Clock.draw(document.getElementById('clock-svg'), G.tH, G.tM, false, null);
        removeLiveLabel();
      }
      return ok;
    });

  } else if (G.mode === 2) {
    // ── TEXT → CLOCK ──
    document.getElementById('task-text').textContent = L.textSetTask();
    document.getElementById('task-sub').textContent = L.textSetSub();
    document.getElementById('clock-wrap').style.display = 'flex';
    const tb = document.getElementById('text-task-box'); tb.style.display='block';
    document.getElementById('text-task-main').textContent = fmtTime(G.tH, G.tM, settings.lang);
    Audio.speak(fmtTimeSpeak(G.tH, G.tM, settings.lang), settings.lang);
    G.uH = (G.tH + 5) % 24; G.uM = 0;
    Clock.draw(document.getElementById('clock-svg'), G.uH, G.uM, true, null);
    setupDrag();
    insertSliders(L, G.diff);
    addHintAndCheck(btnRow, L, ()=>{
      const ok = G.uH%12===G.tH%12 && G.uM===G.tM;
      if (!ok) {
        const fb = document.getElementById('feedback');
        fb.className = 'fb-error';
        fb.textContent = wrongExplanation(G.tH, G.tM, G.uH, G.uM, settings.lang);
        Clock.draw(document.getElementById('clock-svg'), G.tH, G.tM, false, null);
        removeLiveLabel();
      }
      return ok;
    });

  } else if (G.mode === 3) {
    // ── WORD ORDER ──
    document.getElementById('task-text').textContent = L.wordTask();
    document.getElementById('task-sub').textContent = L.wordSub();
    document.getElementById('clock-wrap').style.display = 'flex';
    Clock.draw(document.getElementById('clock-svg'), G.tH, G.tM, false, null);
    // No speech — would reveal the answer
    const wa = document.getElementById('word-area'); wa.style.display='block'; wa.classList.remove('answered');
    const frag = getFragments(G.tH, G.tM, settings.lang);
    const allChips = [...frag.correct, ...frag.decoys.slice(0,3)].sort(()=>Math.random()-.5);
    G.wordAnswer = []; G.wordBank = [...allChips];
    const bank = document.getElementById('word-bank');
    const answerEl = document.getElementById('word-answer'); answerEl.innerHTML='';
    const ansLabel = document.createElement('span'); ansLabel.id='word-answer-label';
    ansLabel.style.cssText='font-size:11px;color:var(--muted);width:100%;margin-bottom:3px;';
    ansLabel.textContent=L.wordAnswerLabel; answerEl.appendChild(ansLabel);

    function rebuildChips() {
      bank.innerHTML='';
      G.wordBank.forEach((w,i)=>{
        const ch=document.createElement('div'); ch.className='word-chip'; ch.textContent=w;
        ch.ontouchstart = (e)=>e.stopPropagation();
        ch.onclick=()=>{ if(G.answered)return; Audio.play('place'); G.wordAnswer.push(w); G.wordBank.splice(i,1); rebuildChips(); rebuildAnswer(); };
        bank.appendChild(ch);
      });
    }
    function rebuildAnswer() {
      [...answerEl.children].forEach(c=>{ if(c.id!=='word-answer-label')c.remove(); });
      G.wordAnswer.forEach((w,i)=>{
        const ch=document.createElement('div'); ch.className='word-chip in-answer'; ch.textContent=w;
        ch.ontouchstart = (e)=>e.stopPropagation();
        ch.onclick=()=>{ if(G.answered)return; Audio.play('tick'); G.wordBank.push(w); G.wordAnswer.splice(i,1); rebuildChips(); rebuildAnswer(); };
        answerEl.appendChild(ch);
      });
    }
    rebuildChips();

    const clearBtn=document.createElement('button'); clearBtn.className='btn'; clearBtn.textContent=L.reset;
    clearBtn.onclick=()=>{ if(G.answered)return; Audio.play('tick'); G.wordBank=[...allChips].sort(()=>Math.random()-.5); G.wordAnswer=[]; rebuildChips(); rebuildAnswer(); };
    const checkBtn=document.createElement('button'); checkBtn.className='btn btn-primary'; checkBtn.textContent=L.check;
    checkBtn.onclick=()=>{
      if (G.answered||G.wordAnswer.length===0) return;
      G.answered=true; wa.classList.add('answered'); Audio.play('tick'); stopTimer();
      const ok = G.wordAnswer.join(' ')===frag.correct.join(' ');
      const correctSpeak = fmtTimeSpeak(G.tH, G.tM, settings.lang);
      if (ok) {
        Audio.speak(correctSpeak, settings.lang);
      } else {
        const chosen = G.wordAnswer.join(' ');
        const phrases = {
          de: `Das ist nicht ${chosen}. Die richtige Antwort wäre ${correctSpeak}.`,
          it: `Non è ${chosen}. La risposta corretta è ${correctSpeak}.`,
          en: `That's not ${chosen}. The correct answer is ${correctSpeak}.`,
          ja: `${chosen}ではありません。正しい答えは${correctSpeak}です。`
        };
        Audio.speak(phrases[settings.lang] || phrases.de, settings.lang);
      }
      setTimeout(()=>{
        handleResult(ok, L);
        if (!ok) { const fb=document.getElementById('feedback'); fb.textContent += '  ✓ '+frag.correct.join(' '); }
        btnRow.innerHTML=''; addNextBtn(btnRow, L);
      }, 80);
    };
    btnRow.appendChild(clearBtn); btnRow.appendChild(checkBtn);
    startTimer();
  }

  // ── MODE 4: NUMBER WRITING ──
  if (G.mode === 4) {
    const n = G.currentNum !== undefined ? G.currentNum : (G.currentNum = randNum());
    const correct = (NUM_WORDS[settings.lang]||NUM_WORDS.de)[n].toLowerCase().replace(/ß/g, 'ss');
    document.getElementById('task-text').textContent = L.numTask(n);
    document.getElementById('task-sub').textContent = L.numSub();
    document.getElementById('clock-wrap').style.display = 'none';

    // Big number display
    const numDisplay = document.createElement('div');
    numDisplay.id = 'num-inline-display';
    numDisplay.style.cssText = 'font-size:72px;font-weight:700;text-align:center;background:var(--surface);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;color:var(--text);';
    numDisplay.textContent = n;
    document.getElementById('task-card').insertBefore(numDisplay, document.getElementById('feedback'));

    // Input field
    const inp = document.createElement('input');
    inp.id = 'num-inline-input';
    inp.type='text'; inp.autocomplete='off'; inp.autocorrect='off'; inp.spellcheck=false;
    inp.placeholder = L.numPlaceholder;
    inp.style.cssText = 'width:100%;padding:11px 14px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:16px;margin-bottom:.875rem;outline:none;background:var(--card);color:var(--text);';
    inp.onfocus = ()=>inp.style.borderColor='var(--primary)';
    inp.onblur = ()=>inp.style.borderColor='var(--border)';
    document.getElementById('task-card').insertBefore(inp, document.getElementById('feedback'));
    setTimeout(()=>inp.focus(), 100);

    const MAX_TRIES = 3;
    let attempt = 0;

    const ns = getNumStats();
    ns.total = (ns.total||0) + 1;
    if (!ns.perNum[n]) ns.perNum[n] = { total:0, correct1:0, correct2:0, correct3:0, failed:0 };
    ns.perNum[n].total++;
    let statsRecorded = false;

    function checkNumAnswer() {
      if (G.answered) return;
      const val = normalizeInput(inp.value);
      if (!val) { inp.focus(); return; }
      attempt++;
      Audio.play('tick');
      const fb = document.getElementById('feedback');
      const ok = val === correct;

      if (ok) {
        if (!statsRecorded) {
          statsRecorded = true;
          ns.perNum[n][`correct${attempt}`]++;
          if (attempt === 1) ns.correct = (ns.correct||0) + 1;
        }
        Audio.play('correct');
        fb.className = 'fb-success';
        fb.textContent = L.fb.correct + (attempt > 1 ? ` (${attempt}. Versuch)` : '');
        Audio.speak(correct, settings.lang);
        G.answered = true;
        inp.disabled = true;
        saveCurrentProfile(); renderNumStats();
        const nb = document.createElement('button'); nb.className='btn btn-primary'; nb.textContent=L.next;
        nb.onclick=()=>{
          recordModePlay(4);
          if (isModeLocked(4)) { G.mode = getFirstFreeMode(); currentProfile.lastMode = G.mode; saveCurrentProfile(); }
          G.currentNum=undefined; hideAll(); newNumTask(); animateTransition(renderTask); renderModeTabs();
        };
        btnRow.innerHTML=''; btnRow.appendChild(nb);
      } else {
        Audio.play('wrong');
        if (attempt >= MAX_TRIES) {
          if (!statsRecorded) { statsRecorded=true; ns.perNum[n].failed++; }
          fb.className='fb-error';
          const phrases={de:`Nicht geschafft. Richtig: ${correct}`,it:`Non ce l'hai fatta. Corretto: ${correct}`,en:`Not managed. Correct: ${correct}`,ja:`残念。正解：${correct}`};
          fb.textContent = phrases[settings.lang]||phrases.de;
          Audio.speak(phrases[settings.lang]||phrases.de, settings.lang);
          G.answered = true; inp.disabled = true;
          saveCurrentProfile(); renderNumStats();
          const nb = document.createElement('button'); nb.className='btn btn-primary'; nb.textContent=L.next;
          nb.onclick=()=>{
            recordModePlay(4);
            if (isModeLocked(4)) { G.mode = getFirstFreeMode(); currentProfile.lastMode = G.mode; saveCurrentProfile(); }
            G.currentNum=undefined; hideAll(); newNumTask(); animateTransition(renderTask); renderModeTabs();
          };
          btnRow.innerHTML=''; btnRow.appendChild(nb);
        } else {
          const left = MAX_TRIES - attempt;
          const msgs={de:['Noch nicht — versuch es nochmal!','Fast! Ein letzter Versuch.'],it:['Non ancora — riprova!','Quasi! Un ultimo tentativo.'],en:['Not quite — try again!','Almost! One last try.'],ja:['もう少し！','最後の挑戦！']};
          fb.className='fb-error';
          fb.textContent = (msgs[settings.lang]||msgs.de)[attempt-1];
          document.getElementById('task-sub').textContent = `✏️ ${correct} — ${left === 1 ? {de:'noch 1 Versuch',it:'ancora 1 tentativo',en:'1 try left',ja:'あと1回'}[settings.lang]||'1 try left' : {de:`noch ${left} Versuche`,it:`ancora ${left} tentativi`,en:`${left} tries left`,ja:`あと${left}回`}[settings.lang]||`${left} tries left`}`;
          inp.value=''; inp.focus();
        }
      }
    }

    const checkBtn2 = document.createElement('button'); checkBtn2.className='btn btn-primary'; checkBtn2.textContent=L.check;
    checkBtn2.onclick = checkNumAnswer;
    inp.onkeydown = (e)=>{ if(e.key==='Enter') checkNumAnswer(); };
    btnRow.appendChild(checkBtn2);
  }
}

function addHintAndCheck(btnRow, L, checkFn) {
  const hintBtn=document.createElement('button'); hintBtn.className='btn'; hintBtn.textContent=L.hint;
  hintBtn.onclick=()=>{ Audio.play('tick'); const fb=document.getElementById('feedback'); fb.className='fb-neutral'; fb.textContent=L.fb.hint; };
  const checkBtn=document.createElement('button'); checkBtn.className='btn btn-primary'; checkBtn.textContent=L.check;
  checkBtn.onclick=()=>{
    if (G.answered) return;
    G.answered=true; stopTimer(); Audio.play('tick');
    setTimeout(()=>{
      const ok=checkFn();
      handleResult(ok, L);
      const br=document.getElementById('btn-row'); br.innerHTML='';
      addNextBtn(br, L);
    }, 80);
  };
  btnRow.appendChild(hintBtn); btnRow.appendChild(checkBtn);
  startTimer();
}

function handleResult(ok, L) {
  const fb = document.getElementById('feedback');
  const lang = settings.lang;
  const ls = getLangStats(lang);
  const sess = getLangSession(lang);
  const ms = getModeStats(lang, G.mode);

  // Global stats
  currentProfile.stats.totalAll   = (currentProfile.stats.totalAll||0) + 1;
  // Per-language stats
  ls.total = (ls.total||0) + 1;
  sess.total = (sess.total||0) + 1;
  // Per-mode stats
  ms.total = (ms.total||0) + 1;

  recordAttempt(G.tH, G.tM, ok);

  if (ok) {
    Audio.play('correct');
    // Global
    currentProfile.stats.correctAll  = (currentProfile.stats.correctAll||0)  + 1;
    currentProfile.stats.perfectRun  = (currentProfile.stats.perfectRun||0)  + 1;
    // Per-language
    ls.correct     = (ls.correct||0)     + 1;
    ls.streak      = (ls.streak||0)      + 1;
    ls.bestStreak  = Math.max(ls.bestStreak||0, ls.streak);
    sess.correct   = (sess.correct||0)   + 1;
    sess.streak    = (sess.streak||0)    + 1;
    // Per-mode
    ms.correct = (ms.correct||0) + 1;
    // Global streak (for badges)
    currentProfile.stats.bestStreak = Math.max(currentProfile.stats.bestStreak||0, ls.streak);
    if (G.dailyDone < G.dailyTotal) {
      G.dailyDone++; currentProfile.dailyDone = G.dailyDone;
      if (G.dailyDone >= G.dailyTotal) launchConfetti();
    }
    if (sess.streak % 5 === 0) launchConfetti();
    fb.className='fb-success'; fb.textContent=L.fb.correct;
  } else {
    Audio.play('wrong');
    // Global
    currentProfile.stats.bestStreak = Math.max(currentProfile.stats.bestStreak||0, ls.streak||0);
    currentProfile.stats.perfectRun = 0;
    // Per-language
    ls.streak = 0;
    sess.streak = 0;
    if (!fb.textContent || fb.className !== 'fb-error') {
      fb.className='fb-error'; fb.textContent=L.fb.wrong;
    }
  }

  const prevLen = (currentProfile.earned||[]).length;
  currentProfile.earned = Badges.check(currentProfile.stats, currentProfile.earned||[], lang, showBadgeToast);
  if (currentProfile.earned.length > prevLen) Badges.render(currentProfile.earned, lang);
  renderScores(); renderPathRow(); renderDailyBanner();

  // Save (convert sets to arrays)
  currentProfile.stats.modesUsed = [...(currentProfile.stats.modesUsed||new Set())];
  currentProfile.stats.langsUsed = [...(currentProfile.stats.langsUsed||new Set())];
  saveCurrentProfile();
  currentProfile.stats.modesUsed = new Set(currentProfile.stats.modesUsed);
  currentProfile.stats.langsUsed = new Set(currentProfile.stats.langsUsed);
}

function getFirstFreeMode() {
  for (let i = 0; i < 5; i++) {
    if (!isModeLocked(i)) return i;
  }
  return 0; // all unlocked after reset
}

function addNextBtn(btnRow, L) {
  const b=document.createElement('button'); b.className='btn btn-primary'; b.textContent=L.next;
  b.onclick=()=>{
    Audio.play('tick');
    // Record balance play for clock modes
    if (G.mode < 4) recordModePlay(G.mode);
    // After recording, check if current mode is now locked → auto-switch
    if (isModeLocked(G.mode)) {
      G.mode = getFirstFreeMode();
      currentProfile.lastMode = G.mode;
      saveCurrentProfile();
    }
    numExerciseCounter++;
    if (numExerciseCounter >= 5) {
      numExerciseCounter = 0;
      newTask();
      animateTransition(renderTask);
      setTimeout(()=>showNumPopup(false), 400);
    } else {
      newTask();
      animateTransition(renderTask);
    }
    renderModeTabs();
  };
  btnRow.appendChild(b);
}

function newNumTask() {
  G.currentNum = randNum();
}

function newTask() {
  if (G.mode === 4) { newNumTask(); return; }
  const {h,m}=randTime(G.diff); G.tH=h; G.tM=m;
}

// ── Disclaimer (shown once) ───────────────────────────────────────
function initDisclaimer() {
  const overlay = document.getElementById('disclaimer-overlay');
  const btn     = document.getElementById('disclaimer-btn');
  const text    = document.getElementById('disclaimer-text');
  const title   = document.getElementById('disclaimer-title');

  const lang = settings.lang || 'de';
  const texts = {
    de: {
      t: 'Stell die Uhr!',
      b: 'Verstanden',
      p: 'Diese App wurde für den privaten Gebrauch entwickelt und wird ohne Gewähr bereitgestellt. Sie dient ausschliesslich zu Lernzwecken. Für allfällige Fehler oder Ungenauigkeiten wird keine Haftung übernommen.'
    },
    it: {
      t: "Metti l'orologio!",
      b: 'Ho capito',
      p: "Questa app è stata sviluppata per uso privato e viene fornita senza garanzia. È destinata esclusivamente a scopi didattici. Non si assume alcuna responsabilità per eventuali errori o imprecisioni."
    },
    en: {
      t: 'Set the Clock!',
      b: 'Understood',
      p: 'This app was developed for private use and is provided without warranty. It is intended for educational purposes only. No liability is accepted for any errors or inaccuracies.'
    },
    ja: {
      t: '時計を合わせよう！',
      b: '了解',
      p: 'このアプリは個人使用のために開発されたものであり、保証なしで提供されています。教育目的のみを意図しており、エラーや不正確さについては責任を負いません。'
    }
  };

  const t = texts[lang] || texts.de;
  title.textContent = t.t;
  text.textContent  = t.p;
  btn.textContent   = t.b;

  if (Store.get('disclaimer_accepted', false)) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  btn.onclick = ()=>{
    Store.set('disclaimer_accepted', true);
    overlay.classList.add('hidden');
  };
}

// ── Service Worker ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}

// ── Boot ──────────────────────────────────────────────────────────
Audio.setSoundEnabled(settings.sound !== false);
Audio.setSpeechEnabled(settings.speech !== false);
initDisclaimer();
showScreen('profile');
renderProfileScreen();


// === Added global input limiter ===
const MAX_INPUT = 10;
let inputCount = 0;

function canUseInput() {
  return inputCount < MAX_INPUT;
}

function registerInputUse() {
  if (!canUseInput()) {
    alert("Maximale Anzahl erreicht");
    return false;
  }
  inputCount++;
  return true;
}
