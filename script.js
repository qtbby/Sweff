// ======================== DEVICE DETECTION ========================
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
}
function getEditorDisplaySize() {
  return isMobile() ? Math.min(window.innerWidth - 40, 320) : Math.min(window.innerWidth - 100, 480);
}

// ======================== GLOBALS ================================
const MAX_DECODE_PX = 1200;
const THUMB_W = 120;
const YIELD_MS = 30;
const THUMB_Q = 0.72;
const FINAL_Q = 0.90;

let frameCanvasP = null, frameCanvasL = null;
let batchData = [];
let currentEditingIndex = null;
let galleryItems = [], galleryIndex = 0;
let masterState = { p: null, l: null };
let previewGenerated = false;

const $ = id => document.getElementById(id);
const yield$ = () => new Promise(r => setTimeout(r, YIELD_MS));
function setStatus(t) { $('status').textContent = t; }
function setProgress(n,total) { $('progressFill').style.width = (n/total*100)+'%'; }

function cloneCanvas(canvas) {
  let c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas,0,0);
  return c;
}

function loadScaledBitmap(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX_DECODE_PX || h > MAX_DECODE_PX) {
        let r = Math.min(MAX_DECODE_PX/w, MAX_DECODE_PX/h);
        w = Math.round(w*r); h = Math.round(h*r);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      resolve({ canvas:c, w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function loadFrameCanvas(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img,0,0);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function composite(photoCanvas, frameCanvas, crop, targetW) {
  const fW = frameCanvas.width, fH = frameCanvas.height;
  const scale = targetW / fW;
  const c = document.createElement('canvas');
  c.width = Math.round(fW * scale); c.height = Math.round(fH * scale);
  const ctx = c.getContext('2d');
  ctx.drawImage(photoCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  ctx.drawImage(frameCanvas, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', scale<1 ? THUMB_Q : FINAL_Q);
  c.width = 0;
  return url;
}

function getMeanLuminance(canvas) {
  let sW = Math.min(80, canvas.width), sH = Math.round(sW * canvas.height / canvas.width);
  let tmp = document.createElement('canvas'); tmp.width=sW; tmp.height=sH;
  tmp.getContext('2d').drawImage(canvas,0,0,sW,sH);
  let data = tmp.getContext('2d').getImageData(0,0,sW,sH).data;
  let sum=0;
  for(let i=0;i<data.length;i+=4) sum += data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
  return sum/(data.length/4);
}
function buildLUT(strength) {
  let lut = new Uint8ClampedArray(256);
  let gamma = 1.0 + strength*0.12;
  let highIn = 255 - strength*18, highOut = 255 - strength*28;
  for(let i=0;i<256;i++) {
    let v = 255 * Math.pow(i/255, gamma);
    if(i>highIn) { let t=(i-highIn)/(255-highIn); v = v*(1-t) + highOut*t; }
    lut[i]=Math.round(v);
  }
  return lut;
}
function applyLUT(canvas, lut) {
  let ctx = canvas.getContext('2d');
  let img = ctx.getImageData(0,0,canvas.width,canvas.height);
  let d=img.data;
  for(let i=0;i<d.length;i+=4) { d[i]=lut[d[i]]; d[i+1]=lut[d[i+1]]; d[i+2]=lut[d[i+2]]; }
  ctx.putImageData(img,0,0);
}
function autoFixExposure(canvas) {
  let toggle = $('autoExpToggle');
  if(!toggle || !toggle.checked) return false;
  let mode = document.querySelector('.exp-mode-btn.active-mode')?.dataset.mode || 'auto';
  let strength = parseInt($('expStrength').value) || 3;
  let should = (mode==='always') || (mode==='auto' && getMeanLuminance(canvas) > 165);
  if(should) { applyLUT(canvas, buildLUT(strength)); return true; }
  return false;
}

// ======================== MASTER EDITOR ===========================
function updateNormalizedCropFromState(st) {
  let cropPhoto = {
    x: -st.panX / st.scale,
    y: -st.panY / st.scale,
    w: st.displayW / st.scale,
    h: st.displayH / st.scale
  };
  st.normCrop = {
    x: cropPhoto.x / st.sampleBM.w,
    y: cropPhoto.y / st.sampleBM.h,
    w: cropPhoto.w / st.sampleBM.w,
    h: cropPhoto.h / st.sampleBM.h
  };
}

function resetMasterToCenter(st) {
  let photoAR = st.sampleBM.w / st.sampleBM.h;
  let frameAR = st.frameCanvas.width / st.frameCanvas.height;
  let initScale = photoAR > frameAR ? st.displayH / st.sampleBM.h : st.displayW / st.sampleBM.w;
  st.scale = initScale;
  st.panX = (st.displayW - st.sampleBM.w * st.scale) / 2;
  st.panY = (st.displayH - st.sampleBM.h * st.scale) / 2;
  updateNormalizedCropFromState(st);
  drawMaster(st);
}

function drawMaster(st) {
  if(!st || !st.sampleBM) return;
  let ctx = st.photoCtx;
  ctx.clearRect(0,0,st.displayW,st.displayH);
  ctx.drawImage(st.sampleBM.canvas, 0,0,st.sampleBM.w,st.sampleBM.h, st.panX,st.panY, st.sampleBM.w*st.scale, st.sampleBM.h*st.scale);
}

function attachPanEvents(wrap, state, redrawFn) {
  let clamp = (s) => {
    let pw = s.sampleBM.w * s.scale, ph = s.sampleBM.h * s.scale;
    s.panX = Math.min(0, Math.max(s.displayW - pw, s.panX));
    s.panY = Math.min(0, Math.max(s.displayH - ph, s.panY));
  };
  let onMove = () => { updateNormalizedCropFromState(state); redrawFn(state); };
  wrap.addEventListener('touchstart', e => {
    if(e.touches.length===2) { state.pinching=true; state.dragging=false; state.lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }
    else { state.dragging=true; state.lastX=e.touches[0].clientX; state.lastY=e.touches[0].clientY; }
    e.preventDefault();
  }, {passive:false});
  wrap.addEventListener('touchmove', e => {
    if(state.pinching && e.touches.length===2) {
      let dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      let ratio=dist/state.lastDist, newScale=Math.min(state.maxScale, Math.max(state.minScale, state.scale*ratio));
      let rect=wrap.getBoundingClientRect(), cx=(e.touches[0].clientX+e.touches[1].clientX)/2 - rect.left, cy=(e.touches[0].clientY+e.touches[1].clientY)/2 - rect.top;
      let sr=newScale/state.scale;
      state.panX = cx - sr*(cx-state.panX);
      state.panY = cy - sr*(cy-state.panY);
      state.scale = newScale; state.lastDist=dist;
      clamp(state); onMove(); e.preventDefault();
    } else if(state.dragging) {
      let dx=e.touches[0].clientX-state.lastX, dy=e.touches[0].clientY-state.lastY;
      state.panX+=dx; state.panY+=dy;
      state.lastX=e.touches[0].clientX; state.lastY=e.touches[0].clientY;
      clamp(state); onMove(); e.preventDefault();
    }
  }, {passive:false});
  wrap.addEventListener('touchend',()=>{ state.dragging=false; state.pinching=false; });
  wrap.addEventListener('mousedown', e => { state.dragging=true; state.lastX=e.clientX; state.lastY=e.clientY; e.preventDefault(); });
  window.addEventListener('mousemove', e => { if(!state.dragging) return; state.panX+=e.clientX-state.lastX; state.panY+=e.clientY-state.lastY; state.lastX=e.clientX; state.lastY=e.clientY; clamp(state); onMove(); });
  window.addEventListener('mouseup',()=>{ state.dragging=false; });
  wrap.addEventListener('wheel', e => { let delta=e.deltaY>0?0.9:1.1; let ns=Math.min(state.maxScale, Math.max(state.minScale, state.scale*delta)); let rect=wrap.getBoundingClientRect(), px=e.clientX-rect.left, py=e.clientY-rect.top, sr=ns/state.scale; state.panX=px - sr*(px-state.panX); state.panY=py - sr*(py-state.panY); state.scale=ns; clamp(state); onMove(); e.preventDefault(); }, {passive:false});
}

function buildEditor(key, sampleBM, frameCanvas) {
  const fW = frameCanvas.width, fH = frameCanvas.height, frameAR = fW/fH;
  const box = document.createElement('div'); box.className = 'editor-box';
  box.innerHTML = `<h4>${key==='p'?'Portrait':'Landscape'} Master Crop <button class="reset-crop-btn">⟲ Reset to Center</button><button class="redraw-btn">🔄 Redraw</button></h4><p>Drag/zoom – applies to all photos</p><div class="pan-wrap" id="master-wrap-${key}"><canvas id="master-photo-${key}"></canvas><canvas id="master-frame-${key}" class="frame-canvas"></canvas></div>`;
  $('editors-container').appendChild(box);
  let photoCanvas = $(`master-photo-${key}`), fOverlay = $(`master-frame-${key}`), wrap = $(`master-wrap-${key}`);
  let displayW = getEditorDisplaySize(), displayH = Math.round(displayW/frameAR);
  photoCanvas.width = displayW; photoCanvas.height = displayH;
  fOverlay.width = displayW; fOverlay.height = displayH;
  wrap.style.height = displayH+'px';
  fOverlay.getContext('2d').drawImage(frameCanvas,0,0,displayW,displayH);
  let photoAR = sampleBM.w/sampleBM.h;
  let initScale = photoAR > frameAR ? displayH/sampleBM.h : displayW/sampleBM.w;
  let state = {
    sampleBM, frameCanvas, displayW, displayH,
    panX: (displayW - sampleBM.w*initScale)/2,
    panY: (displayH - sampleBM.h*initScale)/2,
    scale: initScale, minScale: initScale, maxScale: initScale*5,
    photoCtx: photoCanvas.getContext('2d'), dragging:false, pinching:false
  };
  masterState[key] = state;
  updateNormalizedCropFromState(state);
  drawMaster(state);
  attachPanEvents(wrap, state, () => { updateNormalizedCropFromState(state); drawMaster(state); });
  box.querySelector('.reset-crop-btn').onclick = () => resetMasterToCenter(state);
  box.querySelector('.redraw-btn').onclick = () => drawMaster(state);
}

// ======================== DELETE PHOTO =================
function deletePhoto(index) {
  if (index < 0 || index >= batchData.length) return;
  const photo = batchData[index];
  if (!confirm(`Remove "${photo.file.name}" from the batch?`)) return;
  if (photo.modifiedCanvas) { photo.modifiedCanvas.width = 0; photo.modifiedCanvas = null; }
  batchData.splice(index, 1);
  const grid = $('grid-container');
  if (grid && grid.children[index]) grid.removeChild(grid.children[index]);
  for (let i = index; i < grid.children.length; i++) {
    const item = grid.children[i];
    const adjustBtn = item.querySelector('.btn-gray');
    if (adjustBtn) adjustBtn.setAttribute('onclick', `openModal(${i})`);
    const deleteBtn = item.querySelector('.btn-delete');
    if (deleteBtn) deleteBtn.setAttribute('onclick', `deletePhoto(${i})`);
  }
  if ($('gallery-overlay').classList.contains('open')) {
    galleryItems = [];
    for (let i = 0; i < batchData.length; i++) {
      const img = grid.children[i]?.querySelector('img');
      if (img) galleryItems.push({ batchIndex:i, thumbSrc:img.src, fileName:batchData[i].file.name });
    }
    if (galleryItems.length === 0) $('gallery-overlay').classList.remove('open');
    else { if (galleryIndex >= galleryItems.length) galleryIndex = galleryItems.length - 1; if (galleryIndex < 0) galleryIndex = 0; renderStrip(); showGalleryImage(galleryIndex); }
  }
  setStatus(`Photo removed. ${batchData.length} photos remaining.`);
  if (batchData.length === 0) { $('zipBtnTop').style.display = 'none'; $('previewAllBtn').style.display = 'none'; }
}

async function renderGrid() {
  const grid = $('grid-container');
  grid.innerHTML = '';
  if (batchData.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#666">No photos left. Generate new grid or reload editors.</p>';
    $('zipBtnTop').style.display = 'none';
    $('previewAllBtn').style.display = 'none';
    return;
  }
  grid.innerHTML = '<div style="text-align:center;padding:20px">Loading thumbnails...</div>';
  for (let i = 0; i < batchData.length; i++) {
    const data = batchData[i];
    const frameCanvas = data.isLandscape ? frameCanvasL : frameCanvasP;
    let thumbCanvas;
    if (data.modifiedCanvas) thumbCanvas = data.modifiedCanvas;
    else {
      const loaded = await loadScaledBitmap(data.file);
      if (!loaded) continue;
      thumbCanvas = loaded.canvas;
      autoFixExposure(thumbCanvas);
    }
    const thumbUrl = composite(thumbCanvas, frameCanvas, { x: data.cropX, y: data.cropY, w: data.cropW, h: data.cropH }, THUMB_W);
    const div = document.createElement('div'); div.className = 'grid-item';
    div.innerHTML = `<img src="${thumbUrl}" loading="lazy"><div class="btn-group"><button class="btn btn-gray" onclick="openModal(${i})">Adjust</button><button class="btn btn-delete" onclick="deletePhoto(${i})">🗑️ Delete</button></div>`;
    if (i === 0 && grid.firstChild && grid.firstChild.tagName === 'DIV' && grid.firstChild.innerText.includes('Loading')) grid.innerHTML = '';
    grid.appendChild(div);
    if (!data.modifiedCanvas) thumbCanvas.width = 0;
    await yield$();
  }
}

// ======================== PREVIEW GENERATION =======================
const previewBtn = $('previewBatchBtnTop');
previewBtn.onclick = async () => {
  previewBtn.style.opacity = '0.7';
  setTimeout(() => { previewBtn.style.opacity = '1'; }, 150);
  if (previewGenerated && !confirm("⚠️ Preview already exists.\nGenerate new one? (unsaved adjustments will be lost)")) return;
  previewBtn.disabled = true;
  $('editors-container').style.display = 'none';
  $('grid-preview-section').style.display = 'block';
  $('progressBar').style.display = 'block';
  batchData = [];
  let files = $('photosInput').files;
  let total = files.length;
  for(let i=0; i<total; i++) {
    setStatus(`Processing ${i+1}/${total}…`);
    setProgress(i,total);
    await yield$();
    let bm = await loadScaledBitmap(files[i]);
    if(!bm) { batchData.push({ file:files[i], isValid:false }); continue; }
    let isLandscape = bm.w > bm.h;
    let frameCanvas = isLandscape ? frameCanvasL : frameCanvasP;
    let master = isLandscape ? masterState.l : masterState.p;
    let isValid = !!(frameCanvas && master && master.normCrop);
    let crop = { x:0, y:0, w:bm.w, h:bm.h };
    if(isValid) {
      let nc = master.normCrop;
      crop.x = nc.x * bm.w; crop.y = nc.y * bm.h; crop.w = nc.w * bm.w; crop.h = nc.h * bm.h;
      if(crop.x < 0) crop.x = 0; if(crop.y < 0) crop.y = 0;
      if(crop.x + crop.w > bm.w) crop.w = bm.w - crop.x;
      if(crop.y + crop.h > bm.h) crop.h = bm.h - crop.y;
      if(crop.w <= 0 || crop.h <= 0) {
        let photoAR = bm.w/bm.h, frameAR = frameCanvas.width/frameCanvas.height;
        let fillScale = photoAR > frameAR ? frameCanvas.height/bm.h : frameCanvas.width/bm.w;
        crop.w = frameCanvas.width / fillScale; crop.h = frameCanvas.height / fillScale;
        crop.x = (bm.w - crop.w)/2; crop.y = (bm.h - crop.h)/2;
      }
    } else {
      let photoAR = bm.w/bm.h, frameAR = frameCanvas.width/frameCanvas.height;
      let fillScale = photoAR > frameAR ? frameCanvas.height/bm.h : frameCanvas.width/bm.w;
      crop.w = frameCanvas.width / fillScale; crop.h = frameCanvas.height / fillScale;
      crop.x = (bm.w - crop.w)/2; crop.y = (bm.h - crop.h)/2;
    }
    batchData.push({ file:files[i], isLandscape, isValid:true, cropX:crop.x, cropY:crop.y, cropW:crop.w, cropH:crop.h });
    bm.canvas.width = 0;
    await yield$();
  }
  setProgress(total,total);
  setTimeout(()=>$('progressBar').style.display='none',400);
  setStatus(`Done! ${batchData.length} photos framed.`);
  await renderGrid();
  $('zipBtnTop').style.display = 'block';
  $('previewAllBtn').style.display = 'block';
  previewGenerated = true;
  previewBtn.disabled = false;
};

// ======================== MODAL (brightness & position) ============
let mState = { sampleBM:null, frameCanvas:null, displayW:0,displayH:0, panX:0,panY:0, scale:1, minScale:1,maxScale:8 };
let modalPhotoCanvas = $('modal-photo-canvas'), modalFrameCanvas = $('modal-frame-canvas'), modalWrap = $('modal-pan-wrap');
let mCtx = modalPhotoCanvas.getContext('2d'), fCtx = modalFrameCanvas.getContext('2d');
let modalOrigCopy = null, modalWorking = null;
attachPanEvents(modalWrap, mState, () => { drawModal(); });

function drawModal() { if(!mState.sampleBM) return; mCtx.clearRect(0,0,mState.displayW,mState.displayH); mCtx.drawImage(mState.sampleBM.canvas,0,0,mState.sampleBM.w,mState.sampleBM.h, mState.panX,mState.panY, mState.sampleBM.w*mState.scale, mState.sampleBM.h*mState.scale); }

function initBrightnessUI() {
  if($('#brightness-panel')) return;
  let panel = document.createElement('div'); panel.id='brightness-panel'; panel.className='adjust-panel';
  panel.innerHTML = `<span>✨ Brightness</span><input type="range" id="modalBrightness" min="0.4" max="2.0" step="0.01" value="1.0"><span id="brightVal">1.00</span><button id="resetBrightness" class="reset-btn">Reset</button>`;
  $('modal-content').insertBefore(panel, $('modal-content').querySelector('.modal-btns'));
  let slider = $('#modalBrightness'), valSpan = $('#brightVal');
  slider.addEventListener('input', (e) => {
    let f = parseFloat(e.target.value);
    valSpan.innerText = f.toFixed(2);
    if(modalWorking && modalOrigCopy) {
      let restored = cloneCanvas(modalOrigCopy);
      let ctx = restored.getContext('2d');
      let img = ctx.getImageData(0,0,restored.width,restored.height);
      let d = img.data;
      for(let i=0;i<d.length;i+=4) { d[i]=Math.min(255,d[i]*f); d[i+1]=Math.min(255,d[i+1]*f); d[i+2]=Math.min(255,d[i+2]*f); }
      ctx.putImageData(img,0,0);
      mState.sampleBM.canvas = restored;
      modalWorking = restored;
      drawModal();
    }
  });
  $('#resetBrightness').onclick = () => {
    if(modalOrigCopy) {
      let reset = cloneCanvas(modalOrigCopy);
      mState.sampleBM.canvas = reset;
      modalWorking = reset;
      slider.value='1.0'; valSpan.innerText='1.00';
      drawModal();
    }
  };
}

window.openModal = async (idx) => {
  currentEditingIndex = idx;
  let data = batchData[idx];
  let frameCanvas = data.isLandscape ? frameCanvasL : frameCanvasP;
  let bm; if(data.modifiedCanvas) bm = { canvas:data.modifiedCanvas, w:data.modifiedCanvas.width, h:data.modifiedCanvas.height }; else bm = await loadScaledBitmap(data.file);
  if(!bm) return;
  modalOrigCopy = cloneCanvas(bm.canvas); modalWorking = cloneCanvas(modalOrigCopy); bm.canvas = modalWorking;
  let displayW = Math.min(window.innerWidth-60, 460); let displayH = Math.round(displayW / (frameCanvas.width/frameCanvas.height));
  modalPhotoCanvas.width = displayW; modalPhotoCanvas.height = displayH; modalFrameCanvas.width = displayW; modalFrameCanvas.height = displayH; modalWrap.style.height = displayH+'px';
  fCtx.clearRect(0,0,displayW,displayH); fCtx.drawImage(frameCanvas,0,0,displayW,displayH);
  let photoAR = bm.w/bm.h, frameAR = frameCanvas.width/frameCanvas.height; let initScale = photoAR > frameAR ? displayH/bm.h : displayW/bm.w;
  mState.sampleBM = bm; mState.frameCanvas = frameCanvas; mState.displayW = displayW; mState.displayH = displayH;
  mState.minScale = initScale; mState.maxScale = initScale*8;
  let frameW = frameCanvas.width; let cropScale = frameW / data.cropW;
  mState.scale = Math.max(initScale, cropScale * (displayW/frameW));
  mState.panX = -data.cropX * mState.scale; mState.panY = -data.cropY * mState.scale;
  mState.panX = Math.min(0, Math.max(displayW - bm.w*mState.scale, mState.panX));
  mState.panY = Math.min(0, Math.max(displayH - bm.h*mState.scale, mState.panY));
  drawModal(); let slider = $('#modalBrightness'); if(slider) { slider.value='1.0'; $('#brightVal').innerText='1.00'; }
  $('modal-overlay').classList.add('open');
};

$('modalCancelBtn').onclick = () => { $('modal-overlay').classList.remove('open'); mState.sampleBM=null; modalOrigCopy=null; };
$('modalSaveBtn').onclick = async () => {
  let data = batchData[currentEditingIndex]; let frameCanvas = data.isLandscape ? frameCanvasL : frameCanvasP;
  let scale = mState.scale; data.cropX = -mState.panX / scale; data.cropY = -mState.panY / scale;
  data.cropW = frameCanvas.width / (scale * (frameCanvas.width / mState.displayW)); data.cropH = frameCanvas.height / (scale * (frameCanvas.height / mState.displayH));
  if(mState.sampleBM && mState.sampleBM.canvas) data.modifiedCanvas = cloneCanvas(mState.sampleBM.canvas);
  let thumbCanvas = data.modifiedCanvas || (await loadScaledBitmap(data.file))?.canvas;
  if(thumbCanvas) { let thumbUrl = composite(thumbCanvas, frameCanvas, { x:data.cropX, y:data.cropY, w:data.cropW, h:data.cropH }, THUMB_W); let grid = $('grid-container'); let items = grid.children; if (items[currentEditingIndex]) { let img = items[currentEditingIndex].querySelector('img'); if (img) img.src = thumbUrl; } let gi = galleryItems.find(g=>g.batchIndex===currentEditingIndex); if(gi) gi.thumbSrc = thumbUrl; }
  $('modal-overlay').classList.remove('open');
  if(galleryItems.length && $('gallery-overlay').classList.contains('open')) { renderStrip(); showGalleryImage(galleryIndex); }
};

// ======================== GALLERY =================================
function buildGalleryItems() { galleryItems = []; const grid = $('grid-container'); for (let i = 0; i < batchData.length; i++) { const img = grid.children[i]?.querySelector('img'); if (img) galleryItems.push({ batchIndex:i, thumbSrc:img.src, fileName:batchData[i].file.name }); } }
function renderStrip() { let s=$('gallery-strip'); s.innerHTML=''; galleryItems.forEach((it,idx)=>{ let div=document.createElement('div'); div.className='strip-thumb'+(idx===galleryIndex?' active-thumb':''); div.innerHTML=`<img src="${it.thumbSrc}" loading="lazy"><div class="strip-num">${idx+1}</div>`; div.onclick=()=>showGalleryImage(idx); s.appendChild(div); }); }
function showGalleryImage(idx) { if(idx<0||idx>=galleryItems.length) return; galleryIndex=idx; let it=galleryItems[idx]; $('gallery-main-img').src=it.thumbSrc; $('gallery-viewer-label').textContent=it.fileName; $('gallery-counter').textContent=`${idx+1}/${galleryItems.length}`; let strip=$('gallery-strip'); Array.from(strip.children).forEach((el,i)=>el.classList.toggle('active-thumb',i===idx)); if(strip.children[idx]) strip.children[idx].scrollIntoView({block:'nearest'}); }
$('previewAllBtn').onclick = ()=>{ buildGalleryItems(); if(!galleryItems.length){ alert('Generate grid first.'); return; } $('gallery-overlay').classList.add('open'); galleryIndex=0; renderStrip(); showGalleryImage(0); };
$('galleryCloseBtn').onclick = ()=> $('gallery-overlay').classList.remove('open');
$('galleryPrevBtn').onclick = ()=> showGalleryImage(galleryIndex-1);
$('galleryNextBtn').onclick = ()=> showGalleryImage(galleryIndex+1);
$('gArrowL').onclick = ()=> showGalleryImage(galleryIndex-1);
$('gArrowR').onclick = ()=> showGalleryImage(galleryIndex+1);
$('galleryAdjustBtn').onclick = ()=>{ if(galleryItems.length){ $('gallery-overlay').classList.remove('open'); openModal(galleryItems[galleryIndex].batchIndex); } };
let gSwipe=0; $('gallery-main-img-wrap').addEventListener('touchstart',e=>{ gSwipe=e.touches[0].clientX; },{passive:true}); $('gallery-main-img-wrap').addEventListener('touchend',e=>{ let dx=e.changedTouches[0].clientX-gSwipe; if(Math.abs(dx)>40) showGalleryImage(dx<0?galleryIndex+1:galleryIndex-1); },{passive:true});
document.addEventListener('keydown',e=>{ if(!$('gallery-overlay').classList.contains('open')) return; if(e.key==='ArrowLeft') showGalleryImage(galleryIndex-1); if(e.key==='ArrowRight') showGalleryImage(galleryIndex+1); if(e.key==='Escape') $('gallery-overlay').classList.remove('open'); });

// ======================== ZIP DOWNLOAD ============================
function getTargetW(fc) { if(!$('enhanceToggle').checked) return fc.width; let res=parseInt(document.querySelector('.eq-res-btn.active-res')?.dataset.res||'1080'); return Math.max(fc.width,fc.height,res); }
function upscale(src,tW) { if(tW<=src.width) return src; let step=document.createElement('canvas'); step.width=src.width*1.5; step.height=src.height*1.5; step.getContext('2d').drawImage(src,0,0,step.width,step.height); let fin=document.createElement('canvas'); fin.width=tW; fin.height=Math.round(src.height*(tW/src.width)); fin.getContext('2d').drawImage(step,0,0,fin.width,fin.height); step.width=0; return fin; }
$('zipBtnTop').onclick = async () => {
  $('zipBtnTop').disabled=true; $('progressBar').style.display='block';
  let zip=new JSZip(); let valid=batchData.filter(d=>d.isValid); let enhancing=$('enhanceToggle').checked; let qual=enhancing?parseInt($('eqQuality').value)/100:FINAL_Q;
  for(let i=0;i<valid.length;i++){
    setStatus(`${enhancing?'Enhancing':'High-res'} ${i+1}/${valid.length}`); setProgress(i,valid.length); await yield$();
    let data=valid[i]; let bmCanvas=data.modifiedCanvas?data.modifiedCanvas:(await loadScaledBitmap(data.file))?.canvas;
    if(!bmCanvas) continue;
    let frameCanvas=data.isLandscape?frameCanvasL:frameCanvasP;
    let targetW=getTargetW(frameCanvas); let url;
    if(enhancing && targetW>frameCanvas.width){
      let nativeUrl=composite(bmCanvas,frameCanvas,{x:data.cropX,y:data.cropY,w:data.cropW,h:data.cropH},frameCanvas.width);
      let img=await new Promise(r=>{let i=new Image(); i.onload=()=>r(i); i.src=nativeUrl;});
      let natC=document.createElement('canvas'); natC.width=frameCanvas.width; natC.height=frameCanvas.height; natC.getContext('2d').drawImage(img,0,0);
      let up=upscale(natC,targetW); url=up.toDataURL('image/jpeg',qual);
      natC.width=0; if(up!==natC) up.width=0;
    } else {
      let c=document.createElement('canvas'); c.width=frameCanvas.width; c.height=frameCanvas.height;
      let ctx=c.getContext('2d'); ctx.drawImage(bmCanvas,data.cropX,data.cropY,data.cropW,data.cropH,0,0,c.width,c.height);
      ctx.drawImage(frameCanvas,0,0,c.width,c.height);
      url=c.toDataURL('image/jpeg',qual); c.width=0;
    }
    let ab=await fetch(url).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b));
    zip.file(`framed_${String(i+1).padStart(3,'0')}.jpg`,ab,{compression:'STORE'});
    if(!data.modifiedCanvas && bmCanvas) bmCanvas.width=0;
    await yield$();
  }
  setStatus('Building ZIP…'); await yield$();
  let blob=await zip.generateAsync({type:'blob'});
  let name=($('zipNameInput').value.trim()||'Framed_Photos').replace(/\.zip$/i,'')+'.zip';
  let a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(a.href),120000);
  setProgress(0,1); $('progressBar').style.display='none'; setStatus('Complete!'); $('zipBtnTop').disabled=false;
};

// ======================== INITIALIZATION ==========================
$('initBtnTop').onclick = async () => {
  let files=$('photosInput').files; if(!files.length){ alert('Upload photos first.'); return; }
  setStatus('Loading editors…'); $('initBtnTop').disabled=true;
  let fP=$('framePInput').files[0], fL=$('frameLInput').files[0];
  if(!fP && !fL){ alert('Upload at least one frame.'); $('initBtnTop').disabled=false; return; }
  frameCanvasP = fP ? await loadFrameCanvas(fP) : null;
  frameCanvasL = fL ? await loadFrameCanvas(fL) : null;
  let sampleP=null, sampleL=null;
  for(let i=0;i<files.length;i++){
    if(sampleP && sampleL) break;
    let r=await loadScaledBitmap(files[i]); await yield$();
    if(!r) continue;
    if(r.w>r.h && !sampleL) sampleL=r;
    if(r.h>=r.w && !sampleP) sampleP=r;
  }
  $('editors-container').innerHTML=''; $('editors-container').style.display='block';
  if(frameCanvasP && sampleP) buildEditor('p', sampleP, frameCanvasP);
  if(frameCanvasL && sampleL) buildEditor('l', sampleL, frameCanvasL);
  $('previewBatchBtnTop').style.display='block';
  $('previewBatchBtnTop').disabled = false;
  $('initBtnTop').disabled=false;
  setStatus('Adjust master crops, then Generate Preview Grid.');
  initBrightnessUI();
  previewGenerated = false;
  $('grid-container').innerHTML = '';
  batchData = [];
};

// Exposure toggle and mode buttons
$('autoExpToggle').addEventListener('change',()=>{ $('exposure-controls').style.display=$('autoExpToggle').checked?'block':'none'; });
document.querySelectorAll('.exp-mode-btn').forEach(b=>b.addEventListener('click',function(){ document.querySelectorAll('.exp-mode-btn').forEach(x=>{ x.classList.remove('active-mode'); x.style.background='#fff'; x.style.color='#333'; }); this.classList.add('active-mode'); this.style.background='#0ea5e9'; this.style.color='#fff'; }));
$('expStrength').addEventListener('input',()=>{ let l=['','Subtle','Light','Medium','Strong','Aggressive']; $('strengthLabel').textContent=l[$('expStrength').value]; });
$('enhanceToggle').addEventListener('change',()=>{ $('enhance-controls').style.display=$('enhanceToggle').checked?'block':'none'; });
document.querySelectorAll('.eq-res-btn').forEach(b=>b.addEventListener('click',function(){ document.querySelectorAll('.eq-res-btn').forEach(x=>{ x.classList.remove('active-res'); x.style.background='#fff'; x.style.color='#333'; }); this.classList.add('active-res'); this.style.background='#10b981'; this.style.color='#fff'; }));
$('eqQuality').addEventListener('input',()=>{ $('eqQualityLabel').textContent=$('eqQuality').value+'%'; });

// Payment trigger is now in payment.js