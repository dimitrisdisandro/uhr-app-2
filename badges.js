// badges.js — achievement definitions and checking

const BADGE_DEFS = [
  { id:'first',    icon:'🌟', de:'Erste Antwort',    it:'Prima risposta',  en:'First answer',    ja:'最初の回答',    condition: s => s.totalAll >= 1 },
  { id:'ten',      icon:'🔟', de:'10 Aufgaben',      it:'10 esercizi',     en:'10 exercises',    ja:'10問',          condition: s => s.totalAll >= 10 },
  { id:'fifty',    icon:'🏅', de:'50 Aufgaben',      it:'50 esercizi',     en:'50 exercises',    ja:'50問',          condition: s => s.totalAll >= 50 },
  { id:'hundred',  icon:'💯', de:'100 Aufgaben',     it:'100 esercizi',    en:'100 exercises',   ja:'100問',         condition: s => s.totalAll >= 100 },
  { id:'streak5',  icon:'🔥', de:'5 in Folge',       it:'5 di fila',       en:'5 in a row',      ja:'5連続',         condition: s => s.bestStreak >= 5 },
  { id:'streak10', icon:'⚡', de:'10 in Folge',      it:'10 di fila',      en:'10 in a row',     ja:'10連続',        condition: s => s.bestStreak >= 10 },
  { id:'perfect',  icon:'✨', de:'Fehlerfrei (10)',   it:'Senza errori (10)',en:'Perfect (10)',   ja:'完璧 (10問)',    condition: s => s.perfectRun >= 10 },
  { id:'allModes', icon:'🎓', de:'Alle Modi',        it:'Tutti i modi',    en:'All modes',       ja:'全モード',      condition: s => s.modesUsed && s.modesUsed.size >= 4 },
  { id:'allLangs', icon:'🌍', de:'Alle Sprachen',    it:'Tutte le lingue', en:'All languages',   ja:'全言語',        condition: s => s.langsUsed && s.langsUsed.size >= 4 },
  { id:'daily7',   icon:'📅', de:'7 Tage dabei',     it:'7 giorni',        en:'7 days',          ja:'7日間',         condition: s => s.dailyStreak >= 7 },
  { id:'master',   icon:'👑', de:'Meister',          it:'Maestro',         en:'Master',          ja:'マスター',      condition: s => s.totalAll >= 200 && s.bestStreak >= 15 },
];

const Badges = (() => {
  function check(stats, earned, lang, onNew) {
    const newOnes = [];
    for (const b of BADGE_DEFS) {
      if (!earned.includes(b.id) && b.condition(stats)) {
        earned.push(b.id);
        newOnes.push(b);
      }
    }
    if (newOnes.length > 0 && onNew) onNew(newOnes, lang);
    return earned;
  }

  function getLabel(b, lang) {
    return b[lang] || b.de;
  }

  function render(earned, lang) {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const b of BADGE_DEFS) {
      const isEarned = earned.includes(b.id);
      const item = document.createElement('div'); item.className = 'badge-item';
      const icon = document.createElement('div');
      icon.className = 'badge-icon ' + (isEarned ? 'earned' : 'locked-badge');
      icon.textContent = b.icon;
      icon.title = getLabel(b, lang);
      const lbl = document.createElement('div'); lbl.className = 'badge-label';
      lbl.textContent = getLabel(b, lang);
      item.appendChild(icon); item.appendChild(lbl);
      grid.appendChild(item);
    }
  }

  return { check, render, getLabel };
})();
