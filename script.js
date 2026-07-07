// script.js
const MAX_DECODE_PX = 1200;
let frames = { portrait: null, landscape: null };
let photosFiles = [];
let batch = [];

// Random Buy Me A Coffee Popup Logic
setTimeout(() => {
    document.getElementById('bmc-modal').classList.add('show');
}, Math.random() * (15000 - 8000) + 8000); // Pops up between 8 to 15 seconds

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

function hideProgress() { 
    document.getElementById('progressOverlay').classList.remove('show'); 
}

// Upload Frames Check (1 Portrait, 1 Landscape logic)
document.getElementById('frameInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 2) {
    alert("❌ Please upload a maximum of 2 frames (1 portrait, 1 landscape).");
    e.target.value = '';
    return;
  }
  
  frames = { portrait: null, landscape: null };
  let pCount = 0; let lCount = 0;
  
  for (let f of files) {
    const img = await loadImage(f);
    const orientation = detectOrientation(img);
    if (orientation === 'portrait') pCount++;
    if (orientation === 'landscape') lCount++;
    frames[orientation] = f;
  }
  
  if (pCount > 1 || lCount > 1) {
    alert("❌ Invalid! You uploaded two frames of the same orientation. Please upload exactly one portrait and/or one landscape.");
    frames = { portrait: null, landscape: null };
    e.target.value = '';
  } else {
    alert(`✅ Frames accepted! (${pCount} Portrait, ${lCount} Landscape)`);
  }
});

document.getElementById('photosInput').addEventListener('change', (e) => {
    photosFiles = Array.from(e.target.files);
    alert(`📸 Loaded ${photosFiles.length} photos.`);
});

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

async function generatePreview() {
  if (!frames.portrait && !frames.landscape) { alert("Please upload at least one frame first."); return; }
  if (photosFiles.length === 0) { alert("Please upload at least one photo."); return; }
  
  const loadedFrames = {};
  if (frames.portrait) loadedFrames.portrait = await loadImage(frames.portrait);
  if (frames.landscape) loadedFrames.landscape = await loadImage(frames.landscape);
  
  const matchingPhotos = [];
  let mismatched = 0;

  for (let i = 0; i < photosFiles.length; i++) {
    const img = await loadImage(photosFiles[i]);
    const photoOrientation = detectOrientation(img);
    
    if (loadedFrames[photoOrientation]) {
      matchingPhotos.push({ file: photosFiles[i], frameImg: loadedFrames[photoOrientation], img: img });
    } else {
      mismatched++;
    }
  }
  
  if (mismatched > 0) alert(`⚠️ ${mismatched} photo(s) excluded because they don't match the orientation of your uploaded frames.`);
  if (matchingPhotos.length === 0) { alert("No photos match the uploaded frame orientations."); return; }
  
  batch = [];
  showProgress('Framing Photos...');
  document.getElementById('previewContent').innerHTML = '<div class="grid-thumbs" id="previewGrid"></div>';
  
  for (let i = 0; i < matchingPhotos.length; i++) {
    await new Promise(r => setTimeout(r, 50));
    updateProgress(i+1, matchingPhotos.length);
    const scaled = await downscaleImage(matchingPhotos[i].img);
    
    batch.push({ photo: scaled, frame: matchingPhotos[i].frameImg, index: i });
    renderSinglePreviewThumbnail(i);
  }
  
  hideProgress();
  document.getElementById('enhanceActions').style.display = 'flex';
}

function renderSinglePreviewThumbnail(idx) {
  const grid = document.getElementById('previewGrid');
  const item = batch[idx];
  
  let thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.setAttribute('data-index', idx);
  
  let canvas = document.createElement('canvas');
  // Fixed size limitation removed, letting flexbox naturally wrap them
  const targetWidth = 250;
  const ratio = item.frame.height / item.frame.width;
  
  canvas.width = targetWidth;
  canvas.height = targetWidth * ratio;
  
  thumb.appendChild(canvas);
  grid.appendChild(thumb);
  
  compositeImage(item, canvas);
}

function compositeImage(item, canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Calculate to Fit
  const hRatio = canvas.width / item.photo.width;
  const vRatio = canvas.height / item.photo.height;
  const ratio = Math.min(hRatio, vRatio);
  
  const centerShift_x = (canvas.width - item.photo.width * ratio) / 2;
  const centerShift_y = (canvas.height - item.photo.height * ratio) / 2;
  
  // Draw Photo
  ctx.drawImage(item.photo, 0,0, item.photo.width, item.photo.height, centerShift_x, centerShift_y, item.photo.width * ratio, item.photo.height * ratio);
  
  // Draw Frame
  ctx.drawImage(item.frame, 0, 0, canvas.width, canvas.height);
}

async function downloadZip() {
  if (batch.length === 0) return;
  const zip = new JSZip();
  showProgress('Creating ZIP...');
  
  for(let i=0; i<batch.length; i++){
    await new Promise(r=>setTimeout(r,50)); updateProgress(i+1,batch.length);
    const item = batch[i];
    const c = document.createElement('canvas');
    c.width = item.frame.width;
    c.height = item.frame.height;
    compositeImage(item, c);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    zip.file(`framed_photo_${String(i+1).padStart(3,'0')}.jpg`, blob);
  }
  hideProgress();
  const zipBlob = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  a.download = 'Framed_Photos.zip';
  a.click();
}
