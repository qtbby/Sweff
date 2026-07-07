// script.js
const MAX_DECODE_PX = 1200;
const THUMB_MAX_WIDTH = 200;
let framePortrait = null;    // portrait frame (PNG)
let frameLandscape = null;   // landscape frame (PNG)
let photosFiles = [];
let batch = [];
let currentAdjustIndex = -1;
let currentGalleryIndex = 0;
let editorState = { x: 0, y: 0, scale: 1 };

// Adjustment state (includes crop, rotate, color)
let adjustState = {
  zoom: 1, panX: 0, panY: 0,
  brightness: 100, contrast: 100, saturation: 100,
  hue: 0, sharpness: 0, temperature: 0, vignette: 0,
  rotate: 0,   // degrees
  crop: null   // { x, y, w, h } in canvas coordinates (fraction 0..1)
};
let cropModeActive = false;
let cropDrag = null; // { startX, startY, startCrop }
let tempCrop = null; // used during drag

// ========== THEME ==========
function switchTheme(theme) {
  document.body.className = theme === 'default' ? '' : `theme-${theme}`;
  localStorage.setItem('sweff-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(b => b.style.borderColor = 'transparent');
  const map = { default: '.theme-cyan', purple: '.theme-purple-btn', pink: '.theme-pink-btn', green: '.theme-green-btn', orange: '.theme-orange-btn' };
  const sel = map[theme];
  if (sel) document.querySelector(sel).style.borderColor = 'white';
}

// ========== SIDEBAR ==========
function toggleSidebar() { document.querySelector('.sidebar').classList.toggle('show'); }
function closeSidebar() { if (window.innerWidth <= 900) document.querySelector('.sidebar').classList.remove('show'); }

// ========== PROGRESS ==========
function showProgress(title) {
  document.getElementById('progressTitle').textContent = title;
  document.getElementById('progressBarFill').style.width = '0%';
  document.getElementById('progressText').textContent = '0%';
  document.getElementById('progressOverlay').classList.add('show');
}
function updateProgress(current, total) {
  const p = Math.round((current / total) * 100);
  document.getElementById('progressBarFill').style.width = p + '%';
  document.getElementById('progressText').textContent = p + '%';
}
function hideProgress() { document.getElementById('progressOverlay').classList.remove('show'); }

// ========== TOGGLES ==========
function toggleAutoExposure() {
  document.getElementById('autoExposureToggle').classList.toggle('active');
  document.getElementById('exposurePanel').classList.toggle('show');
}
function toggleEnhance() {
  document.getElementById('enhanceToggle').classList.toggle('active');
  document.getElementById('enhancePanel').style.display =
    document.getElementById('enhanceToggle').classList.contains('active') ? 'block' : 'none';
}
function updateStrengthLabel() {
  const v = document.getElementById('strengthSlider').value;
  document.getElementById('strengthLabel').textContent = ['', 'Subtle', 'Light', 'Medium', 'Strong', 'Aggressive'][v];
}
function updateQualityLabel() { document.getElementById('qualityLabel').textContent = document.getElementById('qualitySlider').value; }

// ========== ERROR ==========
function showError(msg) {
  let overlay = document.getElementById('errorOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'errorOverlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal" style="max-width:400px;text-align:center;">
      <button class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('show')">✕</button>
      <div style="font-size:40px;margin-bottom:16px;color:#ef4444;">⚠️</div>
      <h3 style="color:#fca5a5;margin:0 0 12px;font-size:18px;">Error</h3>
      <p id="errorMessage" style="color:#e0e0e0;margin:0 0 20px;font-size:14px;line-height:1.5;"></p>
      <button class="btn btn-red" onclick="this.closest('.modal-overlay').classList.remove('show')" style="width:100%;padding:12px;">Got It</button>
    </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('errorMessage').textContent = msg;
  overlay.classList.add('show');
}

// ========== FRAME UPLOAD VALIDATION ==========
let framePortraitFile = null;
let frameLandscapeFile = null;

document.getElementById('framePortraitInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) { framePortraitFile = null; updateFrameStatus(); return; }
  const img = await loadImage(f);
  const ori = detectOrientation(img);
  if (ori !== 'portrait') {
    showError('The uploaded frame is not portrait. Please select a portrait image.');
    e.target.value = '';
    framePortraitFile = null;
  } else {
    framePortraitFile = f;
  }
  updateFrameStatus();
});

document.getElementById('frameLandscapeInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) { frameLandscapeFile = null; updateFrameStatus(); return; }
  const img = await loadImage(f);
  const ori = detectOrientation(img);
  if (ori !== 'landscape') {
    showError('The uploaded frame is not landscape. Please select a landscape image.');
    e.target.value = '';
    frameLandscapeFile = null;
  } else {
    frameLandscapeFile = f;
  }
  updateFrameStatus();
});

function updateFrameStatus() {
  const status = document.getElementById('frameStatus');
  let msg = '';
  if (framePortraitFile && frameLandscapeFile) msg = '✅ Both portrait and landscape frames loaded.';
  else if (framePortraitFile) msg = '⏳ Portrait frame loaded. Please upload a landscape frame.';
  else if (frameLandscapeFile) msg = '⏳ Landscape frame loaded. Please upload a portrait frame.';
  else msg = '📌 Upload one portrait and one landscape frame.';
  status.textContent = msg;
}

// ========== PHOTO UPLOAD ==========
document.getElementById('photosInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const validFiles = [], invalid = [];
  showProgress('Validating photos...');
  for (let i = 0; i < files.length; i++) {
    if (i % 5 === 0) { await new Promise(r => setTimeout(r, 50)); updateProgress(i, files.length); }
    try {
      const img = await loadImage(files[i]);
      const c = document.createElement('canvas'); c.width = 100; c.height = 100;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 100, 100);
      const data = ctx.getImageData(0, 0, 100, 100).data;
      let variance = 0;
      for (let j = 0; j < data.length; j += 4) variance += Math.abs(data[j]-data[j+1]) + Math.abs(data[j+1]-data[j+2]) + Math.abs(data[j+2]-data[j]);
      variance > 1000 ? validFiles.push(files[i]) : invalid.push(i+1);
    } catch { invalid.push(i+1); }
  }
  hideProgress();
  if (invalid.length) showError(`${invalid.length} image(s) excluded (low detail). ${validFiles.length} valid loaded.`);
  photosFiles = validFiles;
});

// ========== UTILITY FUNCTIONS ==========
async function loadImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => { const img = new Image(); img.onload = () => resolve(img); img.src = e.target.result; };
    reader.readAsDataURL(file);
  });
}

async function downscaleImage(img) {
  if (img.width <= MAX_DECODE_PX && img.height <= MAX_DECODE_PX) return img;
  const s = Math.min(MAX_DECODE_PX/img.width, MAX_DECODE_PX/img.height);
  const c = document.createElement('canvas'); c.width = img.width*s; c.height = img.height*s;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function detectOrientation(img) { return img.width > img.height ? 'landscape' : 'portrait'; }

function autoEnhanceImage(imageData, strength) {
  const data = imageData.data;
  let rSum=0,gSum=0,bSum=0,count=data.length/4;
  for (let i=0;i<data.length;i+=4) { rSum+=data[i]; gSum+=data[i+1]; bSum+=data[i+2]; }
  const avgR=rSum/count,avgG=gSum/count,avgB=bSum/count;
  const avgLum=0.299*avgR+0.587*avgG+0.114*avgB;
  const bf=1+((128-avgLum)/256)*(strength/3), cf=1+0.2*(strength/3), mp=128;
  for (let i=0;i<data.length;i+=4) {
    let r=data[i],g=data[i+1],b=data[i+2];
    r=mp+(r-mp)*cf; g=mp+(g-mp)*cf; b=mp+(b-mp)*cf;
    r=Math.min(255,r*bf); g=Math.min(255,g*bf); b=Math.min(255,b*bf);
    data[i]=Math.max(0,Math.min(255,r)); data[i+1]=Math.max(0,Math.min(255,g)); data[i+2]=Math.max(0,Math.min(255,b));
  }
  return imageData;
}

function applySharpness(imageData, amount) {
  if (amount===0) return imageData;
  const data=imageData.data, w=imageData.width, h=imageData.height;
  const copy=new Uint8ClampedArray(data), s=amount/100;
  const k=[0,-1,0, -1,4+(1-s)*4,-1, 0,-1,0];
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++) {
    let r=0,g=0,b=0;
    for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++) {
      const idx=((y+ky)*w+(x+kx))*4, kv=k[(ky+1)*3+(kx+1)];
      r+=copy[idx]*kv; g+=copy[idx+1]*kv; b+=copy[idx+2]*kv;
    }
    const idx=(y*w+x)*4;
    data[idx]=Math.max(0,Math.min(255,r)); data[idx+1]=Math.max(0,Math.min(255,g)); data[idx+2]=Math.max(0,Math.min(255,b));
  }
  return imageData;
}

function applyVignette(imageData, amount) {
  if (amount===0) return imageData;
  const data=imageData.data, w=imageData.width, h=imageData.height;
  const cx=w/2, cy=h/2, maxD=Math.sqrt(cx*cx+cy*cy);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const d=Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
    const f=Math.max(0,1-(d/maxD)*(amount/100)), idx=(y*w+x)*4;
    data[idx]*=f; data[idx+1]*=f; data[idx+2]*=f;
  }
  return imageData;
}

function applyTemperature(imageData, amount) {
  if (amount===0) return imageData;
  const data=imageData.data, w=amount/100;
  for (let i=0;i<data.length;i+=4) {
    if (w>0) { data[i]=Math.min(255,data[i]*(1+w*0.3)); data[i+1]=Math.min(255,data[i+1]*(1+w*0.15)); data[i+2]=Math.max(0,data[i+2]*(1-w*0.3)); }
    else { const c=-w; data[i]=Math.max(0,data[i]*(1-c*0.3)); data[i+1]=Math.max(0,data[i+1]*(1-c*0.15)); data[i+2]=Math.min(255,data[i+2]*(1+c*0.3)); }
  }
  return imageData;
}

// ========== PREVIEW GENERATION ==========
async function generatePreview() {
  if (!framePortraitFile || !frameLandscapeFile) {
    showError('Please upload both a portrait and a landscape frame.');
    return;
  }
  if (photosFiles.length === 0) {
    showError('Please upload at least one photo.');
    return;
  }

  // Load frames
  const framePortraitImg = await loadImage(framePortraitFile);
  const frameLandscapeImg = await loadImage(frameLandscapeFile);

  // Group photos by orientation
  const portraitPhotos = [], landscapePhotos = [];
  for (let f of photosFiles) {
    const img = await loadImage(f);
    const ori = detectOrientation(img);
    if (ori === 'portrait') portraitPhotos.push(f);
    else landscapePhotos.push(f);
  }

  if (portraitPhotos.length === 0 && landscapePhotos.length === 0) {
    showError('No photos match either frame orientation.');
    return;
  }

  if (batch.length > 0 && !confirm('Preview already generated. Overwrite?')) return;
  batch = [];
  showProgress('Framing Photos...');
  document.getElementById('previewContent').innerHTML = '<div class="grid-thumbs" id="previewGrid"></div>';
  const autoExp = document.getElementById('autoExposureToggle').classList.contains('active');
  const strength = parseInt(document.getElementById('strengthSlider').value);

  let idx = 0;
  // Process portrait photos with portrait frame
  for (let f of portraitPhotos) {
    await new Promise(r => setTimeout(r, 30));
    updateProgress(idx, portraitPhotos.length + landscapePhotos.length);
    const img = await loadImage(f);
    const scaled = await downscaleImage(img);
    batch.push({
      photo: scaled,
      frame: framePortraitImg,
      orientation: 'portrait',
      cropState: { ...editorState },
      brightness: 100, contrast: 100, saturation: 100, hue: 0,
      sharpness: 0, temperature: 0, vignette: 0,
      zoom: 1, panX: 0, panY: 0, rotate: 0,
      crop: null,
      autoEnhanced: autoExp, enhanceStrength: strength
    });
    await renderSinglePreviewThumbnail(idx);
    idx++;
  }
  // Process landscape photos with landscape frame
  for (let f of landscapePhotos) {
    await new Promise(r => setTimeout(r, 30));
    updateProgress(idx, portraitPhotos.length + landscapePhotos.length);
    const img = await loadImage(f);
    const scaled = await downscaleImage(img);
    batch.push({
      photo: scaled,
      frame: frameLandscapeImg,
      orientation: 'landscape',
      cropState: { ...editorState },
      brightness: 100, contrast: 100, saturation: 100, hue: 0,
      sharpness: 0, temperature: 0, vignette: 0,
      zoom: 1, panX: 0, panY: 0, rotate: 0,
      crop: null,
      autoEnhanced: autoExp, enhanceStrength: strength
    });
    await renderSinglePreviewThumbnail(idx);
    idx++;
  }
  hideProgress();
  closeSidebar();
  document.getElementById('enhanceActions').style.display = 'flex';
}

async function renderSinglePreviewThumbnail(idx) {
  const grid = document.getElementById('previewGrid');
  const item = batch[idx];
  let thumb = grid.querySelector(`[data-index="${idx}"]`);
  if (!thumb) {
    thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.setAttribute('data-index', idx);
    thumb.innerHTML = '<canvas></canvas>';
    grid.appendChild(thumb);
  }
  const fa = item.frame.width/item.frame.height;
  let tw, th;
  if (fa>=1) { tw=THUMB_MAX_WIDTH; th=THUMB_MAX_WIDTH/fa; }
  else { th=THUMB_MAX_WIDTH; tw=THUMB_MAX_WIDTH*fa; }
  thumb.style.width=tw+'px'; thumb.style.height=th+'px';
  const canvas=thumb.querySelector('canvas'), dpr=window.devicePixelRatio||1;
  canvas.width=tw*dpr; canvas.height=th*dpr;
  canvas.style.width=tw+'px'; canvas.style.height=th+'px';
  compositeImage(item, canvas);
  if (!thumb.querySelector('.thumb-btn')) {
    const btn=document.createElement('button');
    btn.className='btn btn-blue thumb-btn'; btn.textContent='Adjust';
    btn.onclick=(e)=>{e.stopPropagation(); openAdjustModal(idx);};
    thumb.appendChild(btn);
  }
  thumb.onclick=()=>openGallery(idx);
}

function renderPreviewGrid() {
  batch.forEach((item, idx) => {
    const thumb = document.getElementById('previewGrid')?.querySelector(`[data-index="${idx}"]`);
    if (thumb) compositeImage(item, thumb.querySelector('canvas'));
  });
}

// ========== COMPOSITE IMAGE (with crop & rotate) ==========
function compositeImage(item, targetCanvas, useAdjustState=false) {
  const { photo, frame } = item;
  const ctx = targetCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,targetCanvas.width,targetCanvas.height);

  const displayW = targetCanvas.width/dpr, displayH = targetCanvas.height/dpr;
  ctx.fillStyle='#000'; ctx.fillRect(0,0,targetCanvas.width,targetCanvas.height);

  // frame aspect
  const fa = frame.width/frame.height;
  let fdw, fdh;
  if (fa>=1) { fdw=displayW; fdh=displayW/fa; }
  else { fdh=displayH; fdw=displayH*fa; }
  const fx=(displayW-fdw)/2, fy=(displayH-fdh)/2;

  // Apply auto enhance
  let source=photo;
  if (item.autoEnhanced) {
    const t=document.createElement('canvas'); t.width=photo.width; t.height=photo.height;
    const tctx=t.getContext('2d'); tctx.drawImage(photo,0,0);
    tctx.putImageData(autoEnhanceImage(tctx.getImageData(0,0,photo.width,photo.height), item.enhanceStrength),0,0);
    source=t;
  }

  // Get adjustments
  let b = item.brightness || 100, c = item.contrast || 100, s = item.saturation || 100, h = item.hue || 0;
  let sh = item.sharpness || 0, tmp = item.temperature || 0, v = item.vignette || 0;
  let z = item.zoom || 1, px = item.panX || 0, py = item.panY || 0;
  let rot = item.rotate || 0;
  let crop = item.crop || null;
  if (useAdjustState) {
    b = adjustState.brightness; c = adjustState.contrast; s = adjustState.saturation; h = adjustState.hue;
    sh = adjustState.sharpness; tmp = adjustState.temperature; v = adjustState.vignette;
    z = adjustState.zoom; px = adjustState.panX; py = adjustState.panY;
    rot = adjustState.rotate || 0;
    crop = adjustState.crop || null;
  }

  // Apply color adjustments to a temp canvas
  const ac=document.createElement('canvas');
  ac.width=source.width; ac.height=source.height;
  const actx=ac.getContext('2d');
  actx.filter=`brightness(${b/100}) contrast(${c/100}) saturate(${s/100}) hue-rotate(${h}deg)`;
  actx.drawImage(source,0,0);
  actx.filter='none';
  if (sh>0) { const id=actx.getImageData(0,0,ac.width,ac.height); applySharpness(id,sh); actx.putImageData(id,0,0); }
  if (tmp!==0) { const id=actx.getImageData(0,0,ac.width,ac.height); applyTemperature(id,tmp); actx.putImageData(id,0,0); }
  if (v>0) { const id=actx.getImageData(0,0,ac.width,ac.height); applyVignette(id,v); actx.putImageData(id,0,0); }
  source=ac;

  // Crop if defined
  let cropX=0, cropY=0, cropW=source.width, cropH=source.height;
  if (crop) {
    cropX = crop.x * source.width;
    cropY = crop.y * source.height;
    cropW = crop.w * source.width;
    cropH = crop.h * source.height;
  }

  // Pan/zoom/rotate
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = source.width;
  tempCanvas.height = source.height;
  const tctx2 = tempCanvas.getContext('2d');
  tctx2.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, source.width, source.height);
  source = tempCanvas;

  // Now apply zoom and pan and rotate
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = source.width;
  finalCanvas.height = source.height;
  const fctx = finalCanvas.getContext('2d');
  fctx.translate(source.width/2, source.height/2);
  fctx.rotate(rot * Math.PI/180);
  const scale = 1/z;
  fctx.scale(scale, scale);
  fctx.translate(-source.width/2 + px, -source.height/2 + py);
  fctx.drawImage(source, 0, 0);
  source = finalCanvas;

  // Now composite photo into frame
  const pa = source.width/source.height;
  let sw, sh2, sx, sy;
  if (pa>fa) { sh2=source.height; sw=sh2*fa; }
  else { sw=source.width; sh2=sw/fa; }
  sx=(source.width-sw)/2;
  sy=(source.height-sh2)/2;

  ctx.save(); ctx.scale(dpr,dpr);
  ctx.drawImage(source,sx,sy,sw,sh2,fx,fy,fdw,fdh);
  ctx.drawImage(frame,fx,fy,fdw,fdh);
  ctx.restore();
}

// ========== EDITOR ==========
function openAdjustModal(idx) {
  currentAdjustIndex = idx;
  const item = batch[idx];
  adjustState = {
    zoom: item.zoom || 1,
    panX: item.panX || 0,
    panY: item.panY || 0,
    brightness: item.brightness || 100,
    contrast: item.contrast || 100,
    saturation: item.saturation || 100,
    hue: item.hue || 0,
    sharpness: item.sharpness || 0,
    temperature: item.temperature || 0,
    vignette: item.vignette || 0,
    rotate: item.rotate || 0,
    crop: item.crop ? { ...item.crop } : null
  };
  cropModeActive = false;
  document.getElementById('cropModeBtn').textContent = '✂️ Crop Mode';
  tempCrop = null;

  document.getElementById('zoomSlider').value=Math.round(adjustState.zoom*100);
  document.getElementById('rotateSlider').value=adjustState.rotate;
  document.getElementById('brightnessSlider').value=adjustState.brightness;
  document.getElementById('contrastSlider').value=adjustState.contrast;
  document.getElementById('saturationSlider').value=adjustState.saturation;
  document.getElementById('hueSlider').value=adjustState.hue;
  document.getElementById('sharpnessSlider').value=adjustState.sharpness;
  document.getElementById('temperatureSlider').value=adjustState.temperature;
  // vignette slider not in UI but kept
  updateAllLabels();

  document.getElementById('adjustModal').classList.add('show');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => sizeAdjustCanvas(item));
  });
}

function sizeAdjustCanvas(item) {
  const area = document.getElementById('adjustPreviewArea');
  const canvas = document.getElementById('adjustCanvas');
  const fa = item.frame.width / item.frame.height;
  const maxW = area.clientWidth - 20;
  const maxH = area.clientHeight - 20;

  let cw, ch;
  if (fa >= 1) { cw = maxW; ch = cw / fa; if (ch > maxH) { ch = maxH; cw = ch * fa; } }
  else { ch = maxH; cw = ch * fa; if (cw > maxW) { cw = maxW; ch = cw / fa; } }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';

  setupAdjustCanvasEvents(canvas, item);
  drawAdjustCanvas();
}

function setupAdjustCanvasEvents(canvas, item) {
  // Remove old listeners by cloning
  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);

  let isPanning = false, startX, startY, startPanX, startPanY;

  // Wheel -> zoom
  newCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    adjustState.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
    adjustState.zoom = Math.max(0.5, Math.min(3, adjustState.zoom));
    document.getElementById('zoomSlider').value = Math.round(adjustState.zoom * 100);
    document.getElementById('zoomLabel').textContent = Math.round(adjustState.zoom * 100);
    drawAdjustCanvas();
  });

  // Mouse drag for pan
  newCanvas.addEventListener('mousedown', (e) => {
    if (cropModeActive) {
      // start crop drag
      const rect = newCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (!adjustState.crop) {
        adjustState.crop = { x: x, y: y, w: 0.1, h: 0.1 };
      }
      cropDrag = { startX: x, startY: y, startCrop: { ...adjustState.crop } };
      tempCrop = { ...adjustState.crop };
      newCanvas.style.cursor = 'crosshair';
      return;
    }
    if (e.button === 0) {
      isPanning = true;
      const rect = newCanvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      startPanX = adjustState.panX;
      startPanY = adjustState.panY;
      newCanvas.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (cropModeActive && cropDrag) {
      const rect = newCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const start = cropDrag.startCrop;
      let newCrop = {
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        w: Math.abs(x - start.x),
        h: Math.abs(y - start.y)
      };
      // constrain to [0,1]
      newCrop.x = Math.max(0, Math.min(1, newCrop.x));
      newCrop.y = Math.max(0, Math.min(1, newCrop.y));
      newCrop.w = Math.max(0.01, Math.min(1 - newCrop.x, newCrop.w));
      newCrop.h = Math.max(0.01, Math.min(1 - newCrop.y, newCrop.h));

      // aspect ratio lock
      const aspect = document.getElementById('cropAspect').value;
      if (aspect !== 'free') {
        let ratio = 1;
        if (aspect === '1:1') ratio = 1;
        else if (aspect === '4:3') ratio = 4/3;
        else if (aspect === '3:2') ratio = 3/2;
        else if (aspect === '16:9') ratio = 16/9;
        else if (aspect === 'frame') {
          const fa = item.frame.width / item.frame.height;
          ratio = fa;
        }
        // adjust w or h to match ratio
        if (newCrop.w / newCrop.h > ratio) {
          newCrop.h = newCrop.w / ratio;
          if (newCrop.y + newCrop.h > 1) { newCrop.y = 1 - newCrop.h; }
        } else {
          newCrop.w = newCrop.h * ratio;
          if (newCrop.x + newCrop.w > 1) { newCrop.x = 1 - newCrop.w; }
        }
      }
      adjustState.crop = newCrop;
      tempCrop = { ...newCrop };
      drawAdjustCanvas();
      return;
    }
    if (!isPanning) return;
    const rect = newCanvas.getBoundingClientRect();
    adjustState.panX = startPanX + (e.clientX - rect.left - startX) * 2;
    adjustState.panY = startPanY + (e.clientY - rect.top - startY) * 2;
    drawAdjustCanvas();
  });

  document.addEventListener('mouseup', () => {
    if (cropDrag) {
      cropDrag = null;
      tempCrop = null;
      newCanvas.style.cursor = 'default';
      drawAdjustCanvas();
    }
    if (isPanning) { isPanning = false; newCanvas.style.cursor = 'grab'; }
  });

  newCanvas.addEventListener('contextmenu', e => e.preventDefault());

  // Touch events
  newCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      newCanvas.dataset.pinchDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    } else if (e.touches.length === 1) {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      startPanX = adjustState.panX; startPanY = adjustState.panY;
      isPanning = true;
    }
  });
  newCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      const prev = parseFloat(newCanvas.dataset.pinchDist || dist);
      adjustState.zoom *= dist / prev;
      adjustState.zoom = Math.max(0.5, Math.min(3, adjustState.zoom));
      newCanvas.dataset.pinchDist = dist;
      document.getElementById('zoomSlider').value = Math.round(adjustState.zoom*100);
      document.getElementById('zoomLabel').textContent = Math.round(adjustState.zoom*100);
      drawAdjustCanvas();
    } else if (e.touches.length === 1 && isPanning) {
      adjustState.panX = startPanX + (e.touches[0].clientX-startX)*2;
      adjustState.panY = startPanY + (e.touches[0].clientY-startY)*2;
      drawAdjustCanvas();
    }
  });
  newCanvas.addEventListener('touchend', () => { isPanning=false; newCanvas.style.cursor='grab'; });
}

function drawAdjustCanvas() {
  const canvas = document.getElementById('adjustCanvas');
  if (!canvas || currentAdjustIndex < 0) return;
  compositeImage(batch[currentAdjustIndex], canvas, true);
}

function updateZoomFromSlider() {
  adjustState.zoom = document.getElementById('zoomSlider').value / 100;
  document.getElementById('zoomLabel').textContent = Math.round(adjustState.zoom * 100);
  drawAdjustCanvas();
}
function updateRotateFromSlider() {
  adjustState.rotate = parseInt(document.getElementById('rotateSlider').value);
  document.getElementById('rotateLabel').textContent = adjustState.rotate;
  drawAdjustCanvas();
}
function updateAllLabels() {
  document.getElementById('zoomLabel').textContent = Math.round(adjustState.zoom*100);
  document.getElementById('rotateLabel').textContent = adjustState.rotate || 0;
  document.getElementById('brightnessLabel').textContent = adjustState.brightness;
  document.getElementById('contrastLabel').textContent = adjustState.contrast;
  document.getElementById('saturationLabel').textContent = adjustState.saturation;
  document.getElementById('hueLabel').textContent = adjustState.hue;
  document.getElementById('sharpnessLabel').textContent = adjustState.sharpness;
  document.getElementById('temperatureLabel').textContent = adjustState.temperature;
}

function updateAdjustPreview() {
  adjustState.brightness = parseInt(document.getElementById('brightnessSlider').value);
  adjustState.contrast = parseInt(document.getElementById('contrastSlider').value);
  adjustState.saturation = parseInt(document.getElementById('saturationSlider').value);
  adjustState.hue = parseInt(document.getElementById('hueSlider').value);
  adjustState.sharpness = parseInt(document.getElementById('sharpnessSlider').value);
  adjustState.temperature = parseInt(document.getElementById('temperatureSlider').value);
  updateAllLabels();
  drawAdjustCanvas();
}

function resetTransform() {
  adjustState.zoom = 1; adjustState.panX = 0; adjustState.panY = 0; adjustState.rotate = 0;
  document.getElementById('zoomSlider').value = 100;
  document.getElementById('rotateSlider').value = 0;
  document.getElementById('zoomLabel').textContent = '100';
  document.getElementById('rotateLabel').textContent = '0';
  drawAdjustCanvas();
}

function resetCropBox() {
  adjustState.crop = null;
  cropModeActive = false;
  document.getElementById('cropModeBtn').textContent = '✂️ Crop Mode';
  drawAdjustCanvas();
}

function enableCropMode() {
  cropModeActive = !cropModeActive;
  document.getElementById('cropModeBtn').textContent = cropModeActive ? '✂️ Crop Active' : '✂️ Crop Mode';
  if (!cropModeActive) {
    // if deactivated, keep current crop
  } else {
    // if no crop, create a default one (center 80%)
    if (!adjustState.crop) {
      adjustState.crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    }
  }
  drawAdjustCanvas();
}

function updateCropAspect() {
  // Just redraw with current crop; aspect will be applied on next drag
  drawAdjustCanvas();
}

function resetAllAdjustments() {
  adjustState = {
    zoom: 1, panX: 0, panY: 0,
    brightness: 100, contrast: 100, saturation: 100,
    hue: 0, sharpness: 0, temperature: 0, vignette: 0,
    rotate: 0, crop: null
  };
  cropModeActive = false;
  document.getElementById('cropModeBtn').textContent = '✂️ Crop Mode';
  document.getElementById('zoomSlider').value = 100;
  document.getElementById('rotateSlider').value = 0;
  document.getElementById('brightnessSlider').value = 100;
  document.getElementById('contrastSlider').value = 100;
  document.getElementById('saturationSlider').value = 100;
  document.getElementById('hueSlider').value = 0;
  document.getElementById('sharpnessSlider').value = 0;
  document.getElementById('temperatureSlider').value = 0;
  updateAllLabels();
  drawAdjustCanvas();
}

function closeAdjustModal() { document.getElementById('adjustModal').classList.remove('show'); }

function saveAdjustment() {
  const item = batch[currentAdjustIndex];
  Object.assign(item, adjustState);
  renderPreviewGrid();
  if (batch.length) renderGalleryThumbs();
  closeAdjustModal();
}

// ========== GALLERY ==========
function openGallery(startIdx=0) {
  document.getElementById('galleryOverlay').classList.add('show');
  currentGalleryIndex=startIdx; renderGalleryThumbs(); showGalleryImage(currentGalleryIndex);
}
function closeGallery() { document.getElementById('galleryOverlay').classList.remove('show'); }
function renderGalleryThumbs() {
  const container = document.getElementById('galleryThumbs');
  container.innerHTML='';
  batch.forEach((item,idx)=>{
    const div=document.createElement('div');
    div.className='gallery-thumb'+(idx===currentGalleryIndex?' active':'');
    const c=document.createElement('canvas'), fa=item.frame.width/item.frame.height, size=80;
    let w,h; if(fa>=1){w=size;h=size/fa;}else{h=size;w=size*fa;}
    c.width=w*2;c.height=h*2;c.style.width=w+'px';c.style.height=h+'px';
    compositeImage(item,c); div.appendChild(c);
    div.onclick=()=>showGalleryImage(idx); container.appendChild(div);
  });
}
function showGalleryImage(idx) {
  currentGalleryIndex=Math.max(0,Math.min(idx,batch.length-1));
  const item=batch[currentGalleryIndex], fa=item.frame.width/item.frame.height, maxW=1200,maxH=800;
  let cw,ch; if(fa>=1){cw=Math.min(maxW,maxH*fa);ch=cw/fa;}else{ch=Math.min(maxH,maxW/fa);cw=ch*fa;}
  const c=document.createElement('canvas');c.width=cw;c.height=ch;
  compositeImage(item,c); document.getElementById('galleryMainImg').src=c.toDataURL(); renderGalleryThumbs();
}
function galleryPrev(){showGalleryImage(currentGalleryIndex-1);}
function galleryNext(){showGalleryImage(currentGalleryIndex+1);}
function openAdjustFromGallery(){openAdjustModal(currentGalleryIndex);}

document.addEventListener('keydown',(e)=>{
  if(document.getElementById('galleryOverlay').classList.contains('show')){
    if(e.key==='ArrowLeft')galleryPrev();
    if(e.key==='ArrowRight')galleryNext();
  }
});

let touchStart=0;
document.getElementById('galleryOverlay').addEventListener('touchstart',(e)=>{touchStart=e.touches[0].clientX;});
document.getElementById('galleryOverlay').addEventListener('touchend',(e)=>{
  const diff=touchStart-e.changedTouches[0].clientX;
  if(Math.abs(diff)>50)diff>0?galleryNext():galleryPrev();
});

// ========== ZIP DOWNLOAD ==========
async function downloadZip() {
  const zip=new JSZip();
  const enhanceEnabled=document.getElementById('enhanceToggle').classList.contains('active');
  const quality=parseInt(document.getElementById('qualitySlider').value)/100;
  showProgress('Creating ZIP...');
  for(let i=0;i<batch.length;i++){
    await new Promise(r=>setTimeout(r,50)); updateProgress(i+1,batch.length);
    const item=batch[i], fa=item.frame.width/item.frame.height;
    let th=enhanceEnabled?(document.getElementById('targetResolution').value==='1080'?1080:1440):1080;
    const tw=Math.round(th*fa), c=document.createElement('canvas');c.width=tw;c.height=th;
    compositeImage(item,c);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',quality));
    zip.file(`framed_${String(i+1).padStart(3,'0')}.jpg`,blob);
  }
  hideProgress();
  const zipBlob=await zip.generateAsync({type:'blob'});
  const a=document.createElement('a');a.href=URL.createObjectURL(zipBlob);
  a.download=(document.getElementById('zipName').value||'Framed_Photos')+'.zip';a.click();
  URL.revokeObjectURL(a.href);
}

// ========== COFFEE POPUP (random) ==========
function showCoffeePopup() {
  document.getElementById('coffeePopup').classList.add('show');
}
// Random popup on load (15% chance)
setTimeout(() => {
  if (Math.random() < 0.15) showCoffeePopup();
}, 3000);

// ========== REPORT PROBLEM ==========
function reportProblem() {
  window.location.href = 'mailto:alalbit.r@gmail.com?subject=Bug%20Report&body=Describe%20the%20problem%20here...';
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded',()=>{
  switchTheme(localStorage.getItem('sweff-theme')||'default');
  updateFrameStatus();
});
window.addEventListener('resize', () => {
  if (document.getElementById('adjustModal').classList.contains('show') && currentAdjustIndex >= 0) {
    sizeAdjustCanvas(batch[currentAdjustIndex]);
  }
});
