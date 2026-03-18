// audio.js — Web Audio + Speech synthesis

const Audio = (() => {
  let ac = null;
  let soundEnabled = true;
  let speechEnabled = true;

  function getAC() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    return ac;
  }

  function play(type) {
    if (!soundEnabled) return;
    try {
      const ctx = getAC();
      if (type === 'tick') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; o.type = 'sine';
        g.gain.setValueAtTime(.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .08);
        o.start(); o.stop(ctx.currentTime + .08);
      }
      if (type === 'correct') {
        [523, 659, 784, 1047].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f;
          const t = ctx.currentTime + i * .1;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .18);
          o.start(t); o.stop(t + .2);
        });
      }
      if (type === 'wrong') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sawtooth'; o.frequency.value = 180;
        g.gain.setValueAtTime(.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .35);
        o.start(); o.stop(ctx.currentTime + .35);
      }
      if (type === 'drag') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 660; o.type = 'sine';
        g.gain.setValueAtTime(.05, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .04);
        o.start(); o.stop(ctx.currentTime + .04);
      }
      if (type === 'place') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 740; o.type = 'sine';
        g.gain.setValueAtTime(.1, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .1);
        o.start(); o.stop(ctx.currentTime + .1);
      }
      if (type === 'badge') {
        [440, 554, 659, 880, 1108].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = f;
          const t = ctx.currentTime + i * .12;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .22);
          o.start(t); o.stop(t + .25);
        });
      }
    } catch(e) {}
  }

  function speak(text, lang) {
    if (!speechEnabled) return;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Small delay so cancel() completes before new utterance starts
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      const langMap = { de: 'de-DE', it: 'it-IT', en: 'en-GB', ja: 'ja-JP' };
      u.lang = langMap[lang] || 'de-DE';
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }, 120);
  }

  function setSoundEnabled(v) { soundEnabled = v; }
  function setSpeechEnabled(v) { speechEnabled = v; }
  function isSoundOn() { return soundEnabled; }
  function isSpeechOn() { return speechEnabled; }

  return { play, speak, setSoundEnabled, setSpeechEnabled, isSoundOn, isSpeechOn };
})();
