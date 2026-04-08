// holoIndex — shared starfield + clock (used by index.html and about.html)
(function(){
  // ── STARFIELD ──────────────────────────────────────────────────────────────
  const sf=document.getElementById('starfield');
  if(sf){
    [{x:10,y:20,size:300,color:'rgba(168,85,247,0.06)'},
     {x:80,y:60,size:400,color:'rgba(255,110,180,0.05)'},
     {x:50,y:80,size:350,color:'rgba(34,211,238,0.04)'}].forEach(n=>{
      const d=document.createElement('div');
      d.className='nebula';
      d.style.cssText=`left:${n.x}%;top:${n.y}%;width:${n.size}px;height:${n.size}px;background:${n.color};margin-left:-${n.size/2}px;margin-top:-${n.size/2}px;`;
      sf.appendChild(d);
    });
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    sf.appendChild(canvas);
    const ctx=canvas.getContext('2d');
    const COLORS=['#ffffff','#ffd6f5','#d6b3ff','#b3f5ff','#fbbf24'];
    let stars=[];
    function resize(){
      canvas.width=window.innerWidth;
      canvas.height=window.innerHeight;
      stars=[];
      for(let i=0;i<180;i++){
        const size=Math.random()<0.05?2.5:Math.random()<0.2?1.5:0.8;
        stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,size,color:COLORS[Math.floor(Math.random()*5)],lo:Math.random()*0.3+0.1,hi:Math.random()*0.5+0.5,dur:(Math.random()*4+2)*1000,offset:Math.random()*6000});
      }
    }
    resize();
    let resizeTimer;
    window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,200);});
    let lastFrame=0;
    const FPS_CAP=24;
    const FRAME_MS=1000/FPS_CAP;
    function draw(ts){
      requestAnimationFrame(draw);
      if(ts-lastFrame<FRAME_MS)return;
      lastFrame=ts;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      stars.forEach(s=>{
        const t=(ts+s.offset)%s.dur/s.dur;
        const alpha=s.lo+(s.hi-s.lo)*(t<0.5?t*2:(1-t)*2);
        ctx.globalAlpha=alpha;
        ctx.fillStyle=s.color;
        ctx.beginPath();
        ctx.arc(s.x,s.y,s.size,0,Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha=1;
    }
    requestAnimationFrame(draw);
  }

  // ── CLOCKS ─────────────────────────────────────────────────────────────────
  const elLocal=document.getElementById('clock-local');
  const elJst=document.getElementById('clock-jst');
  if(elLocal||elJst){
    function updateClocks(){
      const now=new Date();
      if(elLocal)elLocal.textContent=now.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(elJst){
        const jst=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Tokyo'}));
        elJst.textContent=jst.toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
      }
    }
    updateClocks();
    setInterval(updateClocks,1000);
  }
})();
