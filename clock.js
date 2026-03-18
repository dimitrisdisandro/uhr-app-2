// clock.js — SVG clock rendering and drag interaction

const Clock = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 220, CX = 110, CY = 110, R = 100;

  function mk(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function draw(svgEl, h, m, interactive, draggingHand) {
    svgEl.innerHTML = '';
    // Shadow + face
    svgEl.appendChild(mk('circle', {cx:CX,cy:CY,r:R+2,fill:'rgba(0,0,0,0.06)'}));
    svgEl.appendChild(mk('circle', {cx:CX,cy:CY,r:R,fill:'#fff',stroke:'#cbd5e1','stroke-width':'2.5'}));
    svgEl.appendChild(mk('circle', {cx:CX,cy:CY,r:R-4,fill:'none',stroke:'#f1f5f9','stroke-width':'1'}));

    // Ticks
    for (let i = 0; i < 60; i++) {
      const ang = (i/60)*2*Math.PI - Math.PI/2;
      const isH = i%5===0, isBig = i%15===0;
      const r1 = isBig ? R-17 : isH ? R-12 : R-7;
      svgEl.appendChild(mk('line', {
        x1: CX+Math.cos(ang)*(R-2), y1: CY+Math.sin(ang)*(R-2),
        x2: CX+Math.cos(ang)*r1,   y2: CY+Math.sin(ang)*r1,
        stroke: isBig?'#334155':isH?'#475569':'#cbd5e1',
        'stroke-width': isBig?'3':isH?'2':'1', 'stroke-linecap':'round'
      }));
    }

    // Numbers
    for (let i = 1; i <= 12; i++) {
      const ang = (i/12)*2*Math.PI - Math.PI/2;
      const t = mk('text', {
        x: CX+Math.cos(ang)*(R-26), y: CY+Math.sin(ang)*(R-26)+5,
        'text-anchor':'middle','font-size':'14','font-weight':'700',
        fill:'#1e293b','font-family':'system-ui,sans-serif'
      });
      t.textContent = i;
      svgEl.appendChild(t);
    }

    // Hour hand
    const hAng = ((h%12)/12 + m/720) * 2*Math.PI - Math.PI/2;
    const hLen = R * 0.52;
    svgEl.appendChild(mk('line', {
      x1: CX-Math.cos(hAng)*13, y1: CY-Math.sin(hAng)*13,
      x2: CX+Math.cos(hAng)*hLen, y2: CY+Math.sin(hAng)*hLen,
      stroke: (interactive && draggingHand==='hour') ? '#2563eb' : '#1e293b',
      'stroke-width':'7','stroke-linecap':'round'
    }));

    // Minute hand
    const mAng = (m/60) * 2*Math.PI - Math.PI/2;
    const mLen = R * 0.73;
    svgEl.appendChild(mk('line', {
      x1: CX-Math.cos(mAng)*15, y1: CY-Math.sin(mAng)*15,
      x2: CX+Math.cos(mAng)*mLen, y2: CY+Math.sin(mAng)*mLen,
      stroke: (interactive && draggingHand==='minute') ? '#2563eb' : '#64748b',
      'stroke-width':'4.5','stroke-linecap':'round'
    }));

    // Center
    svgEl.appendChild(mk('circle', {cx:CX,cy:CY,r:6,fill:'#1e293b'}));
    svgEl.appendChild(mk('circle', {cx:CX,cy:CY,r:2.5,fill:'#fff'}));

    // Drag handles
    if (interactive) {
      const hTx = CX+Math.cos(hAng)*hLen, hTy = CY+Math.sin(hAng)*hLen;
      const mTx = CX+Math.cos(mAng)*mLen, mTy = CY+Math.sin(mAng)*mLen;
      const hh = mk('circle',{cx:hTx,cy:hTy,r:16,fill:'rgba(37,99,235,0.14)',stroke:'#2563eb','stroke-width':'2.5','stroke-dasharray':'5 3',cursor:'grab'});
      hh.dataset.hand = 'hour'; svgEl.appendChild(hh);
      const mh = mk('circle',{cx:mTx,cy:mTy,r:13,fill:'rgba(100,116,139,0.1)',stroke:'#94a3b8','stroke-width':'2','stroke-dasharray':'4 3',cursor:'grab'});
      mh.dataset.hand = 'minute'; svgEl.appendChild(mh);
    }
  }

  function getAngle(e) {
    const svg = document.getElementById('clock-svg');
    const rect = svg.getBoundingClientRect();
    const sx = W/rect.width, sy = W/rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return Math.atan2((cy-rect.top)*sy - CY, (cx-rect.left)*sx - CX) + Math.PI/2;
  }

  function snapM(ang, diff) {
    const mins = DIFFS[diff].minutes;
    let raw = ((ang/(2*Math.PI))*60+60)%60, best = mins[0], bd = 999;
    for (const m of mins) { const d=Math.min(Math.abs(raw-m),60-Math.abs(raw-m)); if(d<bd){bd=d;best=m;} }
    return best;
  }

  function snapH(ang) { return Math.round(((ang/(2*Math.PI))*12+12)%12)%12||12; }

  return { draw, getAngle, snapM, snapH };
})();
