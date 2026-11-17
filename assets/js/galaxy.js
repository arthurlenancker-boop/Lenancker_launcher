/* ============================================================
   Galaxie — moteur Canvas 2D de la page d'accueil (index.html).
   Mécanique de la reconstitution WebGL validée en maquette
   (source : page d'accueil reconstituée, galaxie rotative) :
   bras d'Archimède ×6 (1,05 tour), tapis roulant des cartes,
   rotation -50°/min, wobble, vague de révélation, aberration RVB,
   champ de curseur, ondulations de clic.

   Adaptations pour le launcher réel :
   - lit window.LENANCKER_APPS (assets/js/apps.js) au lieu d'une
     const locale ; galaxyIcon en priorité sur icon ;
   - les cartes sont cliquables : un clic ouvre l'app (app.href) ;
     le curseur passe en main au survol ;
   - le HUD affiche le nom de l'app survolée à la place des
     coordonnées polaires.

   Architecture optimisée :
   - sous-jacent précalculé en Path2D : zéro géométrie reconstruite par frame ;
   - lueur d'accent pré-rendue en sprite (plus de dégradé par frame) ;
   - couleurs de thème lues une seule fois, invalidées au basculement ;
   - textures pré-rastérisées en niveaux 256/128/64/32 (mipmaps)
     avec variantes R/V/B par niveau : drawImage sans ré-échantillonnage SVG ;
   - ombres portées pré-floutées en sprites : plus de shadowBlur par carte ;
   - flou d'intro quantifié au demi-pixel, filtre coupé dès qu'inutile ;
   - rect du hero mis en cache, invalidé seulement au défilement ;
   - boucle suspendue quand le hero quitte l'écran (IntersectionObserver) ;
   - prefers-reduced-motion : une seule image statique, aucune boucle.
   ============================================================ */
(function(){
'use strict';
  const T = {
    arms:6, turns:1.05, rMaxFrac:.7, birthFrac:.08, cardN:64, tunedMpx:1.65,
    cardHFrac:.25, armJitter:.76, ticksPerArm:16, circFrac:.56,
    idleSpeed:.57, scrub:.2, spinDeg:-50, wobbleAmp:6, wobbleFreq:.25,
    introDur:4, rollChunk:.12, burstX:3, burstDur:2.5, waveBand:220,
    waveAber:.2, waveLag:.4,
    fieldPx:320, tugPx:8, flareAdd:.032, holdTau:.15,
    restTau:1, holdWobble:1.2, rippleSpeed:900, rippleWidth:140,
    rippleAmp:.016, rippleWarp:22, rippleLife:1.8, clickDur:.75
  };
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvas = document.getElementById('galaxy');
  if(!canvas){ return; }
  /* Registre des apps (assets/js/apps.js) : le moteur ne tourne pas sans lui. */
  const APPS = window.LENANCKER_APPS || [];
  if(!APPS.length){ return; }
  const ctx = canvas.getContext('2d');
  const hero = document.getElementById('hero');
  const coordhud = document.getElementById('coordhud');
  const wordmark = document.querySelector('.wordmark');
  const rootEl = document.documentElement;
  let W=0, H=0, DPR=1;
  let lastHoverCursor=-1;

  /* ---- couleurs de thème : lues une fois, rafraîchies au basculement ---- */
  let lineCol='rgba(255,255,255,.16)', accentCol='#ff5310', pulseSprite=null;
  function cssVar(name){
    const v = getComputedStyle(rootEl).getPropertyValue(name);
    return typeof v==='string' ? v.trim() : '';
  }
  function hexRgb(h){
    const m=/^#([0-9a-f]{6})$/i.exec(h);
    if(!m){ return '255,83,16'; }
    const n=parseInt(m[1],16);
    return ((n>>16)&255)+','+((n>>8)&255)+','+(n&255);
  }
  function bakePulse(){
    const c=document.createElement('canvas'); c.width=c.height=36;
    const g=c.getContext('2d');
    const grd=g.createRadialGradient(18,18,0,18,18,18);
    grd.addColorStop(0,'rgba('+hexRgb(accentCol)+',.55)');
    grd.addColorStop(1,'rgba('+hexRgb(accentCol)+',0)');
    g.fillStyle=grd; g.fillRect(0,0,36,36);
    pulseSprite=c;
  }
  function refreshTheme(){
    lineCol=cssVar('--line')||'rgba(255,255,255,.16)';
    accentCol=cssVar('--accent')||'#ff5310';
    bakePulse();
  }
  if(window.MutationObserver){
    new MutationObserver(refreshTheme).observe(rootEl,{attributes:true,attributeFilter:['class']});
  }

  /* ---- textures : mipmaps pré-rastérisées + variantes RVB + ombres ---- */
  const MIPL=[256,128,64,32];
  const tex=[];      /* tex[app][niveau] = { img, r, g, b } */
  let shadows=[];    /* shadows[niveau] = { c, pad } */
  function raster(img,size){
    const c=document.createElement('canvas'); c.width=c.height=size;
    c.getContext('2d').drawImage(img,0,0,size,size);
    return c;
  }
  function channel(base,color){
    const c=document.createElement('canvas'); c.width=c.height=base.width;
    const g=c.getContext('2d');
    g.drawImage(base,0,0);
    g.globalCompositeOperation='multiply'; g.fillStyle=color; g.fillRect(0,0,c.width,c.height);
    g.globalCompositeOperation='destination-in'; g.drawImage(base,0,0);
    return c;
  }
  function shadowBake(size){
    const r=size*.25, pad=Math.ceil(r)+4, side=size+2*pad;
    const c=document.createElement('canvas'); c.width=c.height=side;
    const g=c.getContext('2d');
    const rr=function(x,y,w,h,k){
      g.beginPath(); g.moveTo(x+k,y);
      g.arcTo(x+w,y,x+w,y+h,k); g.arcTo(x+w,y+h,x,y+h,k);
      g.arcTo(x,y+h,x,y,k); g.arcTo(x,y,x+w,y,k); g.closePath();
    };
    if('filter' in g){
      g.filter='blur('+r+'px)'; g.fillStyle='#000';
      rr(pad,pad,size,size,size*.2); g.fill(); g.filter='none';
    }else{
      g.shadowColor='rgba(0,0,0,1)'; g.shadowBlur=r; g.fillStyle='#000';
      rr(pad,pad,size,size,size*.2); g.fill();
    }
    return {c:c,pad:pad};
  }
  let texReady=false;
  function loadTextures(done){
    let pending=APPS.length;
    APPS.forEach(function(a,i){
      const img=new Image();
      img.onload=function(){
        const levels=[];
        for(let m=0;m<MIPL.length;m++){
          const b=raster(img,MIPL[m]);
          levels.push({img:b, r:channel(b,'#f00'), g:channel(b,'#0f0'), b:channel(b,'#00f')});
        }
        tex[i]=levels;
        if(--pending===0){
          if(!shadows.length){ shadows=MIPL.map(shadowBake); }
          texReady=true; done&&done();
        }
      };
      img.onerror=function(){ if(--pending===0){ texReady=true; done&&done(); } };
      img.src=a.galaxyIcon||a.icon;
    });
  }

  /* ---- état ---- */
  const S={ time:0, G:0, spin:0, lastP:0, holdTarget:0, holdRest:0, fieldK:1,
    targetI:-1, frameEma:1/60, perfScale:1, lastClicks:0, pointer:{x:0,y:0,on:false,clicks:0} };
  const ripples=[], punches=[];
  let cards=[], paintOrder=[], started=0, lastT=0, L=null;
  const fract=function(x){ return x-Math.floor(x); };

  /* ---- géométrie du sous-jacent : précalculée une fois par mise en page ---- */
  let P_arms=null, P_ticks=null, P_circle=null;
  function buildGeometry(L){
    P_arms=new Path2D();
    for(let a=0;a<L.arms;a++){
      const ph=a*Math.PI*2/L.arms;
      for(let n=0;n<=140;n++){
        const u=L.thetaBirth+n/140*(L.thetaExit-L.thetaBirth);
        const r=L.c*u, ang=u+ph;
        if(n){ P_arms.lineTo(r*Math.cos(ang),r*Math.sin(ang)); }
        else{ P_arms.moveTo(r*Math.cos(ang),r*Math.sin(ang)); }
      }
    }
    P_ticks=new Path2D();
    for(let a=0;a<L.arms;a++){
      const ph=a*Math.PI*2/L.arms;
      for(let k=0;k<T.ticksPerArm;k++){
        const u=L.thetaMax*(.45+.55*(k+.5)/T.ticksPerArm);
        const r=L.c*u, ang=u+ph, cs=Math.cos(ang), sn=Math.sin(ang);
        P_ticks.moveTo((r-5)*cs,(r-5)*sn); P_ticks.lineTo((r+5)*cs,(r+5)*sn);
      }
    }
    P_circle=new Path2D();
    P_circle.arc(0,0,L.circFrac*L.rMax,0,Math.PI*2);
  }

  function layout(){
    const mpx=W*H/1e6, mob=mpx<.6;
    const arms=mob?3:T.arms, turns=mob?.7:T.turns;
    const cardN=mob?14:Math.max(6,Math.min(T.cardN,Math.round(T.cardN*mpx/T.tunedMpx)));
    const halfDiag=Math.hypot(W,H)/2;
    const rMax=(mob?.8:T.rMaxFrac)*halfDiag;
    const thetaMax=turns*Math.PI*2;
    const c=rMax/thetaMax;
    const cardH=Math.min(340,Math.max(70,H*(mob?.3:T.cardHFrac)));
    const thetaBirth=T.birthFrac*thetaMax;
    const thetaExit=(halfDiag+1.5*cardH)/c;
    const slotsPerArm=Math.max(1,Math.ceil(cardN/arms));
    const keep=wordmark?wordmark.getBoundingClientRect():null;
    const heroBox=hero.getBoundingClientRect();
    const keepW=keep&&keep.width?Math.min(keep.width, W*.6)/2:120;
    const keepH=keep&&keep.height?Math.min(keep.height,H*.3)/2:40;
    return {arms:arms,cardN:cardN,rMax:rMax,thetaMax:thetaMax,c:c,cardH:cardH,
            thetaBirth:thetaBirth,thetaExit:thetaExit,slotsPerArm:slotsPerArm,
            keepW:keepW,keepH:keepH,mob:mob,
            cx:heroBox.width/2, cy:heroBox.height/2};
  }
  function buildCards(L){
    cards=[];
    for(let i=0;i<L.cardN;i++){
      cards.push({clip:i%APPS.length, arm:i%L.arms, slot:Math.floor(i/L.arms),
                  p:0, x:0, y:0, size:0, flare:0, _pAdv:0, _dist:0});
    }
    paintOrder=cards.map(function(_,i){ return i; })
      .sort(function(a,b){ return fract(.618034*a)-fract(.618034*b); });
  }
  function resize(){
    const r=hero.getBoundingClientRect();
    DPR=Math.min(2,window.devicePixelRatio||1);
    W=Math.max(1,Math.round(r.width)); H=Math.max(1,Math.round(r.height));
    canvas.width=W*DPR; canvas.height=H*DPR;
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  /* ---- rect du hero : cache, invalidé au défilement et au redimensionnement ---- */
  let heroRect=null, rectDirty=true;
  window.addEventListener('scroll',function(){ rectDirty=true; },{passive:true});
  function heroBox(){
    if(rectDirty||!heroRect){ heroRect=hero.getBoundingClientRect(); rectDirty=false; }
    return heroRect;
  }

  /* ---- vague de révélation ---- */
  function wave(t){
    if(!started){ return {W:0,E:0,front:-1e5}; }
    const Wv=Math.min(1,t/T.introDur);
    const E=1-Math.pow(1-Wv,3);
    return {W:Wv,E:E,front:E*(L.rMax+L.cardH*2)};
  }

  /* ---- sous-jacent : 3 traits de Path2D + 6 sprites de lueur ---- */
  function drawUnderlay(t){
    ctx.save();
    ctx.translate(L.cx,L.cy); ctx.rotate(S.spin);
    ctx.strokeStyle=lineCol; ctx.lineWidth=1;
    ctx.globalAlpha=.5; ctx.stroke(P_arms);
    ctx.globalAlpha=.6; ctx.stroke(P_ticks);
    ctx.setLineDash([6,8]); ctx.stroke(P_circle); ctx.setLineDash([]);
    if(pulseSprite){
      for(let a=0;a<L.arms;a++){
        const ph=a*Math.PI*2/L.arms;
        const u=L.thetaBirth+fract(t*.055+a/L.arms)*(L.thetaExit-L.thetaBirth);
        const r=L.c*u, ang=u+ph;
        ctx.drawImage(pulseSprite,r*Math.cos(ang)-18,r*Math.sin(ang)-18);
      }
    }
    ctx.restore(); ctx.globalAlpha=1;
  }

  /* ---- carte : mipmap adaptée, ombre sprite, aberration RVB ---- */
  function drawCard(card, alpha, blur, aber, scale){
    const lv=tex[card.clip]; if(!lv||alpha<=.004){ return; }
    const s=card.size*scale, x=card.x, y=card.y;
    const dpx=s*DPR;
    const mi=dpx<=44?3:dpx<=92?2:dpx<=184?1:0;
    const m=lv[mi], sh=shadows[mi], ms=MIPL[mi];
    ctx.globalAlpha=alpha;
    if(sh&&s>=28){
      ctx.globalAlpha=alpha*.135;
      const ps=sh.pad*s/ms;
      ctx.drawImage(sh.c, x-s/2-ps, y-s/2-ps+s*.107, sh.c.width*s/ms, sh.c.height*s/ms);
      ctx.globalAlpha=alpha;
    }
    ctx.imageSmoothingQuality='high';
    const b=blur>.35?Math.round(blur*2)/2:0;
    if(b){ ctx.filter='blur('+b+'px)'; }
    if(aber>.004){
      const off=Math.min(14,aber*s);
      ctx.globalCompositeOperation='lighter';
      ctx.drawImage(m.r, x-s/2+off, y-s/2, s, s);
      ctx.drawImage(m.g, x-s/2, y-s/2, s, s);
      ctx.drawImage(m.b, x-s/2-off, y-s/2, s, s);
      ctx.globalCompositeOperation='source-over';
    }else{
      ctx.drawImage(m.img, x-s/2, y-s/2, s, s);
    }
    if(b){ ctx.filter='none'; }
    ctx.globalAlpha=1;
  }

  /* ---- un pas de simulation + rendu ---- */
  function step(now){
    if(!texReady||!L){ return; }
    now/=1000;
    let dt=Math.min(.05,now-(lastT||now)); lastT=now;
    S.time+=dt;
    const t=S.time;

    /* gouverneur FPS -> perfScale */
    S.frameEma+=((1/Math.max(dt,.001))-S.frameEma)*.02;
    if(t>4&&S.frameEma<30){ S.perfScale=Math.max(.35,S.perfScale-.3*dt); }
    else if(S.frameEma>42){ S.perfScale=Math.min(1,S.perfScale+.05*dt); }
    const visCount=Math.max(6,Math.round(cards.length*S.perfScale));

    /* tapis + rotation */
    const burst=1+(T.burstX-1)*(1-Math.min(1,Math.max(0,(t-(started||0))/T.burstDur)));
    const idle=T.idleSpeed*burst/60;
    S.G+=dt*idle;
    S.spin+=dt*T.spinDeg*Math.PI/180/60*(1-S.holdRest);
    const G=S.G+window.scrollY*T.scrub/1e3;
    const Gd=G-S.lastP; S.lastP=G;

    const hasTarget=S.targetI>=0;
    S.holdTarget+=((hasTarget?1:0)-S.holdTarget)*(1-Math.exp(-dt/T.holdTau));
    S.holdRest+=((hasTarget?1:0)-S.holdRest)*(1-Math.exp(-dt/T.restTau));
    S.fieldK+=((hasTarget?0:1)-S.fieldK)*(1-Math.exp(-dt/.12));

    const wv=wave(t-started);
    const cos=Math.cos(S.spin), sin=Math.sin(S.spin);
    const hr=heroBox();
    const px=S.pointer.x-hr.left, py=S.pointer.y-hr.top;

    ctx.clearRect(0,0,W,H);
    drawUnderlay(t-started);

    /* détection hover (ordre de peinture inversé = dessus d'abord) */
    let hoverI=-1;
    if(S.pointer.on){
      for(let n=Math.min(visCount,cards.length)-1;n>=0;n--){
        const i=paintOrder[n], c=cards[i];
        if(Math.abs(px-c.x)<=c.size/2+8&&Math.abs(py-c.y)<=c.size/2+8){ hoverI=i; break; }
      }
    }
    S.targetI=hoverI;
    /* curseur main sur une carte cliquable (garde anti-thrash) */
    if(hoverI!==lastHoverCursor){
      lastHoverCursor=hoverI;
      canvas.style.cursor = hoverI>=0 ? 'pointer' : '';
    }

    /* ripples et punches */
    if(S.pointer.clicks!==S.lastClicks){
      S.lastClicks=S.pointer.clicks;
      ripples.push({x:px,y:py,start:t});
      if(ripples.length>8){ ripples.shift(); }
      if(hoverI>=0){
        punches.push({i:hoverI,start:t});
        if(punches.length>8){ punches.shift(); }
      }
    }
    let nr=ripples.length;
    while(nr>0){ if(t-ripples[nr-1].start>T.rippleLife){ ripples.splice(nr-1,1); } nr--; }
    let np=punches.length;
    while(np>0){ if(t-punches[np-1].start>T.clickDur){ punches.splice(np-1,1); } np--; }

    /* positions */
    const heldBase=S.holdRest;
    for(let i=0;i<cards.length;i++){
      const c=cards[i];
      const held=(i===S.targetI)?Math.max(S.holdTarget,heldBase):heldBase;
      c._pAdv=(c.slot+.5+c.arm*T.armJitter)/L.slotsPerArm+G;
      c._pAdv-=Gd*held;
      let p=fract(c._pAdv);
      const roll=-T.rollChunk*(1-wv.E);
      p=Math.max(0,p+roll);
      c.p=p;
      const theta=L.thetaBirth+p*(L.thetaExit-L.thetaBirth);
      const r=L.c*theta;
      const ang=theta+c.arm*Math.PI*2/L.arms;
      /* wobble */
      const wob=T.wobbleAmp*(1+(T.holdWobble-1)*S.holdRest);
      const wp=Math.sin((t-started)*T.wobbleFreq*Math.PI*2+2.399*i);
      const wf=Math.cos((t-started)*T.wobbleFreq*Math.PI*1.4+1.713*i);
      let x=r*Math.cos(ang)+wob*(-(wp*Math.sin(ang))+.6*wf*Math.cos(ang));
      let y=r*Math.sin(ang)+wob*(wp*Math.cos(ang)+.6*wf*Math.sin(ang));
      /* rotation globale (les cartes restent droites) */
      const rx=x*cos-y*sin, ry=x*sin+y*cos;
      x=L.cx+rx; y=L.cy+ry;
      /* tug vers le curseur */
      if(S.pointer.on&&S.fieldK>.001){
        const dx=px-x, dy=py-y, d2=dx*dx+dy*dy;
        const k=T.tugPx*Math.exp(-d2/(T.fieldPx*T.fieldPx))*S.fieldK*(i===S.targetI?0:1)/Math.max(1,Math.sqrt(d2));
        x+=dx*k; y+=dy*k;
      }
      c.x=x; c.y=y;
      /* taille : grandit avec le rayon, plafonné */
      const radialGap=L.c*(L.thetaExit-L.thetaBirth)/L.slotsPerArm;
      c.size=Math.min(L.cardH,Math.max(22,radialGap*.6));
      if(i===S.targetI){ c.size*=1.06; }
      c._dist=Math.hypot(x-L.cx,y-L.cy);
    }

    /* vague de révélation : avant = invisible, bande = rack flou, derrière = net */
    const draw=Math.min(visCount,cards.length);
    for(let n=0;n<draw;n++){
      const i=paintOrder[n], c=cards[i];
      const d=c._dist-(L.keepW*.9);
      let alpha=1, blur=0, aber=.012, scale=1;
      if(wv.W<1){
        const behind=-(d-wv.front);
        if(behind<0){ alpha=0; }
        else{
          const k=Math.min(1,behind/T.waveBand);
          alpha=k;
          blur=(1-k)*12;
          aber=.012+T.waveAber*(1-k)+T.waveAber*Math.max(0,1-Math.abs(behind-T.waveBand*.5)/T.waveBand);
        }
      }
      if(c.p<.05){ const k=c.p/.05; alpha*=k; blur+=(1-k)*6; }
      const inKeep=Math.abs(c.x-L.cx)<L.keepW+10&&Math.abs(c.y-L.cy)<L.keepH+10;
      if(inKeep){ alpha*=.35; }
      if(Math.abs(c.x-L.cx)>W/2+c.size||Math.abs(c.y-L.cy)>H/2+c.size){ alpha=0; }
      let warp=0;
      for(let j=0;j<ripples.length;j++){
        const rp=ripples[j], age=t-rp.start, rr2=age*T.rippleSpeed;
        const dr=Math.abs(Math.hypot(c.x-rp.x,c.y-rp.y)-rr2);
        const k=Math.max(0,1-dr/T.rippleWidth)*Math.max(0,1-age/T.rippleLife);
        aber+=T.rippleAmp*k*8;
        if(k*T.rippleWarp/c.size>warp){ warp=k*T.rippleWarp/c.size; }
      }
      for(let j=0;j<punches.length;j++){
        const pu=punches[j];
        if(pu.i===i){
          const k=Math.sin(Math.min(1,(t-pu.start)/T.clickDur)*Math.PI);
          aber+=.05*k;
          if(.05*k>warp){ warp=.05*k; }
        }
      }
      if(S.pointer.on){
        const d2=(px-c.x)*(px-c.x)+(py-c.y)*(py-c.y);
        const k=Math.exp(-d2/(T.fieldPx*T.fieldPx));
        c.flare+=((T.flareAdd*k*4)-c.flare)*.15;
        aber+=c.flare;
      }else{ c.flare*=.85; }
      drawCard(c,alpha,blur,aber,1+warp);
    }

    /* HUD coordonnées (seulement au-dessus du hero) */
    if(coordhud){
      const inHero=S.pointer.on&&px>=0&&px<=W&&py>=0&&py<=H;
      if(inHero){
        let txt;
        if(hoverI>=0&&cards[hoverI]){
          /* survol d'une carte : nom de l'app, invitation au clic */
          const app=APPS[cards[hoverI].clip];
          txt = app ? app.name+' — clic pour ouvrir' : '';
        }else{
          const dd=Math.hypot(px-L.cx,py-L.cy);
          txt='r '+String(Math.round(dd)).padStart(4,'0')
            +' · θ '+String(Math.round(((Math.atan2(py-L.cy,px-L.cx)*180/Math.PI)+360)%360)).padStart(3,'0')+'°';
        }
        if(txt!=='' && coordhud.textContent!==txt){ coordhud.textContent=txt; }
        coordhud.style.opacity = txt!=='' ? '.85' : '0';
      }else{ coordhud.style.opacity='0'; }
    }
  }

  /* ---- boucle suspendue hors écran ---- */
  let rafId=0, heroOn=true;
  function tick(now){
    rafId=0;
    step(now);
    if(heroOn&&!REDUCED){ rafId=requestAnimationFrame(tick); }
  }
  function resume(){ if(heroOn&&!rafId&&!REDUCED){ rafId=requestAnimationFrame(tick); } }
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      heroOn=es[es.length-1].isIntersecting;
      if(heroOn){ resume(); }
    }).observe(hero);
  }

  /* ---- événements ---- */
  window.addEventListener('pointermove',function(e){ S.pointer.x=e.clientX; S.pointer.y=e.clientY; S.pointer.on=true; },{passive:true});
  window.addEventListener('pointerleave',function(){ S.pointer.on=false; });
  hero.addEventListener('pointerdown',function(){ S.pointer.clicks++; });
  window.addEventListener('blur',function(){ S.pointer.on=false; });
  let resizeTimer;
  window.addEventListener('resize',function(){
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(function(){ resize(); L=layout(); buildCards(L); buildGeometry(L); rectDirty=true; },150);
  });

  /* ---- clic sur une carte : ouvrir l'app correspondante ---- */
  function hitTest(px,py){
    for(let n=cards.length-1;n>=0;n--){
      const i=paintOrder[n], c=cards[i];
      if(c && Math.abs(px-c.x)<=c.size/2+8 && Math.abs(py-c.y)<=c.size/2+8){ return i; }
    }
    return -1;
  }
  canvas.addEventListener('click',function(e){
    const hr=heroBox();
    const i=hitTest(e.clientX-hr.left, e.clientY-hr.top);
    if(i<0){ return; }
    const app=APPS[cards[i].clip];
    if(app && app.href){ window.location.href=app.href; }
  });

  /* ---- démarrage ---- */
  refreshTheme();
  resize(); L=layout(); buildCards(L); buildGeometry(L);
  loadTextures(function(){
    S.time=Math.max(S.time,1); started=S.time;
    const letters=document.querySelectorAll('.wm-letter');
    if(REDUCED){
      /* mouvement réduit : une seule image posée, aucune boucle */
      letters.forEach(function(el){ el.classList.add('in'); });
      S.time=started+T.introDur+.05; lastT=0;
      step(S.time*1000);
    }else{
      letters.forEach(function(el,i){ setTimeout(function(){ el.classList.add('in'); },120*i+150); });
      resume();
    }
  });
  /* --- Pont de tests : expose les internes du moteur à la suite
         automatique (#selftest). Aucune incidence sur le rendu. --- */
  window.__lenanckerGalaxy = {
    T:T, S:S, canvas:canvas, ctx:ctx, hero:hero, coordhud:coordhud, MIPL:MIPL,
    cssVar:cssVar, hexRgb:hexRgb, bakePulse:bakePulse, refreshTheme:refreshTheme,
    raster:raster, channel:channel, shadowBake:shadowBake, loadTextures:loadTextures,
    fract:fract, buildGeometry:buildGeometry, layout:layout, buildCards:buildCards,
    resize:resize, heroBox:heroBox, wave:wave, drawUnderlay:drawUnderlay,
    drawCard:drawCard, step:step, resume:resume,
    get W(){return W;}, get H(){return H;}, get DPR(){return DPR;},
    get lineCol(){return lineCol;}, get accentCol(){return accentCol;},
    get pulse(){return pulseSprite;},
    get tex(){return tex;}, get shadows(){return shadows;}, get ready(){return texReady;},
    get cards(){return cards;}, get paintOrder(){return paintOrder;},
    get ripples(){return ripples;}, get punches(){return punches;},
    get started(){return started;}, set started(v){started=v;},
    get lastT(){return lastT;}, set lastT(v){lastT=v;},
    get L(){return L;}, set L(v){L=v;},
    get geometry(){return {arms:P_arms, ticks:P_ticks, circle:P_circle};},
    get heroOn(){return heroOn;}, set heroOn(v){heroOn=v;},
    get rectDirty(){return rectDirty;}, set rectDirty(v){rectDirty=v;},
    get reduced(){return REDUCED;}
  };
})();
