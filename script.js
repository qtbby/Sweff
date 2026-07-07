// script.js
const MAX_DECODE_PX = 1200;
const THUMB_MAX_WIDTH = 200;
let frames = { portrait: null, landscape: null };
let photosFiles = [];
let batch = [];
let currentAdjustIndex = -1;

// Theme Switcher
function switchTheme(theme) {
  if(theme === 'default') {
    document.body.className = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light';
  } else {
    document.body.className = `theme-${theme}`;
  }
}
// Set initial theme based on default logic
switchTheme('default');

// Buy me a coffee random popup logic
setTimeout(() => {
  if(Math.random() > 0.3) { // 70% chance to pop up
    document.getElementById('bmcModal').classList.add('show');
  }
}, 30000); // Popup after 30 seconds of usage

// UI Helpers
function showProgress(title) {
  document.getElementById('progressTitle').textContent = title;
  document.getElementById('progressBarFill').style.width = '0%';
  document.getElementById('progressOverlay').classList.add('show');
}
function updateProgress(current, total) {
  document.getElementById('progressBarFill').style.width = Math.round((current / total) * 100) + '%';
}
function hideProgress() { document.getElementById('progressOverlay').classList.remove('show'); }

// Upload Logic
document.getElementById('frameInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 2) {
    alert("Please upload a maximum of two frames (1 Portrait, 1 Landscape).");
    e.target.value = ""; return;
  }
  
  frames = { portrait: null, landscape: null };
  for (let file of files) {
    const img = await loadImage(file);
    const orientation = img.width > img.height ? 'landscape' : 'portrait';
    if (frames[orientation]) {
      alert(`Error: You uploaded two ${orientation} frames. Please upload only one portrait and one landscape.`);
      e.target.value = "";
      frames = { portrait: null, landscape: null };
      document.getElementById('frameStatus').textContent = "";
      return;
    }
    frames[orientation] = img;
  }
  
  let status = "Loaded: ";
  if(frames.portrait) status += "Portrait ";
  if(frames.landscape) status += "Landscape ";
  document.getElementById('frameStatus').textContent = status + "✅";
});

document.getElementById('photosInput').addEventListener('change', async (e) => {
  photosFiles = Array.from(e.target.files);
});

async function loadImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => { const img = new Image(); img.onload = () => resolve(img); img.src = e.target.result; };
    reader.readAsDataURL(file);
  });
}

function detectOrientation(img) { return img.width > img.height ? 'landscape' : 'portrait'; }

// Preview Generation
async function generatePreview() {
  if (!frames.portrait && !frames.landscape) { alert("Please upload at least one frame."); return; }
  if (photosFiles.length === 0) { alert("Please upload at least one photo."); return; }
  
  batch = [];
  showProgress('Framing Photos...');
  document.getElementById('previewContent').innerHTML = '<div class="grid-thumbs" id="previewGrid"></div>';
  
  for (let i = 0; i < photosFiles.length; i++) {
    await new Promise(r => setTimeout(r, 50));
    updateProgress(i+1, photosFiles.length);
    const img = await loadImage(photosFiles[i]);
    const orientation = detectOrientation(img);
    
    if(!frames[orientation]) {
       console.log(`Skipped photo ${i+1}: Missing ${orientation} frame.`);
       continue;
    }
    
    batch.push({
      photo: img, 
      frame: frames[orientation],
      brightness: 100, zoom: 1, panX: 0, panY: 0, index: batch.length
    });
    
    await renderSinglePreviewThumbnail(batch.length - 1);
  }
  
  hideProgress();
  if(batch.length > 0) document.getElementById('exportSection').style.display = 'block';
  else document.getElementById('previewContent').innerHTML = '<div class="empty-state">No matching photos found for uploaded frames.</div>';
}

async function renderSinglePreviewThumbnail(idx) {
  const grid = document.getElementById('previewGrid');
  const item = batch[idx];
  let thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.innerHTML = '<canvas></canvas><button class="btn btn-primary thumb-btn">Edit</button>';
  grid.appendChild(thumb);
  
  thumb.querySelector('button').onclick = () => openAdjustModal(idx);
  
  const canvas = thumb.querySelector('canvas');
  // Simple square box for preview bounds inside the CSS Grid, canvas keeps aspect ratio
  canvas.width = 250; canvas.height = 250; 
  compositeImage(item, canvas);
}

function compositeImage(item, targetCanvas) {
  const { photo, frame, zoom, panX, panY, brightness } = item;
  const ctx = targetCanvas.getContext('2d');
  
  // Set dimensions based on frame aspect ratio
  const fa = frame.width / frame.height;
  let cw = 250, ch = 250;
  if(fa >= 1) ch = cw / fa; else cw = ch * fa;
  
  targetCanvas.width = cw; targetCanvas.height = ch;
  
  ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,cw,ch);
  
  // Draw Photo
  ctx.save();
  ctx.filter = `brightness(${brightness}%)`;
  
  // Simple crop/cover math
  const pa = photo.width / photo.height;
  let pw, ph;
  if(pa > fa) { ph = ch * zoom; pw = ph * pa; } 
  else { pw = cw * zoom; ph = pw / pa; }
  
  const px = (cw - pw) / 2 + panX;
  const py = (ch - ph) / 2 + panY;
  
  ctx.drawImage(photo, px, py, pw, ph);
  ctx.restore();
  
  // Draw Frame
  ctx.drawImage(frame, 0, 0, cw, ch);
}

// Editor functionality
let isDragging = false, startX, startY;
function openAdjustModal(idx) {
  currentAdjustIndex = idx;
  const item = batch[idx];
  document.getElementById('adjZoom').value = item.zoom * 100;
  document.getElementById('adjBrightness').value = item.brightness;
  document.getElementById('adjustModal').classList.add('show');
  updateAdjustPreview();
}

function closeAdjustModal() { document.getElementById('adjustModal').classList.remove('show'); }

document.getElementById('adjZoom').addEventListener('input', (e) => {
  batch[currentAdjustIndex].zoom = e.target.value / 100;
  updateAdjustPreview();
});
document.getElementById('adjBrightness').addEventListener('input', (e) => {
  batch[currentAdjustIndex].brightness = e.target.value;
  updateAdjustPreview();
});

function updateAdjustPreview() {
  const canvas = document.getElementById('adjustCanvas');
  compositeImage(batch[currentAdjustIndex], canvas);
}

// Drag functionality for panning
const adjArea = document.getElementById('adjustPreviewArea');
adjArea.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX; startY = e.clientY; });
adjArea.addEventListener('mousemove', (e) => {
  if(!isDragging) return;
  const item = batch[currentAdjustIndex];
  item.panX += (e.clientX - startX) * 0.5;
  item.panY += (e.clientY - startY) * 0.5;
  startX = e.clientX; startY = e.clientY;
  updateAdjustPreview();
});
adjArea.addEventListener('mouseup', () => isDragging = false);
adjArea.addEventListener('mouseleave', () => isDragging = false);

// Apply to All
function applyToAll() {
  const ref = batch[currentAdjustIndex];
  const orientationRef = ref.frame.width > ref.frame.height ? 'landscape' : 'portrait';
  
  batch.forEach(item => {
    const orientationItem = item.frame.width > item.frame.height ? 'landscape' : 'portrait';
    if(orientationItem === orientationRef) {
      item.zoom = ref.zoom;
      item.panX = ref.panX;
      item.panY = ref.panY;
      item.brightness = ref.brightness;
    }
  });
  alert('Applied edit settings to all photos of the same orientation!');
  saveAdjustment();
}

function saveAdjustment() {
  closeAdjustModal();
  document.getElementById('previewGrid').innerHTML = '';
  batch.forEach((item, idx) => renderSinglePreviewThumbnail(idx));
}

async function downloadZip() {
  const zip = new JSZip();
  showProgress('Creating ZIP...');
  for(let i=0; i<batch.length; i++) {
    updateProgress(i+1, batch.length);
    const item = batch[i];
    
    // Render full res
    const c = document.createElement('canvas');
    c.width = item.frame.width; c.height = item.frame.height;
    
    // Scale pan and zoom to full res
    const scaleFactor = item.frame.width / 250; // based on our thumbnail cw logic
    const tempItem = {...item, panX: item.panX * scaleFactor, panY: item.panY * scaleFactor, cw: item.frame.width, ch: item.frame.height };
    
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,c.width,c.height);
    
    ctx.save();
    ctx.filter = `brightness(${tempItem.brightness}%)`;
    const pa = tempItem.photo.width / tempItem.photo.height;
    const fa = tempItem.frame.width / tempItem.frame.height;
    let pw, ph;
    if(pa > fa) { ph = c.height * tempItem.zoom; pw = ph * pa; } 
    else { pw = c.width * tempItem.zoom; ph = pw / pa; }
    const px = (c.width - pw) / 2 + tempItem.panX;
    const py = (c.height - ph) / 2 + tempItem.panY;
    
    ctx.drawImage(tempItem.photo, px, py, pw, ph);
    ctx.restore();
    ctx.drawImage(tempItem.frame, 0, 0, c.width, c.height);
    
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    zip.file(`framed_${String(i+1).padStart(3,'0')}.jpg`, blob);
  }
  hideProgress();
  const zipBlob = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(zipBlob);
  a.download = (document.getElementById('zipName').value || 'Framed_Photos') + '.zip';
  a.click();
}
