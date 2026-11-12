const canvas = document.querySelector('#canvas');
const world = document.querySelector('#world');
const letter = document.querySelector('#letter');
const photoDialog = document.querySelector('#photo-dialog');
const status = document.querySelector('#status');
const coarsePointer = matchMedia('(pointer: coarse)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const camera = { x: 0, y: 0, z: 1 };
const albums = [], cards = [], pointers = new Map(), imageQueue = [];
let imageLoads = 0, desiredZoom = 1;
const assetVersion = "heart-6";
let width = innerWidth, height = innerHeight, frame = 0, previousTime = 0;
let vx = 0, vy = 0, flight = null, wheelTimer, manualZoom = 1;
let suppressClickUntil = 0, lastPointerTime = 0, dragDistance = 0;
let gestureStart = null, snapPending = false, lastFocus = null;
let sceneBounds = {left:0,right:0,top:0,bottom:0};
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const smooth = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
const homeZoom = () => Math.min(1,(height-65)/670,(width-42)/440);
const baseZoom = () => homeZoom() * .70;
const mobileView = () => width<=600||coarsePointer.matches;
const initialZoom = () => baseZoom()*(mobileView()?.88:1);
const minimumZoom = () => Math.min(baseZoom(),(width-80)/(sceneBounds.right-sceneBounds.left),(height-80)/(sceneBounds.bottom-sceneBounds.top));
// A soft silhouette used only while placing content, never a clipping mask.
function insideHeart(x,y) {
  if(y < -800) return (Math.abs(x)-1150)**2+(y+800)**2 <= 1250**2;
  return y <= 2300 && Math.abs(x) <= 2400*(.5*Math.sqrt(Math.max(0,1-((y+800)/3100)**2))+.5*(2300-y)/3100);
}
function fitsHeart(box) {
  return [-.5,0,.5].every(dx=>[-.5,0,.5].every(dy=>insideHeart(box.x+box.w*dx,box.y+box.h*dy)));
}
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
  return clamp((baseZoom()+(homeZoom()*1.15-baseZoom())*focus)*manualZoom,minimumZoom(),1.8);
}
function pumpImages() {
  while(imageLoads<3&&imageQueue.length) {
    const c=imageQueue.shift();imageLoads++;c.img.src=c.photo.src+'?v='+assetVersion;
    Promise.resolve(c.img.decode?.()).catch(()=>{}).finally(()=>{imageLoads--;pumpImages();});
  }
}
function layout() {
  // Keep each album together around a broad, rounded heart.
  // Photo groups balance the two lobes around the opening message.
  const slots=[[1100,1000],[-1250,-400],[1000,-1150],[1100,-150],[-850,-1050],[-1350,550],[-700,740],[0,950]];
  albums.forEach((a,i)=>{
    [a.x,a.y]=slots[i%slots.length];a.scale=1;
  });
  // One continuous field: reserve only the words, then pack the photographs
  // across album boundaries. Every photograph keeps a stable world position.
  const letterScale=homeZoom()/baseZoom();
  letter.style.transform=`translate(-50%,-50%) scale(${letterScale})`;
  const occupied=[{x:0,y:0,w:(letter.offsetWidth||410)*letterScale+34,h:(letter.offsetHeight||557)*letterScale+34}];
  // Keep the first-date story in a compact reading column, with its lead photo
  // above the title and the smaller photographs alternating alongside the words.
  cards.forEach(c=>{c.pinned=false;});
  const fixedPhotos=cards.filter(c=>c.photo.overviewPosition);
  for(const c of fixedPhotos) {
    c.pinned=true;
    occupied.push({...c.photo.overviewPosition,w:c.w*1.08+14,h:c.h*1.08+36});
  }
  for(const a of albums) {
    const own=cards.filter(c=>c.album===a),lead=own.find(c=>c.photo.id===a.leadPhotoId);
    const between=own.filter(c=>c!==lead);a.shapes=[];
    const reserve=photo=>a.shapes.push({x:photo.x,y:photo.y,w:photo.w*1.08+14,h:photo.h*1.08+36});
    a.blocks.forEach((block,i)=>{
      block.w=block.el.offsetWidth||310;block.h=block.el.offsetHeight||244;block.x=0;block.y=0;
      if(i>0) {
        const previous=a.blocks[i-1],photo=between[i-1];photo.pinned=true;
        if(a.compactText) {
          block.y=previous.y+previous.h/2+28+block.h/2;
          // Put the photograph in the continuation paragraph's previous spot.
          photo.x=0;photo.y=previous.y+previous.h/2+64+photo.h+26+block.h/2;
        } else if(a.leadPhotoId) {
          block.y=previous.y+previous.h/2+28+block.h/2;
          photo.x=(i%2?-1:1)*(block.w/2+40+photo.w/2);photo.y=block.y;
        } else {
          photo.x=0;photo.y=previous.y+previous.h/2+32+(photo.h+26)/2;
          block.y=photo.y+(photo.h+26)/2+32+block.h/2;
        }
        reserve(photo);
      } else if(lead) {
        lead.pinned=true;lead.x=0;lead.y=-block.h/2-32-(lead.h+26)/2;reserve(lead);
      }
      a.shapes.push({x:block.x,y:block.y,w:block.w+24,h:block.h+24});
      block.el.style.left=block.x+'px';block.el.style.top=block.y+'px';
    });
  }
  const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.y-b.y)<(a.h+b.h)/2;
  const stories=[...albums].sort((a,b)=>b.shapes.reduce((n,s)=>n+s.h,0)-a.shapes.reduce((n,s)=>n+s.h,0));
  for(const a of stories) {
    const anchor={x:a.x,y:a.y};let position=null;
    for(let radius=0;!position&&radius<5000;radius+=24) {
      const steps=Math.max(1,Math.ceil(2*Math.PI*radius/42));
      for(let step=0;step<steps;step++) {
        const angle=step/steps*Math.PI*2;
        const candidate={x:anchor.x+Math.cos(angle)*radius,y:anchor.y+Math.sin(angle)*radius};
        if(a.shapes.every(shape=>{
          const box={...shape,x:shape.x+candidate.x,y:shape.y+candidate.y};
          return fitsHeart(box)&&!occupied.some(other=>overlaps(box,other));
        })) {position=candidate;break;}
      }
    }
    if(!position)throw Error('The album text could not be arranged.');
    a.x=position.x;a.y=position.y;
    a.homeDistance=Math.hypot(a.x,a.y);a.el.style.transform=`translate(${a.x}px,${a.y}px)`;
    occupied.push(...a.shapes.map(shape=>({...shape,x:shape.x+a.x,y:shape.y+a.y})));
  }
  for(const c of fixedPhotos){c.x=c.photo.overviewPosition.x-c.album.x;c.y=c.photo.overviewPosition.y-c.album.y;}
  const byAlbum=albums.map(a=>cards.filter(c=>c.album===a&&!c.pinned));
  const ordered=[];
  for(let i=0;byAlbum.some(group=>group[i]);i++)byAlbum.forEach(group=>{if(group[i])ordered.push(group[i]);});
  ordered.sort((a,b)=>b.w*b.h-a.w*a.h);
  const distanceTo=(point,album)=>Math.min(...album.blocks.map(b=>Math.hypot(point.x-album.x-b.x,point.y-album.y-b.y)));
  for(const c of ordered) {
    const box={w:c.w*1.08+14,h:c.h*1.08+36};
    const block=c.album.blocks[c.index%c.album.blocks.length];
    const count=byAlbum[albums.indexOf(c.album)].length;
    const preferred=c.index/Math.max(1,count)*Math.PI*2-Math.PI/2;
    let position=null;
    for(let radius=140;!position&&radius<7000;radius+=24) {
      const steps=Math.ceil(2*Math.PI*radius/42);
      for(let step=0;step<steps;step++) {
        // Spread photos around the text, with balanced fallback on both sides.
        const offset=(step%2?-1:1)*Math.ceil(step/2)/steps*Math.PI*2;
        const angle=preferred+offset;
        const candidate={x:c.album.x+block.x+Math.cos(angle)*radius,y:c.album.y+block.y+Math.sin(angle)*radius,...box};
        const ownDistance=distanceTo(candidate,c.album);
        const belongsHere=albums.every(a=>a===c.album||distanceTo(candidate,a)+800>=ownDistance);
        if(belongsHere&&fitsHeart(candidate)&&!occupied.some(other=>overlaps(candidate,other))) {position=candidate;break;}
      }
    }
    if(!position)throw Error(`The photos in ${c.album.name} could not be arranged.`);
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
function goTo(x,y,z=mobileView()?camera.z:zoomFor(x,y)) {
  stopMotion();
  desiredZoom=z;
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
  // Mobile stays entirely free; the zoomed-out desktop overview does too.
  if(mobileView()||manualZoom<.75){gestureStart=null;return;}
  const travel=Math.hypot(camera.x-gestureStart.x,camera.y-gestureStart.y),n=nearest();
  // Small movements inside a cluster stay exactly where the visitor leaves them.
  if(n&&travel>120&&(!gestureStart.inside||travel>480)&&n.distance<Math.min(510,n.album.homeDistance*.6)) {
    goTo(n.x,n.y);status.textContent=n.album.name;
  }
  if(!flight&&!gestureStart.inside&&!mobileView())desiredZoom=zoomFor(camera.x,camera.y);
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
  const constrain=(value,min,max,half)=>max-min<=2*(half-edgeMargin)?(min+max)/2:clamp(value,min+half-edgeMargin,max-half+edgeMargin);
  camera.x=constrain(camera.x,sceneBounds.left,sceneBounds.right,halfWidth);
  camera.y=constrain(camera.y,sceneBounds.top,sceneBounds.bottom,halfHeight);
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
  stopMotion();const old=camera.z;
  const next=clamp(old*factor,minimumZoom(),1.8);
  manualZoom=clamp(manualZoom*next/old,.05,2.2);
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
  const response=await fetch('albums.json?v=heart-6');if(!response.ok)throw Error('The album list could not be loaded.');
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
    ordered.forEach((photo,j)=>makePhoto(photo,album,0,0,{large:290,medium:220,small:155}[photo.size]*(photo.displayScale||1),j));
  });
  layout();camera.z=initialZoom();desiredZoom=camera.z;requestFrame();
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
  }else if(e.key==='Home'){e.preventDefault();manualZoom=1;goTo(0,0,initialZoom());status.textContent='Back to the opening message.';}
  else if(e.key==='+'||e.key==='=')zoomAt(1.2);else if(e.key==='-')zoomAt(1/1.2);
});
photoDialog.querySelector('[data-close]').addEventListener('click',()=>photoDialog.close());
photoDialog.addEventListener('click',e=>{if(e.target===photoDialog){const r=photoDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)photoDialog.close();}});
photoDialog.addEventListener('close',()=>{lastFocus?.focus({preventScroll:true});document.querySelector('#full-photo').removeAttribute('src');});
window.addEventListener('resize',()=>{const changed=width!==innerWidth;stopMotion();width=innerWidth;height=innerHeight;if(changed)layout();requestFrame();});
window.addEventListener('blur',()=>{pointers.clear();if(flight)Object.assign(camera,flight.to);stopMotion();canvas.classList.remove('dragging');requestFrame();});
reducedMotion.addEventListener('change',()=>{stopMotion();requestFrame();});
init().catch(error=>{console.error(error);status.textContent=error.message;const note=document.createElement('p');note.className='fallback';note.textContent='The memories could not load. Please refresh, or start the site using the included local server.';document.body.append(note);});
