// i18n.js — translations and time formatting (24h, numbers written out)

// ── Number words ──────────────────────────────────────────────────
const NUM_DE = ['null','ein','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn',
  'elf','zwölf','dreizehn','vierzehn','fünfzehn','sechzehn','siebzehn','achtzehn','neunzehn',
  'zwanzig','einundzwanzig','zweiundzwanzig','dreiundzwanzig'];
const NUM_IT = ['zero','una','due','tre','quattro','cinque','sei','sette','otto','nove','dieci',
  'undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove',
  'venti','ventuno','ventidue','ventitré'];
const NUM_EN = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen',
  'twenty','twenty-one','twenty-two','twenty-three'];
const NUM_JA = ['ゼロ','一','二','三','四','五','六','七','八','九','十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九',
  '二十','二十一','二十二','二十三'];

// Minute words DE (0,5,10,...55)
const MIN_DE = {0:'null',5:'fünf',10:'zehn',15:'fünfzehn',20:'zwanzig',25:'fünfundzwanzig',
  30:'dreissig',35:'fünfunddreissig',40:'vierzig',45:'fünfundvierzig',50:'fünfzig',55:'fünfundfünfzig'};

// "halb X" / "vor X" braucht "eins" statt "ein" für 1
const NUM_DE_HALB = ['null','eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn',
  'elf','zwölf','eins','zwei','drei','vier','fünf','sechs','sieben','acht','eins','zwei','drei'];

// Italienisch verwendet immer 12h-Zahlen (1–12)
const NUM_IT_12 = ['dodici','una','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','undici','dodici'];

// Normalize input: lowercase + replace ß with ss (Swiss German)
function normalizeInput(s) { return s.trim().toLowerCase().replace(/ß/g, 'ss'); }
function h12(h) { return h % 12 === 0 ? 12 : h % 12; }
function nextH12(h) { return h12(h) % 12 + 1; }
// For 24h: next hour wraps at 24
function nextH24(h) { return (h + 1) % 24; }

// Italienisch: korrekte Stundenform mit Artikel für "meno"-Ausdrücke
function itNextHour(next12) {
  if (next12 === 1) return "l'una";
  return 'le ' + NUM_IT_12[next12];
}

function fmtTime(h, m, lang) {
  const h12v = h12(h);  // always 1–12
  const next12 = nextH12(h);
  const next24 = nextH24(h);

  if (lang === 'de') {
    const hWord = h === 0 ? NUM_DE[12] : NUM_DE[h];
    const next12Word = NUM_DE_HALB[next12];
    if (m === 0)  return `${hWord} Uhr`;
    if (m === 5)  return `fünf nach ${hWord}`;
    if (m === 10) return `zehn nach ${hWord}`;
    if (m === 15) return `Viertel nach ${hWord}`;
    if (m === 20) return `zwanzig nach ${hWord}`;
    if (m === 25) return `fünf vor halb ${next12Word}`;
    if (m === 30) return `halb ${next12Word}`;
    if (m === 35) return `fünf nach halb ${next12Word}`;
    if (m === 40) return `zwanzig vor ${next12Word}`;
    if (m === 45) return `Viertel vor ${next12Word}`;
    if (m === 50) return `zehn vor ${next12Word}`;
    if (m === 55) return `fünf vor ${next12Word}`;
    return `${hWord} Uhr ${MIN_DE[m]||m}`;
  }

  if (lang === 'it') {
    const hWord = NUM_IT_12[h12v];
    const next12Word = NUM_IT_12[next12];
    const isUna = h12v === 1;
    if (isUna) {
      if (m === 0)  return `l'una`;
      if (m === 15) return `l'una e un quarto`;
      if (m === 30) return `l'una e mezza`;
      if (m === 45) return `${itNextHour(next12)} meno un quarto`;
      if (m < 30)   return `l'una e ${m}`;
      return `${itNextHour(next12)} meno ${60-m}`;
    }
    if (m === 0)  return `le ${hWord}`;
    if (m === 15) return `le ${hWord} e un quarto`;
    if (m === 30) return `le ${hWord} e mezza`;
    if (m === 45) return `${itNextHour(next12)} meno un quarto`;
    if (m < 30)   return `le ${hWord} e ${m}`;
    return `${itNextHour(next12)} meno ${60-m}`;
  }

  if (lang === 'ja') {
    const mm = m.toString().padStart(2,'0');
    if (m === 0)  return `${h}時`;
    if (m === 30) return `${h}時半`;
    return `${h}時${mm}分`;
  }

  // en
  const hWord = NUM_EN[h12v];
  const nextWord = NUM_EN[next12];
  if (m === 0)  return `${hWord} o'clock`;
  if (m === 15) return `quarter past ${hWord}`;
  if (m === 30) return `half past ${hWord}`;
  if (m === 45) return `quarter to ${nextWord}`;
  if (m < 30)   return `${m} past ${hWord}`;
  return `${60-m} to ${nextWord}`;
}

function getFragments(h, m, lang) {
  const h12v = h12(h);
  const next12 = nextH12(h);
  const next24 = nextH24(h);

  if (lang === 'de') {
    const hW = h === 0 ? NUM_DE[12] : NUM_DE[h];
    const n12W = NUM_DE_HALB[next12];
    if (m === 0)  return { correct: [hW, 'Uhr'],                          decoys: ['nach','vor','halb','Viertel'] };
    if (m === 5)  return { correct: ['fünf','nach',hW],                   decoys: ['vor','halb','Uhr','zehn'] };
    if (m === 10) return { correct: ['zehn','nach',hW],                   decoys: ['vor','fünf','halb','Uhr'] };
    if (m === 15) return { correct: ['Viertel','nach',hW],                decoys: ['vor','halb','zehn','Uhr'] };
    if (m === 20) return { correct: ['zwanzig','nach',hW],                decoys: ['vor','halb','fünf','Uhr'] };
    if (m === 25) return { correct: ['fünf','vor','halb',n12W],           decoys: ['nach',hW,'Viertel','zehn'] };
    if (m === 30) return { correct: ['halb',n12W],                        decoys: ['nach','vor',hW,'Uhr','fünf'] };
    if (m === 35) return { correct: ['fünf','nach','halb',n12W],          decoys: ['vor',hW,'zehn','Uhr'] };
    if (m === 40) return { correct: ['zwanzig','vor',n12W],               decoys: ['nach','halb',hW,'Uhr'] };
    if (m === 45) return { correct: ['Viertel','vor',n12W],               decoys: ['nach','halb',hW,'zehn'] };
    if (m === 50) return { correct: ['zehn','vor',n12W],                  decoys: ['nach','halb',hW,'fünf'] };
    if (m === 55) return { correct: ['fünf','vor',n12W],                  decoys: ['nach','halb',hW,'zehn'] };
    return { correct: [hW,'Uhr',MIN_DE[m]||String(m)], decoys: ['nach','vor','halb'] };
  }

  if (lang === 'en') {
    const hW = NUM_EN[h12v];
    const nW = NUM_EN[next12];
    if (m === 0)  return { correct: [hW, "o'clock"],              decoys: ['past','to','half','quarter'] };
    if (m === 15) return { correct: ['quarter','past',hW],        decoys: ['to','half',nW,'five'] };
    if (m === 30) return { correct: ['half','past',hW],           decoys: ['to','quarter',nW,'five'] };
    if (m === 45) return { correct: ['quarter','to',nW],          decoys: ['past','half',hW,'five'] };
    if (m < 30)   return { correct: [String(m),'past',hW],        decoys: ['to',nW,'half','quarter'] };
    return         { correct: [String(60-m),'to',nW],             decoys: ['past',hW,'half','quarter'] };
  }

  if (lang === 'it') {
    const hW = NUM_IT_12[h12v];
    const nW = NUM_IT_12[next12];
    const isUna = h12v === 1;
    if (m === 0)  return isUna ? {correct:["l'una"],          decoys:['le','e','mezza','meno']}
                               : {correct:['le',hW],          decoys:["l'una",'e','mezza','meno']};
    if (m === 30) return isUna ? {correct:["l'una",'e','mezza'],decoys:['le','meno','un','quarto']}
                               : {correct:['le',hW,'e','mezza'],decoys:["l'una",'meno','un','quarto']};
    if (m === 15) return { correct: isUna?["l'una",'e','un','quarto']:['le',hW,'e','un','quarto'], decoys: ['meno','mezza',nW,'dopo'] };
    if (m === 45) return next12 === 1
      ? { correct: ["l'una",'meno','un','quarto'], decoys: [hW,'e','mezza','dopo'] }
      : { correct: ['le',nW,'meno','un','quarto'], decoys: [hW,'e','mezza','dopo'] };
    return isUna  ? { correct: ["l'una",'e',String(m)],       decoys: ['le','meno',nW,'mezza'] }
                  : { correct: ['le',hW,'e',String(m)],       decoys: ["l'una",'meno',nW,'mezza'] };
  }

  if (lang === 'ja') {
    const mm = m.toString().padStart(2,'0');
    if (m === 0)  return { correct: [`${h}`, '時'],             decoys: ['半','分','30','15'] };
    if (m === 30) return { correct: [`${h}`, '時半'],           decoys: ['分',String(m),String(next24),'時'] };
    return         { correct: [`${h}`, '時', mm, '分'],         decoys: [String(next24),String(60-m),'半'] };
  }

  return { correct: [fmtTime(h, m, lang)], decoys: [] };
}

const LANGS = {
  de: {
    name:'Deutsch', flag:'🇩🇪',
    appTitle:'⏰ Stell die Uhr!', appSub:'Lerne die Uhr lesen und stellen',
    whoPlays:'Wer spielt?', newProfile:'Neues Profil', profileName:'Name eingeben…',
    modes:['Uhr lesen','Zeiger stellen','Text → Uhr','Uhr → Satz','🔢 Zahlen'],
    numMode:'Zahlen schreiben',
    numTask:(n)=>`Wie schreibt man die Zahl ${n}?`,
    numSub:()=>'Tippe die Zahl als Wort.',
    numPlaceholder:'z.B. siebzehn',
    numPopupTitle:'Zahlen-Übung! 🔢',
    numPopupSub:'Kurze Unterbrechung — schreibe diese Zahl als Wort:',
    numStatsTitle:'Zahlen-Statistik',
    numStatsTotal:'Gesamt',
    levels:['Einfach','Mittel','Schwer'],
    correct:'Richtig', total:'Gesamt', streak:'Serie', level:'Stufe:',
    check:'Prüfen', next:'Weiter ➜', hint:'Tipp 💡', reset:'↺',
    readTask:()=>'Wie viel Uhr ist es?', readSub:()=>'Wähle die richtige Antwort.',
    setTask:(h,m)=>`Stelle die Uhr auf: ${fmtTime(h,m,'de')}`, setSub:()=>'Schieberegler oder Zeiger ziehen.',
    textSetTask:()=>'Stelle die Zeiger richtig!', textSetSub:()=>'Lies den Text und stelle die Uhr entsprechend ein.',
    wordTask:()=>'Richtige Reihenfolge?', wordSub:()=>'Tippe die Wörter in der richtigen Reihenfolge.',
    wordBankLabel:'Verfügbare Wörter:', wordAnswerLabel:'Deine Antwort:',
    settingsTitle:'Einstellungen', timerLabel:'Zeitlimit', speechLabel:'Vorlesen',
    soundLabel:'Ton', langLabel:'Sprache', resetLabel:'Fortschritt zurücksetzen',
    timerOpts:['Aus','5s','10s','15s'], badgesTitle:'Abzeichen',
    dailyText:'Tagesaufgabe:', on:'EIN', off:'AUS', pathLabel:'Lernpfad',
    sliderHours:'Stunden', sliderMinutes:'Minuten',
    modeDetails:'Details pro Modus',
    localStorageHint:'⚠️ Dein Fortschritt wird lokal auf diesem Gerät gespeichert. Beim Löschen des Browser-Caches oder der App-Daten gehen die Statistiken verloren.',
    aboutTitle:'Über diese App',
    aboutText:'Eine kostenlose Lern-App für Kinder, die das Lesen und Stellen einer analogen Uhr üben möchten. Verfügbar in Deutsch, Italienisch, Englisch und Japanisch.\n\nDer Fortschritt wird lokal auf diesem Gerät gespeichert – keine Registrierung, keine Werbung, keine externe Datenübertragung.\n\nDiese App wurde für den privaten Gebrauch entwickelt und wird ohne Gewähr bereitgestellt. Sie dient ausschliesslich zu Lernzwecken.',
    fb:{ correct:'Super gemacht! 🌟', wrong:'Fast! Versuch es nochmal.', hint:'Kurzer Zeiger = Stunden, langer Zeiger = Minuten.' }
  },
  it: {
    name:'Italiano', flag:'🇮🇹',
    appTitle:"⏰ Metti l'orologio!", appSub:"Impara a leggere l'orologio",
    whoPlays:'Chi gioca?', newProfile:'Nuovo profilo', profileName:'Inserisci il nome…',
    modes:["Leggere l'ora","Spostare le lancette","Testo → Orologio","Orologio → Frase","🔢 Numeri"],
    numMode:'Scrivere i numeri',
    numTask:(n)=>`Come si scrive il numero ${n}?`,
    numSub:()=>'Scrivi il numero in lettere.',
    numPlaceholder:'es. diciassette',
    numPopupTitle:'Esercizio numeri! 🔢',
    numPopupSub:'Pausa breve — scrivi questo numero in lettere:',
    numStatsTitle:'Statistiche numeri',
    numStatsTotal:'Totale',
    levels:['Facile','Medio','Difficile'],
    correct:'Corretti', total:'Totale', streak:'Serie', level:'Livello:',
    check:'Verifica', next:'Avanti ➜', hint:'Suggerimento 💡', reset:'↺',
    readTask:()=>"Che ora è?", readSub:()=>'Scegli la risposta corretta.',
    setTask:(h,m)=>`Metti l'orologio alle ${fmtTime(h,m,'it')}`, setSub:()=>'Usa i cursori o trascina le lancette.',
    textSetTask:()=>"Imposta le lancette!", textSetSub:()=>"Leggi il testo e imposta l'orologio.",
    wordTask:()=>"Ordine corretto?", wordSub:()=>"Tocca le parole nell'ordine corretto.",
    wordBankLabel:'Parole disponibili:', wordAnswerLabel:'La tua risposta:',
    settingsTitle:'Impostazioni', timerLabel:'Timer', speechLabel:'Leggi ad alta voce',
    soundLabel:'Suono', langLabel:'Lingua', resetLabel:'Azzera i progressi',
    timerOpts:['No','5s','10s','15s'], badgesTitle:'Medaglie',
    dailyText:'Compito del giorno:', on:'SÌ', off:'NO', pathLabel:'Percorso',
    sliderHours:'Ore', sliderMinutes:'Minuti',
    modeDetails:'Dettagli per modalità',
    localStorageHint:'⚠️ I tuoi progressi vengono salvati localmente su questo dispositivo. Se cancelli la cache del browser o i dati dell\'app, le statistiche andranno perse.',
    aboutTitle:"Informazioni sull'app",
    aboutText:"Un'app educativa gratuita per bambini che vogliono imparare a leggere e impostare un orologio analogico. Disponibile in tedesco, italiano, inglese e giapponese.\n\nI progressi vengono salvati localmente su questo dispositivo – nessuna registrazione, nessuna pubblicità, nessun trasferimento di dati esterni.\n\nQuesta app è stata sviluppata per uso privato e viene fornita senza garanzia. È destinata esclusivamente a scopi didattici.",
    fb:{ correct:'Bravo! 🌟', wrong:'Quasi! Riprova.', hint:'Lancetta corta = ore, lunga = minuti.' }
  },
  en: {
    name:'English', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    appTitle:'⏰ Set the Clock!', appSub:'Learn to read and set the clock',
    whoPlays:'Who is playing?', newProfile:'New profile', profileName:'Enter name…',
    modes:['Read the clock','Set the clock','Text → Clock','Clock → Sentence','🔢 Numbers'],
    numMode:'Write numbers',
    numTask:(n)=>`How do you write the number ${n}?`,
    numSub:()=>'Type the number as a word.',
    numPlaceholder:'e.g. seventeen',
    numPopupTitle:'Number exercise! 🔢',
    numPopupSub:'Short break — write this number as a word:',
    numStatsTitle:'Number statistics',
    numStatsTotal:'Total',
    levels:['Easy','Medium','Hard'],
    correct:'Correct', total:'Total', streak:'Streak', level:'Level:',
    check:'Check', next:'Next ➜', hint:'Hint 💡', reset:'↺',
    readTask:()=>'What time is it?', readSub:()=>'Choose the correct time.',
    setTask:(h,m)=>`Set the clock to ${fmtTime(h,m,'en')}`, setSub:()=>'Use the sliders or drag the hands.',
    textSetTask:()=>'Set the hands correctly!', textSetSub:()=>'Read the text and set the clock.',
    wordTask:()=>'Correct order?', wordSub:()=>'Tap the words in the correct order.',
    wordBankLabel:'Available words:', wordAnswerLabel:'Your answer:',
    settingsTitle:'Settings', timerLabel:'Time limit', speechLabel:'Read aloud',
    soundLabel:'Sound', langLabel:'Language', resetLabel:'Reset progress',
    timerOpts:['Off','5s','10s','15s'], badgesTitle:'Badges',
    dailyText:'Daily task:', on:'ON', off:'OFF', pathLabel:'Learning path',
    sliderHours:'Hours', sliderMinutes:'Minutes',
    modeDetails:'Details per mode',
    localStorageHint:'⚠️ Your progress is saved locally on this device. If you clear the browser cache or app data, your statistics will be lost.',
    aboutTitle:'About this app',
    aboutText:'A free learning app for children who want to practise reading and setting an analogue clock. Available in German, Italian, English and Japanese.\n\nProgress is saved locally on this device – no registration, no advertising, no external data transfer.\n\nThis app was developed for private use and is provided without warranty. It is intended for educational purposes only.',
    fb:{ correct:'Well done! 🌟', wrong:'Almost! Try again.', hint:'Short hand = hours, long hand = minutes.' }
  },
  ja: {
    name:'日本語', flag:'🇯🇵',
    appTitle:'⏰ 時計を合わせよう！', appSub:'時計の読み方と合わせ方を練習しよう',
    whoPlays:'だれがやる？', newProfile:'新しいプロフィール', profileName:'名前を入力…',
    modes:['時計を読む','針を合わせる','テキスト→時計','時計→文章','🔢 数字'],
    numMode:'数字を書く',
    numTask:(n)=>`${n}はどう書きますか？`,
    numSub:()=>'数字を言葉で入力してください。',
    numPlaceholder:'例：じゅうなな',
    numPopupTitle:'数字の練習！🔢',
    numPopupSub:'少し休憩 — この数字を言葉で書いてください：',
    numStatsTitle:'数字の統計',
    numStatsTotal:'合計',
    levels:['かんたん','ふつう','むずかしい'],
    correct:'正解', total:'合計', streak:'連続', level:'レベル:',
    check:'確認', next:'次へ ➜', hint:'ヒント 💡', reset:'↺',
    readTask:()=>'何時ですか？', readSub:()=>'正しい時刻を選んでください。',
    setTask:(h,m)=>`${fmtTime(h,m,'ja')}に合わせてください`, setSub:()=>'スライダーか針をドラッグしてください。',
    textSetTask:()=>'針を正しく合わせてください！', textSetSub:()=>'テキストを読んで時計を合わせてください。',
    wordTask:()=>'正しい順番は？', wordSub:()=>'正しい順番で言葉をタップしてください。',
    wordBankLabel:'使える言葉：', wordAnswerLabel:'あなたの答え：',
    settingsTitle:'設定', timerLabel:'タイマー', speechLabel:'読み上げ',
    soundLabel:'サウンド', langLabel:'言語', resetLabel:'進捗をリセット',
    timerOpts:['なし','5秒','10秒','15秒'], badgesTitle:'バッジ',
    dailyText:'今日の課題：', on:'オン', off:'オフ', pathLabel:'学習パス',
    sliderHours:'時', sliderMinutes:'分',
    modeDetails:'モード別詳細',
    localStorageHint:'⚠️ 進捗はこのデバイスにローカルに保存されます。ブラウザのキャッシュやアプリデータを削除すると、統計が失われます。',
    aboutTitle:'このアプリについて',
    aboutText:'アナログ時計の読み方と合わせ方を練習したい子どもたちのための無料学習アプリです。ドイツ語・イタリア語・英語・日本語に対応しています。\n\n進捗はこのデバイスにローカルに保存されます。登録不要・広告なし・外部データ転送なし。\n\nこのアプリは個人使用のために開発されたものであり、保証なしで提供されています。教育目的のみを意図しています。',
    fb:{ correct:'よくできました！🌟', wrong:'惜しい！もう一度。', hint:'短い針が時、長い針が分です。' }
  }
};

const DIFFS = {
  0: { minutes: [0, 30] },
  1: { minutes: [0, 15, 30, 45] },
  2: { minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] }
};

// Number words — 0–24 plus tens 30–100 per language
const NUM_WORDS = {
  de: {
    0:'null',1:'eins',2:'zwei',3:'drei',4:'vier',5:'fünf',6:'sechs',7:'sieben',8:'acht',9:'neun',
    10:'zehn',11:'elf',12:'zwölf',13:'dreizehn',14:'vierzehn',15:'fünfzehn',16:'sechzehn',
    17:'siebzehn',18:'achtzehn',19:'neunzehn',20:'zwanzig',21:'einundzwanzig',22:'zweiundzwanzig',
    23:'dreiundzwanzig',24:'vierundzwanzig',
    30:'dreissig',40:'vierzig',50:'fünfzig',60:'sechzig',70:'siebzig',80:'achtzig',90:'neunzig',100:'hundert'
  },
  it: {
    0:'zero',1:'uno',2:'due',3:'tre',4:'quattro',5:'cinque',6:'sei',7:'sette',8:'otto',9:'nove',
    10:'dieci',11:'undici',12:'dodici',13:'tredici',14:'quattordici',15:'quindici',16:'sedici',
    17:'diciassette',18:'diciotto',19:'diciannove',20:'venti',21:'ventuno',22:'ventidue',
    23:'ventitré',24:'ventiquattro',
    30:'trenta',40:'quaranta',50:'cinquanta',60:'sessanta',70:'settanta',80:'ottanta',90:'novanta',100:'cento'
  },
  en: {
    0:'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',
    10:'ten',11:'eleven',12:'twelve',13:'thirteen',14:'fourteen',15:'fifteen',16:'sixteen',
    17:'seventeen',18:'eighteen',19:'nineteen',20:'twenty',21:'twenty-one',22:'twenty-two',
    23:'twenty-three',24:'twenty-four',
    30:'thirty',40:'forty',50:'fifty',60:'sixty',70:'seventy',80:'eighty',90:'ninety',100:'one hundred'
  },
  ja: {
    0:'ゼロ',1:'いち',2:'に',3:'さん',4:'し',5:'ご',6:'ろく',7:'しち',8:'はち',9:'く',
    10:'じゅう',11:'じゅういち',12:'じゅうに',13:'じゅうさん',14:'じゅうし',15:'じゅうご',
    16:'じゅうろく',17:'じゅうしち',18:'じゅうはち',19:'じゅうく',20:'にじゅう',
    21:'にじゅういち',22:'にじゅうに',23:'にじゅうさん',24:'にじゅうし',
    30:'さんじゅう',40:'よんじゅう',50:'ごじゅう',60:'ろくじゅう',70:'ななじゅう',80:'はちじゅう',90:'きゅうじゅう',100:'ひゃく'
  }
};

// All numbers in the exercise pool (0–24 + tens 30–100)
const NUM_POOL = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,30,40,50,60,70,80,90,100];
