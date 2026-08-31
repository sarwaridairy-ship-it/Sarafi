(() => {
    const svg = document.getElementById('stage');
    const ns = 'http://www.w3.org/2000/svg';
    const path = document.getElementById('pricePath');
    const glowPath = document.getElementById('pathGlow');
    const chartLayer = document.getElementById('chartLayer');
    const candles = document.getElementById('candles');
    const topPiece = document.getElementById('topPiece');
    const bottomPiece = document.getElementById('bottomPiece');
    const workerLayer = document.getElementById('workerLayer');
    const paperLayer = document.getElementById('paperLayer');
    const centerPiece = document.getElementById('centerPiece');
    const brandName = document.getElementById('brandName');
    const authPage = document.getElementById('authPage');
    const authCard = document.getElementById('authCard');
    const halo = document.getElementById('halo');
    const corePaper = document.getElementById('corePaper');
    const corePaperRect = document.getElementById('corePaperRect');
    const corePaperFold = document.getElementById('corePaperFold');
    const corePaperText = document.getElementById('corePaperText');
    const clamp = (v,a=0,b=1) => Math.min(b,Math.max(a,v));
    const mix = (a,b,t) => a+(b-a)*t;
    const smooth = v => {v=clamp(v);return v*v*(3-2*v)};
    const smoother = v => {v=clamp(v);return v*v*v*(v*(v*6-15)+10)};
    const mixColor=(a,b,t)=>{const n=s=>parseInt(s,16),v=(i)=>Math.round(mix(n(a.slice(i,i+2)),n(b.slice(i,i+2)),t)).toString(16).padStart(2,'0');return`#${v(1)}${v(3)}${v(5)}`};
    const total = path.getTotalLength();
    let middle = total/2, nearest = Infinity;
    for(let i=0;i<=800;i++){
      const l=total*i/800,p=path.getPointAtLength(l),d=(p.x-540)**2+(p.y-960)**2;
      if(d<nearest){nearest=d;middle=l}
    }
    const pointAt = l => {
      l=clamp(l,0,total);
      const p=path.getPointAtLength(l),a=path.getPointAtLength(clamp(l-2,0,total)),b=path.getPointAtLength(clamp(l+2,0,total));
      const dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy)||1,tx=dx/m,ty=dy/m;
      return{x:p.x,y:p.y,tx,ty,nx:-ty,ny:tx,angle:Math.atan2(dy,dx)*180/Math.PI};
    };
    const rotateOffset=(x,y,degrees)=>{const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return{x:x*c-y*s,y:x*s+y*c}};

    const make=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el};
    function createWorker(name,cloth,accent){
      const root=make('g',{class:'worker','aria-label':name,filter:'url(#smallShadow)'});
      const pose=make('g');
      const shadow=make('ellipse',{cx:0,cy:3,rx:31,ry:7,fill:'#01070e',opacity:'.36'});
      const forceMark=make('path',{fill:'none',stroke:accent,'stroke-width':3,'stroke-linecap':'round',opacity:0});
      const legB=make('path',{fill:'none',stroke:'#102d47','stroke-width':10,'stroke-linecap':'round','stroke-linejoin':'round'});
      const legF=make('path',{fill:'none',stroke:'#173f60','stroke-width':11,'stroke-linecap':'round','stroke-linejoin':'round'});
      const footB=make('path',{fill:'none',stroke:'#031321','stroke-width':12,'stroke-linecap':'round'});
      const footF=make('path',{fill:'none',stroke:'#031321','stroke-width':12,'stroke-linecap':'round'});
      const torso=make('path',{fill:cloth,stroke:'#63859a','stroke-width':2});
      const belt=make('path',{fill:'none',stroke:accent,'stroke-width':4,'stroke-linecap':'round'});
      const armB=make('path',{fill:'none',stroke:'#123653','stroke-width':10,'stroke-linecap':'round','stroke-linejoin':'round'});
      const armF=make('path',{fill:'none',stroke:'#1d506e','stroke-width':11,'stroke-linecap':'round','stroke-linejoin':'round'});
      const foreB=make('path',{fill:'none',stroke:'url(#skin)','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round'});
      const foreF=make('path',{fill:'none',stroke:'url(#skin)','stroke-width':9,'stroke-linecap':'round','stroke-linejoin':'round'});
      const handB=make('circle',{r:6,fill:'url(#skin)',stroke:'#f2dbb6','stroke-width':1.5});
      const handF=make('circle',{r:6,fill:'url(#skin)',stroke:'#f2dbb6','stroke-width':1.5});
      const gripB=make('circle',{r:9,fill:'none',stroke:accent,'stroke-width':2.5,opacity:'.75'});
      const gripF=make('circle',{r:9,fill:'none',stroke:accent,'stroke-width':2.5,opacity:'.75'});
      const neck=make('path',{d:'M0 -98V-106',stroke:'#d6ae7e','stroke-width':8,'stroke-linecap':'round'});
      const head=make('circle',{cx:0,cy:-119,r:14,fill:'url(#skin)',stroke:'#714e2d','stroke-width':2});
      const helmet=make('path',{d:'M-15 -121Q-12 -139 1 -139Q15 -138 17 -121Z',fill:'#d4aa50',stroke:'#f1d17b','stroke-width':2});
      const eye=make('circle',{cx:6,cy:-121,r:1.8,fill:'#162535'});
      const nose=make('path',{d:'M10 -118l4 2-4 2',fill:'none',stroke:'#714e2d','stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round'});
      pose.append(shadow,forceMark,legB,legF,footB,footF,torso,belt,neck,armB,armF,foreB,foreF,gripB,gripF,handB,handF,head,eye,nose,helmet);
      root.appendChild(pose);workerLayer.appendChild(root);
      return{root,pose,shadow,forceMark,legB,legF,footB,footF,torso,belt,neck,armB,armF,foreB,foreF,handB,handF,gripB,gripF,head,eye,nose,helmet};
    }
    const upperWorker=createWorker('Upper worker carrying the upper Sarafi piece','url(#clothA)','#d6ac55');
    const lowerWorker=createWorker('Lower worker carrying the lower Sarafi piece','url(#clothB)','#0ca397');

    function twoBone(hipX,hipY,footX,footY,bend){
      const L1=45,L2=47,dx=footX-hipX,dy=footY-hipY,d=Math.min(L1+L2-1,Math.max(9,Math.hypot(dx,dy)));
      const ux=dx/d,uy=dy/d,a=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-a*a));
      return{x:hipX+ux*a-uy*h*bend,y:hipY+uy*a+ux*h*bend};
    }
    function footCycle(c){
      c=((c%1)+1)%1;
      if(c<.62){const s=c/.62;return{x:mix(24,-24,s),y:0}}
      const s=(c-.62)/.38;return{x:mix(-24,24,s),y:-20*Math.sin(Math.PI*s)};
    }
    function arm(worker,shoulder,target,front){
      const dx=target.x-shoulder.x,dy=target.y-shoulder.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
      const elbow={x:shoulder.x+ux*d*.52-uy*(front?8:-8),y:shoulder.y+uy*d*.52+ux*(front?8:-8)};
      const upper=front?worker.armF:worker.armB,fore=front?worker.foreF:worker.foreB,hand=front?worker.handF:worker.handB,grip=front?worker.gripF:worker.gripB;
      upper.setAttribute('d',`M${shoulder.x} ${shoulder.y}Q${(elbow.x-4).toFixed(1)} ${(elbow.y-4).toFixed(1)} ${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)}`);
      fore.setAttribute('d',`M${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)}Q${(target.x-5).toFixed(1)} ${(target.y+2).toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}`);
      hand.setAttribute('cx',target.x);hand.setAttribute('cy',target.y);grip.setAttribute('cx',target.x);grip.setAttribute('cy',target.y);
    }
    function renderCarrier(worker,pieceLength,rootOffset,contact,direction,travel,opacity,effort){
      const basePath=pointAt(pieceLength),base={x:basePath.x+rootOffset.x,y:basePath.y+rootOffset.y},phase=travel/78;
      const stepA=footCycle(phase),stepB=footCycle(phase+.5),cycle=Math.sin(phase*Math.PI*2),bob=2.8*Math.abs(Math.sin(phase*Math.PI)),sway=2.1*cycle,lean=4.5+effort*7;
      const localFromWorld=p=>({x:(p.x-base.x)*direction,y:p.y-base.y});
      const footAt=step=>{
        const p=pointAt(pieceLength+direction*step.x),toe=pointAt(pieceLength+direction*(step.x+15));
        p.x+=rootOffset.x;p.y+=rootOffset.y+step.y;toe.x+=rootOffset.x;toe.y+=rootOffset.y+step.y;
        return{p:localFromWorld(p),toe:localFromWorld(toe)};
      };
      const fA=footAt(stepA),fB=footAt(stepB),target=localFromWorld(contact),targetB={x:target.x-5,y:target.y-7},targetF={x:target.x+6,y:target.y+7};
      worker.root.style.opacity=opacity;
      worker.forceMark.style.opacity=0;
      worker.root.setAttribute('transform',`translate(${base.x.toFixed(2)} ${base.y.toFixed(2)}) scale(${direction} 1)`);
      const shoulderX=lean+sway*.35,topY=-98-bob,pelvisY=-48-bob*.56,headX=lean*1.03+sway*.48,headY=-119-bob*.74;
      worker.torso.setAttribute('d',`M${(-20+shoulderX).toFixed(1)} ${topY.toFixed(1)}Q${(shoulderX-2).toFixed(1)} ${(-111-bob).toFixed(1)} ${(18+shoulderX).toFixed(1)} ${(-96-bob).toFixed(1)}L${(20+sway*.16).toFixed(1)} ${pelvisY.toFixed(1)}Q${sway.toFixed(1)} ${(-38-bob*.5).toFixed(1)} ${(-20+sway*.16).toFixed(1)} ${pelvisY.toFixed(1)}Z`);
      worker.belt.setAttribute('d',`M${(-18+sway*.16).toFixed(1)} ${(-50-bob*.55).toFixed(1)}Q${sway.toFixed(1)} ${(-43-bob*.5).toFixed(1)} ${(18+sway*.16).toFixed(1)} ${(-50-bob*.55).toFixed(1)}`);
      worker.neck.setAttribute('d',`M${headX.toFixed(1)} ${(-103-bob*.72).toFixed(1)}V${(-109-bob*.72).toFixed(1)}`);
      worker.head.setAttribute('cx',headX.toFixed(1));worker.head.setAttribute('cy',headY.toFixed(1));
      worker.eye.setAttribute('cx',(headX+6).toFixed(1));worker.eye.setAttribute('cy',(headY-2).toFixed(1));
      worker.nose.setAttribute('transform',`translate(${headX.toFixed(1)} ${(headY+119).toFixed(1)})`);
      worker.helmet.setAttribute('transform',`translate(${headX.toFixed(1)} ${(headY+119).toFixed(1)})`);
      const hipB={x:-8+sway*.16,y:-46-bob*.56},hipF={x:8+sway*.16,y:-46-bob*.56},kB=twoBone(hipB.x,hipB.y,fB.p.x,fB.p.y,-1),kF=twoBone(hipF.x,hipF.y,fA.p.x,fA.p.y,1);
      worker.legB.setAttribute('d',`M${hipB.x.toFixed(1)} ${hipB.y.toFixed(1)}L${kB.x.toFixed(1)} ${kB.y.toFixed(1)}L${fB.p.x.toFixed(1)} ${fB.p.y.toFixed(1)}`);
      worker.legF.setAttribute('d',`M${hipF.x.toFixed(1)} ${hipF.y.toFixed(1)}L${kF.x.toFixed(1)} ${kF.y.toFixed(1)}L${fA.p.x.toFixed(1)} ${fA.p.y.toFixed(1)}`);
      worker.footB.setAttribute('d',`M${fB.p.x.toFixed(1)} ${fB.p.y.toFixed(1)}L${fB.toe.x.toFixed(1)} ${fB.toe.y.toFixed(1)}`);
      worker.footF.setAttribute('d',`M${fA.p.x.toFixed(1)} ${fA.p.y.toFixed(1)}L${fA.toe.x.toFixed(1)} ${fA.toe.y.toFixed(1)}`);
      arm(worker,{x:-13+shoulderX,y:-91-bob},targetB,false);arm(worker,{x:10+shoulderX,y:-86-bob},targetF,true);
      worker.gripB.style.opacity=.82;worker.gripF.style.opacity=.82;
    }
    const papers=[];
    const pieceRotation=(point,travel,progress)=>{
      const settle=1-smoother(clamp((progress-.80)/.20));
      return(clamp(point.angle*.07,-4,4)+.72*Math.sin(travel/78*Math.PI*2))*settle;
    };
    const duration=4600;
    const timeline=progress=>{const value=clamp(progress);if(value<=.68)return smoother(value/.68)*.35;return .735+smoother((value-.68)/.32)*.14};
    const frameParam=new URLSearchParams(location.search).get('frame'),frameNumber=frameParam===null?null:Number(frameParam),fixed=frameNumber!==null&&Number.isFinite(frameNumber)?clamp(frameNumber):null;
    const pathLength=path.getTotalLength();path.style.strokeDasharray=String(pathLength);glowPath.style.strokeDasharray=String(pathLength);

    function render(progress){
      const t=timeline(progress);
      const draw=smoother(clamp(t/.07));path.style.strokeDashoffset=String(pathLength*(1-draw));glowPath.style.strokeDashoffset=String(pathLength*(1-draw));candles.style.opacity=.48*draw;
      const u=clamp((t-.07)/.28),lowerProgress=smoother(u),upperProgress=smoother(u);
      const lowerLength=middle*lowerProgress,upperLength=total-(total-middle)*upperProgress,lowerTravel=lowerLength,upperTravel=total-upperLength;
      const lowerPoint=pointAt(lowerLength),upperPoint=pointAt(upperLength),lowerRot=pieceRotation(lowerPoint,lowerTravel,lowerProgress),upperRot=pieceRotation(upperPoint,upperTravel,upperProgress);
      const lowerBob=-1.7*Math.abs(Math.sin(lowerTravel/78*Math.PI))*(1-smoother(clamp((lowerProgress-.82)/.18))),upperBob=-1.7*Math.abs(Math.sin(upperTravel/78*Math.PI))*(1-smoother(clamp((upperProgress-.82)/.18)));
      const lowerCenter={x:lowerPoint.x,y:lowerPoint.y+lowerBob},upperCenter={x:upperPoint.x,y:upperPoint.y+upperBob};
      bottomPiece.setAttribute('transform',`translate(${(lowerCenter.x-540).toFixed(2)} ${(lowerCenter.y-960).toFixed(2)}) rotate(${lowerRot.toFixed(2)} 540 960)`);
      topPiece.setAttribute('transform',`translate(${(upperCenter.x-540).toFixed(2)} ${(upperCenter.y-960).toFixed(2)}) rotate(${upperRot.toFixed(2)} 540 960)`);
      const lc=rotateOffset(145,-82,lowerRot),uc=rotateOffset(-165,-160,upperRot);
      const lowerContact={x:lowerCenter.x+lc.x,y:lowerCenter.y+lc.y},upperContact={x:upperCenter.x+uc.x,y:upperCenter.y+uc.y};
      const moveVisible=1-smooth(clamp((t-.35)/.035)),lowerEffort=.48+.44*clamp(-lowerPoint.ty),upperEffort=.42+.18*clamp(upperPoint.ty);
      renderCarrier(lowerWorker,lowerLength,{x:55,y:4},lowerContact,1,lowerTravel,moveVisible,lowerEffort);
      renderCarrier(upperWorker,upperLength,{x:-70,y:4},upperContact,-1,upperTravel,moveVisible,upperEffort);

      const paperStart=.37,paperEnd=.735,paperSequence=(t-paperStart)/(paperEnd-paperStart)*papers.length;
      paperLayer.style.opacity=smooth(clamp((t-paperStart)/.012))*(1-smooth(clamp((t-paperEnd)/.012)));
      papers.forEach((paper,i)=>{
        const local=paperSequence-i,active=local>-.08&&local<1,enter=smoother(clamp((local+.08)/.22)),depart=smoother(clamp((local-.60)/.40));
        const side=i%2?1:-1,entryY=mix(430,628,enter),x=540+side*(1-enter)*108+side*58*Math.sin(Math.PI*depart),y=mix(entryY,960,depart);
        const fullScale=mix(.72,1,enter),scale=mix(fullScale,.045,depart),rotation=mix(side*4.5,0,enter)+side*96*depart;
        paper.style.opacity=active?enter*(1-smooth(clamp((local-.92)/.08))):0;
        paper.setAttribute('transform',`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation.toFixed(1)}) scale(${scale.toFixed(3)})`);
      });

      const shapeU=smoother(clamp((t-.755)/.055)),paperIn=smooth(clamp((t-.735)/.018)),paperOut=1-smooth(clamp((t-.81)/.022)),coreW=mix(122,116,shapeU),coreH=mix(86,116,shapeU);
      corePaper.style.opacity=paperIn*paperOut;corePaper.setAttribute('transform',`translate(540 960) rotate(${mix(-9,0,shapeU).toFixed(1)}) scale(${mix(.84,1,shapeU).toFixed(3)})`);
      corePaperRect.setAttribute('x',(-coreW/2).toFixed(1));corePaperRect.setAttribute('y',(-coreH/2).toFixed(1));corePaperRect.setAttribute('width',coreW.toFixed(1));corePaperRect.setAttribute('height',coreH.toFixed(1));corePaperRect.setAttribute('rx',mix(8,58,shapeU).toFixed(1));corePaperRect.setAttribute('fill',mixColor('#f7f0e2','#d7b455',shapeU));
      corePaperFold.style.opacity=1-smooth(clamp(shapeU/.72));corePaperText.style.opacity=1-smooth(clamp(shapeU/.72));
      const centerU=smoother(clamp((t-.795)/.045));centerPiece.setAttribute('transform',`translate(540 960) rotate(${mix(-16,0,centerU)}) scale(${mix(.40,1,centerU)}) translate(-540 -960)`);
      const chartFade=1-smooth(clamp((t-.825)/.04));chartLayer.style.opacity=chartFade;
      const brandU=smoother(clamp((t-.825)/.045));
      const logoReady=smoother(clamp((t-.79)/.07));

      const orbitU=smoother(clamp((t-.89)/.11)),orbitOpacity=1-smooth(clamp((orbitU-.10)/.90)),orbitRadius=118*smooth(clamp(orbitU/.82));
      if(orbitU>0){
        const topAngle=430*orbitU,bottomAngle=-430*orbitU,orbitScale=1+.10*orbitU;
        topPiece.setAttribute('transform',`translate(540 960) rotate(${topAngle.toFixed(1)}) translate(${orbitRadius.toFixed(1)} 0) rotate(${(topAngle*.16).toFixed(1)}) scale(${orbitScale.toFixed(3)}) translate(-540 -960)`);
        bottomPiece.setAttribute('transform',`translate(540 960) rotate(${bottomAngle.toFixed(1)}) translate(${orbitRadius.toFixed(1)} 0) rotate(${(bottomAngle*.16).toFixed(1)}) scale(${orbitScale.toFixed(3)}) translate(-540 -960)`);
      }
      topPiece.style.opacity=orbitOpacity;bottomPiece.style.opacity=orbitOpacity;
      centerPiece.style.opacity=centerU*(1-smooth(clamp((orbitU-.04)/.62)));
      brandName.style.opacity=brandU*(1-smooth(clamp(orbitU/.52)));
      halo.style.opacity=.25*logoReady*(1-smooth(clamp(orbitU/.72)));

      const authU=smoother(clamp((t-.895)/.105));
      authPage.style.opacity=authU;
      authCard.setAttribute('transform',`translate(0 ${mix(88,0,authU).toFixed(1)}) translate(540 960) scale(${mix(.95,1,authU).toFixed(3)}) translate(-540 -960)`);
    }
    function startPlayback(){
      if(fixed!==null){render(fixed);svg.dataset.animationState='fixed';svg.dataset.animationProgress=String(fixed);return}
      let startedAt=null,completed=false;
      render(0);svg.dataset.animationState='playing';svg.dataset.animationProgress='0';
      const finish=()=>{if(completed)return;completed=true;render(1);svg.dataset.animationProgress='1.0000';svg.dataset.animationState='complete';window.parent.postMessage({type:'sarafi-opening-complete'},window.parent.location.origin)};
      window.setTimeout(finish,duration+100);
      const tick=now=>{
        if(completed)return;
        if(startedAt===null)startedAt=now;
        const t=clamp((now-startedAt)/duration);
        render(t);svg.dataset.animationProgress=t.toFixed(4);
        if(t<1)requestAnimationFrame(tick);else finish();
      };
      requestAnimationFrame(tick);
    }
    startPlayback();
  })();
