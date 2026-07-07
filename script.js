// script.js
let frames = { portrait: null, landscape: null };
let photosFiles = [];
let batch = [];
let currentEditorIndex = 0;
let activeTool = 'crop';
let cropState = null;
let cropActive = false;
let isDragging = false;
let dragStart = null;
let dragHandle = null;
const HANDLE_SIZE = 10;
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 30;

// ================= THEME SYSTEM =================
function switchTheme(theme) {
  document.body.className = `theme-${theme}`;
  localStorage.setItem('sweff-theme', theme);
}
function switchCustomTheme() {
  const bg = prompt("Enter Custom Background Color (e.g., #222222 or red):", "#2c3e50");
  const txt = prompt("Enter Custom Text Color (e.g., #ffffff):", "#ecf0f1");
  if(bg && txt) {
    document.documentElement.style.setProperty('--custom-bg', bg);
    document.documentElement.style.setProperty('--custom-text', txt);
    switchTheme('custom');
  }
}
(function loadTheme() {
  const saved = localStorage.getItem('sweff-theme');
  if (saved) switchTheme(saved);
})();

// ================= POPUP =================
function triggerBmcPopup() {
  setTimeout(() => {
    document.getElementById('bmcPopup').classList.add('show');
  }, Math.floor(Math.random() * 15000) + 10000);
}
function closeBmcPopup() {
  document.getElementById('bmcPopup').classList.remove('show');
}
window.addEventListener('load', triggerBmcPopup);

// ================= UPLOAD LOGIC =================
function detectOrientation(img) {
  return img.width > img.height ? 'landscape' : 'portrait';
}
document.getElementById('frameInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 2) {
    alert("You can only upload a maximum of 2 frames (1 Portrait and 1 Landscape).");
    e.target.value = '';
    return;
  }
  frames = { portrait: null, landscape: null };
  for (let file of files) {
    const img = await loadImage(file);
    const orientation = detectOrientation(img);
    if (orientation === 'portrait') {
      if (frames.portrait) { alert("Cannot accept two portrait frames."); e.target.value=''; frames={portrait:null, landscape:null}; return; }
      frames.portrait = { file, img };
    } else {
      if (frames.landscape) { alert("Cannot accept two landscape frames."); e.target.value=''; frames={portrait:null, landscape:null}; return; }
      frames.landscape = { file, img };
    }
  }
  let msg = "Frames Accepted: \n";
  if(frames.portrait) msg += "- 1 Portrait\n";
  if(frames.landscape) msg += "- 1 Landscape\n";
  alert(msg);
});
document.getElementById('photosInput').addEventListener('change', async (e) => {
  photosFiles = Array.from(e.target.files);
  alert(`${photosFiles.length} photos loaded.`);
});

async function loadImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ================= PREVIEW =================
async function generatePreview() {
  if (!frames.portrait && !frames.landscape) { alert("Please upload at least one frame first."); return; }
  if (photosFiles.length === 0) { alert("Please upload photos."); return; }
  batch = [];
  document.getElementById('previewContent').innerHTML = '<div class="grid-thumbs" id="previewGrid"></div>';
  const grid = document.getElementById('previewGrid');
  for (let i = 0; i < photosFiles.length; i++) {
    const img = await loadImage(photosFiles[i]);
    const orient = detectOrientation(img);
    let targetFrame = orient === 'portrait' ? frames.portrait : frames.landscape;
    if (!targetFrame) continue;
    const item = {
      photo: img, frame: targetFrame.img, index: batch.length,
      settings: {
        exposure:0, contrast:0, highlights:0, shadows:0, whites:0, blacks:0,
        temperature:0, tint:0, vibrance:0, saturation:0, hue:0,
        sharpening:0, noise:0, clarity:0, dehaze:0, gamma:100,
        scale:100, rotation:0, opacity:100,
        cropActive: false, cropX:0, cropY:0, cropW:1, cropH:1,
      }
    };
    batch.push(item);
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    const canvas = document.createElement('canvas'); thumb.appendChild(canvas);
    grid.appendChild(thumb);
    renderCanvas(item, canvas);
  }
  if(batch.length === 0) document.getElementById('previewContent').innerHTML = '<p class="empty-state">No photos matched the orientation.</p>';
}

function getPhotoBoundsOnCanvas(canvasWidth, canvasHeight, photoWidth, photoHeight) {
  const scaleFit = Math.max(canvasWidth / photoWidth, canvasHeight / photoHeight);
  const dw = photoWidth * scaleFit;
  const dh = photoHeight * scaleFit;
  return { dx: (canvasWidth-dw)/2, dy: (canvasHeight-dh)/2, dw, dh, scaleFit };
}

function renderCanvas(item, canvas) {
  const { photo, frame, settings } = item;
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(canvas.width/2, canvas.height/2);
  ctx.rotate(settings.rotation * Math.PI/180);
  const s = settings.scale/100; ctx.scale(s,s);
  const br = 100 + Number(settings.exposure) + Number(settings.whites)*0.5 - Number(settings.blacks)*0.3;
  const ct = 100 + Number(settings.contrast) + Number(settings.clarity)*0.3;
  const sat = 100 + Number(settings.saturation) + Number(settings.vibrance)*0.7;
  ctx.filter = `brightness(${br}%) contrast(${ct}%) saturate(${sat}%) hue-rotate(${settings.hue}deg) opacity(${settings.opacity/100})`;
  const bounds = getPhotoBoundsOnCanvas(canvas.width, canvas.height, photo.width, photo.height);
  let sx=0,sy=0,sw=photo.width,sh=photo.height;
  if (settings.cropActive) {
    const cX = settings.cropX * canvas.width, cY = settings.cropY * canvas.height;
    const cW = settings.cropW * canvas.width, cH = settings.cropH * canvas.height;
    sx = (cX - bounds.dx) / bounds.scaleFit; sy = (cY - bounds.dy) / bounds.scaleFit;
    sw = cW / bounds.scaleFit; sh = cH / bounds.scaleFit;
    sx = Math.max(0,Math.min(photo.width,sx)); sy = Math.max(0,Math.min(photo.height,sy));
    sw = Math.max(1,Math.min(photo.width-sx,sw)); sh = Math.max(1,Math.min(photo.height-sy,sh));
  }
  const adjustedW = settings.cropActive ? bounds.dw * settings.cropW : bounds.dw;
  const adjustedH = settings.cropActive ? bounds.dh * settings.cropH : bounds.dh;
  const finalScale = Math.max((canvas.width/s)/adjustedW, (canvas.height/s)/adjustedH);
  ctx.drawImage(photo, sx, sy, sw, sh, -adjustedW*finalScale/2, -adjustedH*finalScale/2, adjustedW*finalScale, adjustedH*finalScale);
  ctx.filter = 'none'; ctx.restore();
  ctx.drawImage(frame,0,0,canvas.width,canvas.height);
}

// ================= EDITOR =================
function openFullscreenEditor() {
  if(batch.length===0) { alert("Generate a preview first!"); return; }
  currentEditorIndex=0; document.getElementById('fullEditor').classList.add('show');
  activateTool('crop'); loadEditorUI(); pushUndoSnapshot(); updateEditor();
}
function closeFullscreenEditor() {
  deactivateCropMode(); document.getElementById('fullEditor').classList.remove('show');
  generatePreview();
}
function loadEditorUI() {
  const item = batch[currentEditorIndex];
  Object.keys(item.settings).forEach(k => { const el=document.getElementById(`ed_${k}`); if(el) el.value=item.settings[k]; });
  initCropFromSettings(); undoStack=[getSnapshot()]; redoStack=[]; updateEditor();
}
function initCropFromSettings() {
  const item = batch[currentEditorIndex];
  const canvas = document.getElementById('mainEditorCanvas');
  if(item.settings.cropActive) {
    cropState={x:item.settings.cropX*canvas.width, y:item.settings.cropY*canvas.height, w:item.settings.cropW*canvas.width, h:item.settings.cropH*canvas.height};
  } else {
    cropState={x:canvas.width*0.1, y:canvas.height*0.1, w:canvas.width*0.8, h:canvas.height*0.8};
  }
  cropActive=(activeTool==='crop'); updateCropToolbarVisibility();
}
function updateEditor() {
  const item = batch[currentEditorIndex];
  Object.keys(item.settings).forEach(k => { const el=document.getElementById(`ed_${k}`); if(el) item.settings[k]=el.value; });
  const canvas=document.getElementById('mainEditorCanvas');
  renderCanvas(item,canvas);
  if(cropActive && cropState) drawCropOverlay(canvas,cropState);
}
function drawCropOverlay(canvas, crop) {
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  const cx=Math.max(0,Math.min(w,crop.x)), cy=Math.max(0,Math.min(h,crop.y));
  const cw=Math.max(5,Math.min(w-cx,crop.w)), ch=Math.max(5,Math.min(h-cy,crop.h));
  ctx.fillStyle='rgba(0,0,0,0.55)';
  ctx.fillRect(0,0,w,cy); ctx.fillRect(0,cy+ch,w,h-(cy+ch));
  ctx.fillRect(0,cy,cx,ch); ctx.fillRect(cx+cw,cy,w-(cx+cw),ch);
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.setLineDash([6,3]); ctx.strokeRect(cx,cy,cw,ch); ctx.setLineDash([]);
  ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=0.8; ctx.setLineDash([4,6]);
  for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(cx+cw/3*i,cy); ctx.lineTo(cx+cw/3*i,cy+ch); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx,cy+ch/3*i); ctx.lineTo(cx+cw,cy+ch/3*i); ctx.stroke(); }
  ctx.setLineDash([]);
  const handles=[{x:cx,y:cy,id:'tl'},{x:cx+cw,y:cy,id:'tr'},{x:cx,y:cy+ch,id:'bl'},{x:cx+cw,y:cy+ch,id:'br'},{x:cx+cw/2,y:cy,id:'top'},{x:cx+cw/2,y:cy+ch,id:'bottom'},{x:cx,y:cy+ch/2,id:'left'},{x:cx+cw,y:cy+ch/2,id:'right'}];
  handles.forEach(h=>{ ctx.fillStyle='#fff'; ctx.fillRect(h.x-HANDLE_SIZE/2,h.y-HANDLE_SIZE/2,HANDLE_SIZE,HANDLE_SIZE); ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1; ctx.strokeRect(h.x-HANDLE_SIZE/2,h.y-HANDLE_SIZE/2,HANDLE_SIZE,HANDLE_SIZE); });
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(cx,cy-22,ctx.measureText(`${Math.round(cw)}×${Math.round(ch)}`).width+16,20);
  ctx.fillStyle='#fff'; ctx.font='11px monospace'; ctx.fillText(`${Math.round(cw)}×${Math.round(ch)}`,cx+8,cy-6);
}
function updateCropToolbarVisibility() {
  document.getElementById('cropToolbar').classList.toggle('visible', cropActive && activeTool==='crop');
  document.getElementById('mainEditorCanvas').classList.toggle('crop-mode', cropActive && activeTool==='crop');
}
function activateTool(tool) {
  if(activeTool==='crop' && tool!=='crop') deactivateCropMode();
  activeTool=tool;
  document.querySelectorAll('.tool-btn').forEach(b=>b.classList.toggle('active-tool', b.dataset.tool===tool));
  if(tool==='crop') { cropActive=true; initCropFromSettings(); } else { cropActive=false; }
  updateEditor(); updateCropToolbarVisibility();
}
function deactivateCropMode() { cropActive=false; updateCropToolbarVisibility(); updateEditor(); }
function applyCrop() {
  if(!cropState) return;
  const canvas=document.getElementById('mainEditorCanvas'), w=canvas.width, h=canvas.height;
  const item=batch[currentEditorIndex];
  item.settings.cropActive=true; item.settings.cropX=Math.max(0,cropState.x)/w; item.settings.cropY=Math.max(0,cropState.y)/h;
  item.settings.cropW=Math.max(5,Math.min(w-cropState.x,cropState.w))/w; item.settings.cropH=Math.max(5,Math.min(h-cropState.y,cropState.h))/h;
  cropActive=false; updateCropToolbarVisibility(); updateEditor(); pushUndoSnapshot(); alert('✅ Crop applied!');
}
function cancelCropMode() { cropActive=false; updateCropToolbarVisibility(); initCropFromSettings(); updateEditor(); }
function resetCropRect() {
  const canvas=document.getElementById('mainEditorCanvas');
  cropState={x:canvas.width*0.05, y:canvas.height*0.05, w:canvas.width*0.9, h:canvas.height*0.9};
  updateEditor();
}
// Mouse events
function getCanvasCoords(e){ const c=document.getElementById('mainEditorCanvas'); const r=c.getBoundingClientRect(); return {x:(e.clientX-r.left)*c.width/r.width, y:(e.clientY-r.top)*c.height/r.height}; }
function getHandleAt(x,y){
  if(!cropState) return null;
  const cx=cropState.x, cy=cropState.y, cw=cropState.w, ch=cropState.h;
  const handles=[{x:cx,y:cy,id:'tl'},{x:cx+cw,y:cy,id:'tr'},{x:cx,y:cy+ch,id:'bl'},{x:cx+cw,y:cy+ch,id:'br'},{x:cx+cw/2,y:cy,id:'top'},{x:cx+cw/2,y:cy+ch,id:'bottom'},{x:cx,y:cy+ch/2,id:'left'},{x:cx+cw,y:cy+ch/2,id:'right'}];
  for(const h of handles) if(Math.abs(x-h.x)<HANDLE_SIZE+4 && Math.abs(y-h.y)<HANDLE_SIZE+4) return h.id;
  if(x>=cx && x<=cx+cw && y>=cy && y<=cy+ch) return 'move';
  return null;
}
document.getElementById('mainEditorCanvas').addEventListener('mousedown', function(e){
  if(!cropActive||activeTool!=='crop') return;
  const coords=getCanvasCoords(e); const handle=getHandleAt(coords.x,coords.y);
  if(handle){ isDragging=true; dragStart=coords; dragHandle=handle; e.preventDefault(); }
  else if(cropState){ isDragging=true; dragStart=coords; dragHandle='new'; cropState.x=coords.x; cropState.y=coords.y; cropState.w=1; cropState.h=1; e.preventDefault(); }
});
document.getElementById('mainEditorCanvas').addEventListener('mousemove', function(e){
  if(!cropActive||activeTool!=='crop') return;
  const coords=getCanvasCoords(e);
  if(isDragging&&dragHandle&&cropState){
    const dx=coords.x-dragStart.x, dy=coords.y-dragStart.y, c=document.getElementById('mainEditorCanvas'), min=10;
    switch(dragHandle){
      case'tl': cropState.x=Math.max(0,Math.min(cropState.x+cropState.w-min,cropState.x+dx)); cropState.y=Math.max(0,Math.min(cropState.y+cropState.h-min,cropState.y+dy)); cropState.w=Math.max(min,cropState.w-dx); cropState.h=Math.max(min,cropState.h-dy); break;
      case'tr': cropState.y=Math.max(0,Math.min(cropState.y+cropState.h-min,cropState.y+dy)); cropState.w=Math.max(min,cropState.w+dx); cropState.h=Math.max(min,cropState.h-dy); break;
      case'bl': cropState.x=Math.max(0,Math.min(cropState.x+cropState.w-min,cropState.x+dx)); cropState.w=Math.max(min,cropState.w-dx); cropState.h=Math.max(min,cropState.h+dy); break;
      case'br': cropState.w=Math.max(min,cropState.w+dx); cropState.h=Math.max(min,cropState.h+dy); break;
      case'top': cropState.y=Math.max(0,Math.min(cropState.y+cropState.h-min,cropState.y+dy)); cropState.h=Math.max(min,cropState.h-dy); break;
      case'bottom': cropState.h=Math.max(min,cropState.h+dy); break;
      case'left': cropState.x=Math.max(0,Math.min(cropState.x+cropState.w-min,cropState.x+dx)); cropState.w=Math.max(min,cropState.w-dx); break;
      case'right': cropState.w=Math.max(min,cropState.w+dx); break;
      case'move': cropState.x=Math.max(0,Math.min(c.width-cropState.w,cropState.x+dx)); cropState.y=Math.max(0,Math.min(c.height-cropState.h,cropState.y+dy)); break;
      case'new': cropState.w=Math.max(min,dx); cropState.h=Math.max(min,dy); if(dx<0){cropState.x=coords.x; cropState.w=Math.abs(dx);} if(dy<0){cropState.y=coords.y; cropState.h=Math.abs(dy);} break;
    }
    dragStart=coords; updateEditor(); return;
  }
  if(cropState) this.style.cursor={tl:'nwse-resize',br:'nwse-resize',tr:'nesw-resize',bl:'nesw-resize',top:'ns-resize',bottom:'ns-resize',left:'ew-resize',right:'ew-resize',move:'move'}[getHandleAt(coords.x,coords.y)]||'crosshair';
});
document.addEventListener('mouseup',()=>{ if(isDragging){ isDragging=false; dragHandle=null; dragStart=null; if(cropState&&cropState.w<10) cropState.w=10; if(cropState&&cropState.h<10) cropState.h=10; updateEditor(); } });
document.addEventListener('keydown',(e)=>{ if(document.getElementById('fullEditor').classList.contains('show') && activeTool==='crop'&&cropActive){ if(e.key==='Enter'){ e.preventDefault(); applyCrop(); } else if(e.key==='Escape'){ e.preventDefault(); cancelCropMode(); } } });

function editorNext(){ if(currentEditorIndex<batch.length-1){ deactivateCropMode(); currentEditorIndex++; loadEditorUI(); if(activeTool==='crop'){ cropActive=true; initCropFromSettings(); } updateEditor(); updateCropToolbarVisibility(); } }
function editorPrev(){ if(currentEditorIndex>0){ deactivateCropMode(); currentEditorIndex--; loadEditorUI(); if(activeTool==='crop'){ cropActive=true; initCropFromSettings(); } updateEditor(); updateCropToolbarVisibility(); } }
function applyToAll(){ const cur={...batch[currentEditorIndex].settings}; batch.forEach(i=>i.settings={...cur}); alert('✅ Settings applied to all images!'); }
function saveEditorChanges(){ if(cropActive&&cropState){ if(confirm('Apply crop before saving?')) applyCrop(); else deactivateCropMode(); } closeFullscreenEditor(); }

function getSnapshot(){ return JSON.parse(JSON.stringify({settings:batch[currentEditorIndex].settings, cropState:cropState?{...cropState}:null, cropActive})); }
function restoreSnapshot(s){ batch[currentEditorIndex].settings=JSON.parse(JSON.stringify(s.settings)); cropState=s.cropState?{...s.cropState}:null; cropActive=s.cropActive; loadEditorUIFromSnapshot(); updateEditor(); updateCropToolbarVisibility(); }
function loadEditorUIFromSnapshot(){ const item=batch[currentEditorIndex]; Object.keys(item.settings).forEach(k=>{const el=document.getElementById(`ed_${k}`); if(el) el.value=item.settings[k];}); }
function pushUndoSnapshot(){ undoStack.push(getSnapshot()); if(undoStack.length>MAX_UNDO) undoStack.shift(); redoStack=[]; }
function undoAction(){ if(undoStack.length<=1){ alert('Nothing to undo.'); return; } redoStack.push(undoStack.pop()); restoreSnapshot(undoStack[undoStack.length-1]); }
function redoAction(){ if(redoStack.length===0){ alert('Nothing to redo.'); return; } undoStack.push(redoStack.pop()); restoreSnapshot(undoStack[undoStack.length-1]); }

async function downloadZip(){
  if(batch.length===0){ alert('Nothing to download!'); return; }
  const zip=new JSZip();
  for(let i=0;i<batch.length;i++){ const c=document.createElement('canvas'); renderCanvas(batch[i],c); const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',0.95)); zip.file(`framed_${String(i+1).padStart(3,'0')}.jpg`,blob); }
  zip.generateAsync({type:'blob'}).then(c=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(c); a.download='Sweff_Framed_Batch.zip'; a.click(); });
}
