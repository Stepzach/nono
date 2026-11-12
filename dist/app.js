const canvas = document.querySelector('#canvas');
const world = document.querySelector('#world');
const letter = document.querySelector('#letter');
const photoDialog = document.querySelector('#photo-dialog');
const status = document.querySelector('#status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const camera = { x: 0, y: 0, z: 1 };
const albums = [], cards = [], pointers = new Map(), imageQueue = [];
let imageLoads = 0, desiredZoom = 1;
const assetVersion = "mobile-2";
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
  let found=null;
  for(const album of albums)for(const block of album.blocks) {
    const bx=album.x+block.x,by=album.y+block.y,distance=Math.hypot(x-bx,y-by);
    if(!found||distance<found.distance)found={album,block,distance,x:bx,y:by};
  }
  return found;
}
function zoomFor(x,y) {
  let focus=0;
  for(const a of albums)for(const b of a.blocks) {
    const bx=a.x+b.x,by=a.y+b.y,home=Math.hypot(bx,by);
    focus=Math.max(focus,smooth((home-Math.hypot(x-bx,y-by))/Math.max(1,home-230)));
  }
  return clamp((baseZoom()+(homeZoom()*1.15-baseZoom())*focus)*manualZoom,.12,1.8);
}
function pumpImages() {
  while(imageLoads<3&&imageQueue.length) {
    const c=imageQueue.shift();imageLoads++;c.img.src=c.photo.src+'?v='+assetVersion;
    Promise.resolve(c.img.decode?.()).catch(()=>{}).finally(()=>{imageLoads--;pumpImages();});
  }
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
  // Alternate story blocks with actual album photographs. Keep the first text
  // block at the album center, with continuations below it in reading order.
  for(const a of albums) {
    const own=cards.filter(c=>c.album===a);a.shapes=[];
    a.blocks.forEach((block,i)=>{
      block.w=block.el.offsetWidth||310;block.h=block.el.offsetHeight||244;block.x=0;
      if(i===0)block.y=0;
      else {
        const previous=a.blocks[i-1],photo=own[i-1];photo.pinned=true;photo.x=0;
        photo.y=previous.y+previous.h/2+32+(photo.h+26)/2;
        a.shapes.push({x:photo.x,y:photo.y,w:photo.w*1.08+14,h:photo.h*1.08+36});
        block.y=photo.y+(photo.h+26)/2+32+block.h/2;
      }
      a.shapes.push({x:block.x,y:block.y,w:block.w+24,h:block.h+24});
      block.el.style.left=block.x+'px';block.el.style.top=block.y+'px';
    });
  }
  const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.y-b.y)<(a.h+b.h)/2;
  const stories=[...albums].sort((a,b)=>b.shapes.reduce((n,s)=>n+s.h,0)-a.shapes.reduce((n,s)=>n+s.h,0));
  for(const a of stories) {
    const direction=Math.atan2(a.y,a.x);
    while(a.shapes.some(shape=>occupied.some(other=>overlaps({...shape,x:shape.x+a.x,y:shape.y+a.y},other)))) {
      a.x+=Math.cos(direction)*24;a.y+=Math.sin(direction)*24;
    }
    a.homeDistance=Math.hypot(a.x,a.y);a.el.style.transform=`translate(${a.x}px,${a.y}px)`;
    occupied.push(...a.shapes.map(shape=>({...shape,x:shape.x+a.x,y:shape.y+a.y})));
  }
  const byAlbum=albums.map(a=>cards.filter(c=>c.album===a&&!c.pinned));
  const ordered=[];
  for(let i=0;byAlbum.some(group=>group[i]);i++)byAlbum.forEach(group=>{if(group[i])ordered.push(group[i]);});
  for(const c of ordered) {
    const box={w:c.w*1.08+14,h:c.h*1.08+36};
    const block=c.album.blocks[c.index%c.album.blocks.length];
    const count=byAlbum[albums.indexOf(c.album)].length;
    const preferred=c.index/Math.max(1,count)*Math.PI*2-Math.PI/2;
    let position=null;
    for(let radius=140;!position;radius+=24) {
      const steps=Math.ceil(2*Math.PI*radius/42);
      for(let step=0;step<steps;step++) {
        // Spread photos around the text, with balanced fallback on both sides.
        const offset=(step%2?-1:1)*Math.ceil(step/2)/steps*Math.PI*2;
        const angle=preferred+offset;
        const candidate={x:c.album.x+block.x+Math.cos(angle)*radius,y:c.album.y+block.y+Math.sin(angle)*radius,...box};
        if(!occupied.some(other=>overlaps(candidate,other))) {position=candidate;break;}
      }
    }
    occupied.push(position);c.x=position.x-c.album.x;c.y=position.y-c.album.y;
  }
  for(const c of cards) {
    c.el.style.left=`${c.x}px`;c.el.style.top=`${c.y}px`;
    c.worldX=c.album.x+c.x;c.worldY=c.album.y+c.y;
  }
  // Include every photograph and caption, even the ones packed past their album.
  sceneBounds={
    left:Math.min(...occupied.map(b=>b.x-b.w/2)),right:Math.max(...occupied.map(b=>b.x+b.w/2)),
    top:Math.min(...occupied.map(b=>b.y-b.h/2)),bottom:Math.max(...occupied.map(b=>b.y+b.h/2))
  };
}
function stopMotion() { desiredZoom=camera.z;flight=null;vx=vy=0;snapPending=false;clearTimeout(wheelTimer);wheelTimer=null; }
function goTo(x,y) {
  stopMotion();
  desiredZoom=zoomFor(x,y);
  if(reducedMotion.matches) Object.assign(camera,{x,y,z:desiredZoom});
  else flight={from:{...camera},to:{x,y,z:desiredZoom},start:performance.now()};
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
    goTo(n.x,n.y);status.textContent=n.album.name;
  }
  if(!flight&&!gestureStart.inside)desiredZoom=zoomFor(camera.x,camera.y);
  gestureStart=null;
}
function render(time) {
  frame=0;const dt=Math.min(40,time-(previousTime||time-16));previousTime=time;
  if(flight) {
    const t=clamp((time-flight.start)/800,0,1),ease=1-Math.pow(1-t,3);
    camera.x=flight.from.x+(flight.to.x-flight.from.x)*ease;
    camera.y=flight.from.y+(flight.to.y-flight.from.y)*ease;
    camera.z=flight.from.z+(flight.to.z-flight.from.z)*ease;
    if(t===1)flight=null;
  } else if(!pointers.size&&Math.abs(vx)+Math.abs(vy)>.015) {
    camera.x-=vx*dt/camera.z;camera.y-=vy*dt/camera.z;
    const decay=Math.pow(.85,dt/16.67);vx*=decay;vy*=decay;
  } else if(snapPending&&!pointers.size) { vx=vy=0;maybeSnap(); }
  // Do not change scale underneath a moving finger or active scroll gesture.
  const zoomActive=!flight&&!pointers.size&&!wheelTimer&&Math.abs(vx)+Math.abs(vy)<=.015;
  if(zoomActive) {
    camera.z=reducedMotion.matches?desiredZoom:camera.z+(desiredZoom-camera.z)*(1-Math.exp(-dt/150));
    if(Math.abs(camera.z-desiredZoom)<.001)camera.z=desiredZoom;
  }
  const halfWidth=width/(2*camera.z),halfHeight=height/(2*camera.z),edgeMargin=40/camera.z;
  camera.x=clamp(camera.x,Math.min(0,sceneBounds.left+halfWidth-edgeMargin),Math.max(0,sceneBounds.right-halfWidth+edgeMargin));
  camera.y=clamp(camera.y,Math.min(0,sceneBounds.top+halfHeight-edgeMargin),Math.max(0,sceneBounds.bottom-halfHeight+edgeMargin));
  world.style.transform=`translate(${width/2-camera.x*camera.z}px,${height/2-camera.y*camera.z}px) scale(${camera.z})`;
  for(const c of cards) {
    const sx=(c.worldX-camera.x)*camera.z,sy=(c.worldY-camera.y)*camera.z;
    const visible=Math.abs(sx)<width/2+c.w*camera.z*.6+100&&Math.abs(sy)<height/2+(c.h+40)*camera.z*.6+100;
    if(c.rendered!==visible) {c.el.style.visibility=visible?'visible':'hidden';c.rendered=visible;}
    const tabIndex=visible&&Math.abs(sx)<width/2&&Math.abs(sy)<height/2?0:-1;
    if(c.tabIndex!==tabIndex){c.button.tabIndex=tabIndex;c.tabIndex=tabIndex;}
    const ahead=Math.max(width,height)*.8;
    if(!c.queued&&Math.abs(sx)<width/2+ahead&&Math.abs(sy)<height/2+ahead) {c.queued=true;imageQueue.push(c);}
  }
  if(imageQueue.length) {
    imageQueue.sort((a,b)=>Math.hypot(a.worldX-camera.x,a.worldY-camera.y)-Math.hypot(b.worldX-camera.x,b.worldY-camera.y));
    pumpImages();
  }
  if(flight||snapPending||(!pointers.size&&Math.abs(vx)+Math.abs(vy)>.015)||(zoomActive&&camera.z!==desiredZoom))requestFrame();
}
function zoomAt(factor,sx=width/2,sy=height/2) {
  stopMotion();const old=camera.z;manualZoom=clamp(manualZoom*factor,.4,2.2);
  const next=clamp(old*factor,.12,1.8);
  camera.x+=(sx-width/2)*(1/old-1/next);camera.y+=(sy-height/2)*(1/old-1/next);
  camera.z=next;desiredZoom=next;requestFrame();
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
  const response=await fetch('albums.json?v=mobile-2');if(!response.ok)throw Error('The album list could not be loaded.');
  const data=await response.json();
  data.forEach((album,i)=>{
    album.el=document.createElement('section');album.el.className='cluster-group';album.el.setAttribute('aria-label',album.name);album.scale=1;
    albums.push(album);world.append(album.el);
    album.blocks=[];
    (album.paragraphs||[album.subtitle]).forEach((text,index)=>{
      const label=document.createElement('div');label.className='cluster-label';
      if(album.paragraphs)label.classList.add('story-block');
      if(index===0){const title=document.createElement('h2');title.textContent=album.name;label.append(title);album.label=label;}
      const paragraph=document.createElement('p');paragraph.textContent=text;label.append(paragraph);album.el.append(label);
      album.blocks.push({el:label,x:0,y:0});
    });
    const groups=['large','medium','small'].map(size=>album.photos.filter(p=>p.size===size)),ordered=[];
    while(groups.some(g=>g.length))groups.forEach(g=>{if(g.length)ordered.push(g.shift());});
    ordered.forEach((photo,j)=>makePhoto(photo,album,0,0,{large:290,medium:220,small:155}[photo.size],j));
  });
  layout();camera.z=baseZoom();desiredZoom=camera.z;requestFrame();
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
window.addEventListener('resize',()=>{const changed=width!==innerWidth;stopMotion();width=innerWidth;height=innerHeight;if(changed)layout();requestFrame();});
window.addEventListener('blur',()=>{pointers.clear();if(flight)Object.assign(camera,flight.to);stopMotion();canvas.classList.remove('dragging');requestFrame();});
reducedMotion.addEventListener('change',()=>{stopMotion();requestFrame();});
init().catch(error=>{console.error(error);status.textContent=error.message;const note=document.createElement('p');note.className='fallback';note.textContent='The memories could not load. Please refresh, or start the site using the included local server.';document.body.append(note);});
