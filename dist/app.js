const canvas = document.querySelector('#canvas');
const world = document.querySelector('#world');
const letter = document.querySelector('#letter');
const photoDialog = document.querySelector('#photo-dialog');
const status = document.querySelector('#status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const camera = { x: 0, y: 0, z: 1 };
const albums = [], cards = [], pointers = new Map();
let width = innerWidth, height = innerHeight, frame = 0, previousTime = 0;
let vx = 0, vy = 0, flight = null, wheelTimer, manualZoom = 1;
let suppressClickUntil = 0, lastPointerTime = 0, dragDistance = 0;
let gestureStart = null, snapPending = false, lastFocus = null;
let sceneBounds = {left:0,right:0,top:0,bottom:0};
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const smooth = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
const homeZoom = () => Math.min(1,(height-65)/670,(width-42)/440);
const baseZoom = () => homeZoom() * .70;
function requestFrame() { if(!frame) frame=requestAnimationFrame(render); }
function nearest(x=camera.x,y=camera.y) {
  return albums.map(a=>({album:a,distance:Math.hypot(x-a.x,y-a.y)})).sort((a,b)=>a.distance-b.distance)[0];
}
function layout() {
  const z=baseZoom();
  const rx=Math.max(520,Math.min(880,(width/2+95)/z));
  const ry=Math.max(650,Math.min(1120,(height/2+95)/z));
  const slots=[[-.78,-.78],[0,-1],[.78,-.78],[1,0],[.78,.78],[0,1],[-.78,.78],[-1,0]];
  albums.forEach((a,i)=>{
    const slot=slots[i%8],ring=1+Math.floor(i/8);
    a.x=slot[0]*rx*ring;a.y=slot[1]*ry*ring;
    a.homeDistance=Math.hypot(a.x,a.y);a.scale=1;
    a.el.style.transform=`translate(${a.x}px,${a.y}px)`;
  });
  // One continuous field: reserve only the words, then pack the photographs
  // across album boundaries. Every photograph keeps a stable world position.
  const letterScale=homeZoom()/baseZoom();
  letter.style.transform=`translate(-50%,-50%) scale(${letterScale})`;
  const occupied=[{x:0,y:0,w:(letter.offsetWidth||410)*letterScale+34,h:(letter.offsetHeight||557)*letterScale+34}];
  // Reserve the longest messages first, then nudge neighboring albums outward
  // only as far as needed to keep every paragraph separate and fully readable.
  const labels=albums.map(a=>({album:a,w:(a.label.offsetWidth||310)+24,h:(a.label.offsetHeight||244)+24})).sort((a,b)=>b.h-a.h);
  for(const box of labels) {
    const a=box.album,direction=Math.atan2(a.y,a.x);
    while(occupied.some(other=>Math.abs(a.x-other.x)<(box.w+other.w)/2&&Math.abs(a.y-other.y)<(box.h+other.h)/2)) {
      a.x+=Math.cos(direction)*24;a.y+=Math.sin(direction)*24;
    }
    a.homeDistance=Math.hypot(a.x,a.y);
    a.el.style.transform=`translate(${a.x}px,${a.y}px)`;
    occupied.push({x:a.x,y:a.y,w:box.w,h:box.h});
  }
  const byAlbum=albums.map(a=>cards.filter(c=>c.album===a));
  const ordered=[];
  for(let i=0;byAlbum.some(group=>group[i]);i++)byAlbum.forEach(group=>{if(group[i])ordered.push(group[i]);});
  for(const c of ordered) {
    const box={w:c.w*1.08+14,h:c.h*1.08+36};
    let position=null;
    // Small angular steps fill gaps between differently sized photographs.
    for(let radius=140;!position;radius+=24) {
      const count=Math.ceil(2*Math.PI*radius/42);
      for(let step=0;step<count;step++) {
        const angle=step/count*Math.PI*2-Math.PI/2+(c.index%3)*.13;
        const candidate={x:c.album.x+Math.cos(angle)*radius,y:c.album.y+Math.sin(angle)*radius,...box};
        if(!occupied.some(other=>Math.abs(candidate.x-other.x)<(candidate.w+other.w)/2&&Math.abs(candidate.y-other.y)<(candidate.h+other.h)/2)) {
          position=candidate;break;
        }
      }
    }
    occupied.push(position);c.x=position.x-c.album.x;c.y=position.y-c.album.y;
    c.el.style.left=`${c.x}px`;c.el.style.top=`${c.y}px`;
  }
  // Include every photograph and caption, even the ones packed past their album.
  sceneBounds={
    left:Math.min(...occupied.map(b=>b.x-b.w/2)),right:Math.max(...occupied.map(b=>b.x+b.w/2)),
    top:Math.min(...occupied.map(b=>b.y-b.h/2)),bottom:Math.max(...occupied.map(b=>b.y+b.h/2))
  };
}
function stopMotion() { flight=null;vx=vy=0;snapPending=false;clearTimeout(wheelTimer);wheelTimer=null; }
function goTo(x,y) {
  stopMotion();
  if(reducedMotion.matches) Object.assign(camera,{x,y});
  else flight={from:{x:camera.x,y:camera.y},to:{x,y},start:performance.now()};
  requestFrame();
}
function beginGesture() {
  const n=nearest(); gestureStart={x:camera.x,y:camera.y,inside:n&&n.distance<260};
}
function maybeSnap() {
  snapPending=false;
  if(!gestureStart) return;
  const travel=Math.hypot(camera.x-gestureStart.x,camera.y-gestureStart.y),n=nearest();
  // Small movements inside a cluster stay exactly where the visitor leaves them.
  if(n&&travel>120&&(!gestureStart.inside||travel>480)&&n.distance<Math.min(510,n.album.homeDistance*.6)) {
    goTo(n.album.x,n.album.y);status.textContent=n.album.name;
  }
  gestureStart=null;
}
function render(time) {
  frame=0;const dt=Math.min(40,time-(previousTime||time-16));previousTime=time;
  if(flight) {
    const t=clamp((time-flight.start)/1050,0,1),ease=1-Math.pow(1-t,3);
    camera.x=flight.from.x+(flight.to.x-flight.from.x)*ease;
    camera.y=flight.from.y+(flight.to.y-flight.from.y)*ease;
    if(t===1)flight=null;
  } else if(!pointers.size&&Math.abs(vx)+Math.abs(vy)>.015) {
    camera.x-=vx*dt/camera.z;camera.y-=vy*dt/camera.z;
    const decay=Math.pow(.85,dt/16.67);vx*=decay;vy*=decay;
  } else if(snapPending&&!pointers.size) { vx=vy=0;maybeSnap(); }
  let focus=0;
  for(const a of albums) {
    const d=Math.hypot(camera.x-a.x,camera.y-a.y);
    const proximity=smooth((a.homeDistance-d)/Math.max(1,a.homeDistance-230));
    focus=Math.max(focus,proximity);
    a.proximity=proximity;a.distance=d;
  }
  const targetZ=clamp((baseZoom()+(homeZoom()*1.15-baseZoom())*focus)*manualZoom,.12,1.8);
  camera.z=reducedMotion.matches?targetZ:camera.z+(targetZ-camera.z)*(1-Math.exp(-dt/100));
  if(Math.abs(camera.z-targetZ)<.0001)camera.z=targetZ;
  const halfWidth=width/(2*camera.z),halfHeight=height/(2*camera.z),edgeMargin=40/camera.z;
  camera.x=clamp(camera.x,Math.min(0,sceneBounds.left+halfWidth-edgeMargin),Math.max(0,sceneBounds.right-halfWidth+edgeMargin));
  camera.y=clamp(camera.y,Math.min(0,sceneBounds.top+halfHeight-edgeMargin),Math.max(0,sceneBounds.bottom-halfHeight+edgeMargin));
  world.style.transform=`translate(${width/2-camera.x*camera.z}px,${height/2-camera.y*camera.z}px) scale(${camera.z})`;
  for(const c of cards) {
    const x=c.album.x+c.x*c.album.scale,y=c.album.y+c.y*c.album.scale,z=camera.z*c.album.scale;
    const sx=(x-camera.x)*camera.z,sy=(y-camera.y)*camera.z;
    const visible=Math.abs(sx)<width/2+c.w*z&&Math.abs(sy)<height/2+c.h*z+50;
    c.button.tabIndex=visible&&Math.abs(sx)<width/2&&Math.abs(sy)<height/2?0:-1;
    if(visible&&!c.img.getAttribute('src'))c.img.src=c.photo.src;
  }
  if(flight||snapPending||(!pointers.size&&Math.abs(vx)+Math.abs(vy)>.015)||camera.z!==targetZ)requestFrame();
}
function zoomAt(factor,sx=width/2,sy=height/2) {
  stopMotion();const old=camera.z;manualZoom=clamp(manualZoom*factor,.4,2.2);
  const next=clamp(old*factor,.12,1.8);
  camera.x+=(sx-width/2)*(1/old-1/next);camera.y+=(sy-height/2)*(1/old-1/next);
  camera.z=next;requestFrame();
}
function openPhoto(photo,album,trigger) {
  stopMotion();lastFocus=trigger;const img=document.querySelector('#full-photo');
  img.src=photo.full;img.alt=`${photo.caption} — ${album.name}`;
  document.querySelector('#full-caption').textContent=`${photo.caption} · ${album.name}`;
  photoDialog.showModal();
}
function makePhoto(photo,album,x,y,w,index) {
  const h=w*clamp(photo.height/photo.width,.65,1.55),el=document.createElement('figure');
  el.className='photo';el.style.cssText=`left:${x}px;top:${y}px;width:${w}px`;
  const button=document.createElement('button');button.className='photo-button';button.style.height=`${h}px`;
  button.style.setProperty('--rotation',`${((index*7)%9-4)*.65}deg`);
  button.setAttribute('aria-label',`Open ${photo.caption} in ${album.name}`);
  const img=document.createElement('img');img.alt=`${photo.caption} — ${album.name}`;img.draggable=false;img.decoding='async';img.width=photo.width;img.height=photo.height;
  button.append(img);const caption=document.createElement('figcaption');caption.textContent=photo.caption;
  el.append(button,caption);album.el.append(el);
  button.addEventListener('click',()=>{
    if(performance.now()<suppressClickUntil)return;
    openPhoto(photo,album,button);
  });
  cards.push({el,button,img,photo,album,x,y,w,h,index});
}
async function init() {
  if(document.fonts) { await document.fonts.load('400 27px Newsreader'); await document.fonts.ready; }
  const response=await fetch('albums.json?v=messages-1');if(!response.ok)throw Error('The album list could not be loaded.');
  const data=await response.json();
  data.forEach((album,i)=>{
    album.el=document.createElement('section');album.el.className='cluster-group';album.el.setAttribute('aria-label',album.name);album.scale=1;
    albums.push(album);world.append(album.el);
    const label=document.createElement('div');label.className='cluster-label';
    if(album.subtitle.length>700)label.classList.add('long-message');
    const title=document.createElement('h2');title.textContent=album.name;
    const subtitle=document.createElement('p');subtitle.textContent=album.subtitle;
    label.append(title,subtitle);album.label=label;album.el.append(label);
    const groups=['large','medium','small'].map(size=>album.photos.filter(p=>p.size===size)),ordered=[];
    while(groups.some(g=>g.length))groups.forEach(g=>{if(g.length)ordered.push(g.shift());});
    ordered.forEach((photo,j)=>makePhoto(photo,album,0,0,{large:290,medium:220,small:155}[photo.size],j));
  });
  layout();camera.z=baseZoom();requestFrame();
}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  stopMotion();if(!pointers.size){beginGesture();dragDistance=0;}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});(e.target.closest('button')||canvas).setPointerCapture(e.pointerId);
  lastPointerTime=performance.now();canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove',e=>{
  const old=pointers.get(e.pointerId);if(!old)return;
  const before=[...pointers.values()],dx=e.clientX-old.x,dy=e.clientY-old.y;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragDistance+=Math.hypot(dx,dy);
  if(dragDistance>6)suppressClickUntil=performance.now()+350;
  if(pointers.size===1){
    camera.x-=dx/camera.z;camera.y-=dy/camera.z;
    const dt=Math.max(8,performance.now()-lastPointerTime);
    vx=clamp(dx/dt,-2,2);vy=clamp(dy/dt,-2,2);
  }else if(pointers.size===2){
    const after=[...pointers.values()],mid=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2});
    const a=mid(before),b=mid(after),dist=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    if(dist(before)>0)zoomAt(dist(after)/dist(before),a.x,a.y);
    camera.x-=(b.x-a.x)/camera.z;camera.y-=(b.y-a.y)/camera.z;vx=vy=0;gestureStart=null;suppressClickUntil=performance.now()+350;
  }
  lastPointerTime=performance.now();requestFrame();
});
function release(e){
  pointers.delete(e.pointerId);
  if(!pointers.size){
    canvas.classList.remove('dragging');
    if(reducedMotion.matches||e.type==='pointercancel'||performance.now()-lastPointerTime>90)vx=vy=0;
    snapPending=e.type!=='pointercancel'&&dragDistance>6;requestFrame();
  }
}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))release(e);});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();const continuing=!!wheelTimer;stopMotion();if(!continuing)beginGesture();
  const unit=e.deltaMode===1?16:e.deltaMode===2?height:1;
  if(e.ctrlKey||e.metaKey){zoomAt(Math.exp(-e.deltaY*.006),e.clientX,e.clientY);gestureStart=null;}
  else{camera.x+=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*unit/camera.z;camera.y+=(e.shiftKey?0:e.deltaY)*unit/camera.z;}
  wheelTimer=setTimeout(()=>{wheelTimer=null;snapPending=true;requestFrame();},180);requestFrame();
},{passive:false});
window.addEventListener('keydown',e=>{
  if(photoDialog.open)return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();stopMotion();camera.x+=(e.key==='ArrowRight'?60:e.key==='ArrowLeft'?-60:0)/camera.z;camera.y+=(e.key==='ArrowDown'?60:e.key==='ArrowUp'?-60:0)/camera.z;requestFrame();
  }else if(e.key==='Home'){e.preventDefault();manualZoom=1;goTo(0,0);status.textContent='Back to the opening message.';}
  else if(e.key==='+'||e.key==='=')zoomAt(1.2);else if(e.key==='-')zoomAt(1/1.2);
});
photoDialog.querySelector('[data-close]').addEventListener('click',()=>photoDialog.close());
photoDialog.addEventListener('click',e=>{if(e.target===photoDialog){const r=photoDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)photoDialog.close();}});
photoDialog.addEventListener('close',()=>{lastFocus?.focus({preventScroll:true});document.querySelector('#full-photo').removeAttribute('src');});
window.addEventListener('resize',()=>{stopMotion();width=innerWidth;height=innerHeight;layout();requestFrame();});
window.addEventListener('blur',()=>{pointers.clear();if(flight)Object.assign(camera,flight.to);stopMotion();canvas.classList.remove('dragging');requestFrame();});
reducedMotion.addEventListener('change',()=>{stopMotion();requestFrame();});
init().catch(error=>{console.error(error);status.textContent=error.message;const note=document.createElement('p');note.className='fallback';note.textContent='The memories could not load. Please refresh, or start the site using the included local server.';document.body.append(note);});
