// Exercise the real controller with a deterministic clock and small DOM test double.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
class Element{
 constructor(){this.style={setProperty(){}};this.children=[];this.listeners={};this.attrs={};this.classList={add(){},remove(){}};this.open=false;}
 addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
 emit(n,e={}){e.type=n;e.preventDefault??=()=>{};e.target??=this;for(const f of this.listeners[n]||[])f(e)}
 append(...els){this.children.push(...els)}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]||null}removeAttribute(k){delete this.attrs[k]}
 set src(v){this.attrs.src=v}get src(){return this.attrs.src}setPointerCapture(){}set tabIndex(v){this._tabIndex=v;this.tabWrites=(this.tabWrites||0)+1}get tabIndex(){return this._tabIndex}closest(){return null}focus(){}querySelector(){return this.closeButton??=new Element()}
 showModal(){this.open=true}close(){this.open=false;this.emit('close')}
}
(async()=>{const elements=new Map(),get=s=>{if(!elements.has(s))elements.set(s,new Element());return elements.get(s)};
let clock=100,queue=[];const win=new Element(),media=new Element();media.matches=false;
const ctx=vm.createContext({document:{querySelector:get,createElement:()=>new Element(),createTextNode:t=>({textContent:t}),body:new Element()},window:win,innerWidth:390,innerHeight:844,matchMedia:()=>media,performance:{now:()=>clock},requestAnimationFrame:f=>{queue.push(f);return queue.length},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'dist/albums.json')))}),setTimeout:()=>1,clearTimeout:()=>{},console});
vm.runInContext(fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),ctx);await new Promise(r=>setImmediate(r));
const run=s=>vm.runInContext(s,ctx),tick=(ms=16)=>{clock+=ms;const frames=queue;queue=[];frames.forEach(f=>f(clock))};tick();
assert.equal(run('cards.length'),80);
assert(run('cards.every((a,i)=>cards.slice(i+1).every(b=>Math.abs(a.album.x+a.x-b.album.x-b.x)>(a.w+b.w)/2||Math.abs(a.album.y+a.y-b.album.y-b.y)>(a.h+b.h)/2+15))'));
const positions=run('JSON.stringify(cards.map(c=>[c.x,c.y,c.album.x,c.album.y]))');
assert(run('albums.every(a=>a.scale===1)'));
assert.equal(run('albums.length'),8);
assert(run('albums.every(a=>!a.paragraphs||a.paragraphs.join(" ")===a.subtitle)'));
assert(run('cards.every(c=>albums.every(a=>a.blocks.every(b=>Math.abs(c.worldX-a.x-b.x)>(c.w+b.w)/2||Math.abs(c.worldY-a.y-b.y)>(c.h+b.h)/2+12)))'));
assert(run('albums.every(a=>a.blocks.slice(1).every((b,i)=>{const p=cards.filter(c=>c.album===a&&c.photo.id!==a.leadPhotoId)[i],previous=a.blocks[i];return p.pinned&&(a.leadPhotoId?b.x===previous.x&&b.y-b.h/2>=previous.y+previous.h/2+27&&p.y===b.y&&Math.abs(p.x-b.x)>(p.w+b.w)/2:p.y-p.h/2>previous.y+previous.h/2&&p.y+p.h/2<b.y-b.h/2);}))'));
assert(run('albums.filter(a=>a.leadPhotoId).every(a=>{const p=cards.find(c=>c.photo.id===a.leadPhotoId),b=a.blocks[0];return p.pinned&&p.x===b.x&&p.y+p.h/2+26<b.y-b.h/2;})'));
assert(run('initialZoom()<baseZoom()'),'Mobile opening is not zoomed out');

assert(run('cards.filter(c=>c.img.src).length')<80);
const c=get('#canvas');
const before=run('camera.z');
c.emit('pointerdown',{button:0,pointerId:1,clientX:300,clientY:400});
clock+=16;c.emit('pointermove',{pointerId:1,clientX:100,clientY:400});tick();
for(let i=0;i<20;i++)tick();assert.equal(run('camera.z'),before,'Zoom changes underneath an active drag');
assert(run('camera.x')>0);assert(run('suppressClickUntil')>clock);
// Finish a long drag just off a known cluster center, independent of its layout.
const finish=run('({x:100-(albums[3].x+80-camera.x)*camera.z,y:400-(albums[3].y-camera.y)*camera.z})');
clock+=16;c.emit('pointermove',{pointerId:1,clientX:finish.x,clientY:finish.y});
clock+=120;c.emit('pointerup',{pointerId:1});for(let i=0;i<250;i++)tick();
assert(Math.abs(run('camera.x-albums[3].x'))<.01);assert(Math.abs(run('camera.y-albums[3].y'))<.01);
assert.equal(run('camera.z'),before,'Mobile snap automatically zooms');assert(run('albums[3].scale')===1);
assert.equal(run('JSON.stringify(cards.map(c=>[c.x,c.y,c.album.x,c.album.y]))'),positions);
assert(run('cards.every(c=>Math.abs((c.worldX-camera.x)*camera.z)>=width/2+c.w*camera.z/2||Math.abs((c.worldY-camera.y)*camera.z)>=height/2+(c.h+30)*camera.z/2||c.el.style.visibility==="visible")'));
assert.equal(run('cards.filter(c=>c.pinned).length'),6);
assert(run('cards.filter(c=>c.photo.overviewPosition).length===2&&cards.filter(c=>c.photo.overviewPosition).every(c=>c.pinned&&c.worldX===c.photo.overviewPosition.x&&c.worldY===c.photo.overviewPosition.y)'));
assert.equal(run('albums.reduce((n,a)=>n+a.blocks.length,0)'),11);
assert(run('imageLoads<=3'));
const writes=run('cards.reduce((n,c)=>n+c.button.tabWrites,0)');
for(let i=0;i<100;i++){run('requestFrame()');tick();}
assert.equal(run('cards.reduce((n,c)=>n+c.button.tabWrites,0)'),writes,'Idle frames rewrite every photo tab index');
run('innerHeight=800');win.emit('resize');tick();
assert.equal(run('JSON.stringify(cards.map(c=>[c.x,c.y,c.album.x,c.album.y]))'),positions,'Mobile toolbar resize repacks the entire canvas');
run('innerHeight=844');win.emit('resize');tick();
assert(run('albums.every(a=>!a.el.style.opacity||Number(a.el.style.opacity)===1)'));
assert(!get('#letter').style.opacity);assert(!get('#letter').style.visibility);
// Short drags inside the selected cluster must not snap back.
const inside=run('camera.x');c.emit('pointerdown',{button:0,pointerId:2,clientX:200,clientY:400});clock+=16;
c.emit('pointermove',{pointerId:2,clientX:180,clientY:400});clock+=120;c.emit('pointerup',{pointerId:2});
for(let i=0;i<100;i++)tick();assert(run('camera.x')>inside+10);assert.equal(run('flight'),null);assert.equal(run('camera.z'),before,'Mobile free pan automatically zooms');
c.emit('pointerdown',{button:0,pointerId:3,clientX:100,clientY:300});c.emit('pointerdown',{button:0,pointerId:4,clientX:200,clientY:300});
const pinch=run('manualZoom');c.emit('pointermove',{pointerId:4,clientX:250,clientY:300});assert(run('manualZoom')>pinch);
c.emit('pointercancel',{pointerId:3});c.emit('pointercancel',{pointerId:4});assert.equal(run('vx+vy'),0);
run('goTo(200,300)');win.emit('blur');tick();assert.equal(run('camera.x'),200);assert.equal(run('camera.y'),300);
media.matches=true;run('goTo(0,0)');assert.equal(run('camera.x'),0);assert.equal(run('flight'),null);
// All gestures remain finite, and the opening can be restored from the keyboard.
win.emit('keydown',{key:'Home'});for(let i=0;i<30;i++)tick();assert.equal(run('manualZoom'),1);assert(Number.isFinite(run('camera.z')));
// Pan limits must expose the actual outer media, not just the album centers.
for(const [x,y,axis,edge,screenLimit] of [[1e6,0,'x','right',350],[-1e6,0,'x','left',40],[0,1e6,'y','bottom',804],[0,-1e6,'y','top',40]]) {
  run(`manualZoom=1;goTo(${x},${y},initialZoom())`);for(let i=0;i<60;i++)tick();
  const projected=run(`(sceneBounds.${edge}-camera.${axis})*camera.z+${axis==='x'?'width':'height'}/2`);
  assert(Math.abs(projected-screenLimit)<.1,`${edge} edge unreachable: ${projected}`);
}
// At the farthest zoom, the entire heart fits on a phone and remains still on pan.
run('goTo(0,0);zoomAt(.001)');tick();
assert(run('camera.z<.12'),'Phone overview cannot zoom out far enough');
for(const [edge,axis,size] of [['left','x','width'],['right','x','width'],['top','y','height'],['bottom','y','height']]) {
  const projected=run(`(sceneBounds.${edge}-camera.${axis})*camera.z+${size}/2`);
  assert(projected>=39.9&&projected<=run(size)-39.9,`${edge} does not fit in overview`);
}
assert(run('cards.every(c=>c.el.style.visibility==="visible")'),'Overview hides a photo');
const overviewZoom=run('camera.z');
run('beginGesture();camera.x+=200;maybeSnap();requestFrame()');tick();
assert.equal(run('camera.z'),overviewZoom);assert.equal(run('flight'),null);
const overviewCamera=run('JSON.stringify(camera)');
for(let i=0;i<10;i++){run('zoomAt(.8)');tick();}
assert.equal(run('JSON.stringify(camera)'),overviewCamera,'Zoom limit shifts on repeated pinches');
// The silhouette stays recognizable: two lobes, an open notch, a narrow tip.
assert(run('cards.every(c=>fitsHeart({x:c.worldX,y:c.worldY,w:c.w,h:c.h}))'));
assert(run('albums.every(a=>a.shapes.every(s=>fitsHeart({...s,x:a.x+s.x,y:a.y+s.y})))'));
assert(run('cards.some(c=>c.worldX < -600 && c.worldY < -1200) && cards.some(c=>c.worldX > 600 && c.worldY < -1200)'));
assert(run('!cards.some(c=>Math.abs(c.worldX)<200&&c.worldY < -1400)'));
assert(run('Math.abs((sceneBounds.bottom+sceneBounds.top)/2)<400'),'Heart is not centered around the opening message');
assert(run('cards.every(c=>{const own=Math.min(...c.album.blocks.map(b=>Math.hypot(c.x-b.x,c.y-b.y)));return own<1700&&albums.every(a=>a===c.album||Math.min(...a.blocks.map(b=>Math.hypot(c.worldX-a.x-b.x,c.worldY-a.y-b.y)))+651>=own);})'),'Photos stray from their album text');
win.emit('keydown',{key:'Home'});tick();assert.equal(run('camera.x'),0);assert.equal(run('camera.y'),0);
// Desktop retains its gentle approach zoom; explicit mobile zoom remains manual.
run('innerWidth=1440;innerHeight=1000;coarsePointer.matches=false');win.emit('resize');tick();
run('manualZoom=1;goTo(0,0,initialZoom())');for(let i=0;i<60;i++)tick();
const desktopZoom=run('camera.z');run('goTo(albums[3].x,albums[3].y)');for(let i=0;i<60;i++)tick();
assert(run('camera.z')>desktopZoom);
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');assert(!html.includes('id="places"'));assert(!html.includes('class="controls"'));assert(!html.includes('little-star'));assert(!html.includes('a little world of us'));assert(html.includes('drag gently, in any direction'));assert(html.includes('↖')&&html.includes('↗'));
// Verify every generated image is present and original album counts are preserved.
const albums=JSON.parse(fs.readFileSync(path.join(root,'dist/albums.json')));assert.deepEqual(albums.map(a=>a.photos.length),[5,17,11,16,11,8,9,3]);for(const a of albums)for(const p of a.photos){assert(fs.statSync(path.join(root,'dist',p.src)).size>0);assert(fs.statSync(path.join(root,'dist',p.full)).size>0)}
console.log('PASS: heart outline; whole-scene phone zoom; round centered heart; grouped photos; yellow-jumper lead photo; stable overview; manual mobile zoom; stable drag zoom; bounded image loading; no repeated photo writes; stable height-only resize; interleaved stories; 80 photos / 8 albums; global photo spacing; stable positions; persistent visibility; larger distant photos; approach growth; long-drag snap; free movement inside clusters; pinch; cancellation; focus loss; reduced motion; no controls; all four outer edges reachable; 160 assets.');
})();
