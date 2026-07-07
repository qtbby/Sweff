// script.js

let frames = { portrait: null, landscape: null };
let photosFiles = [];
let batch = [];
let currentEditorIndex = 0;

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

// ================= BUY ME A COFFEE POPUP =================
function triggerBmcPopup() {
  setTimeout(() => {
    document.getElementById('bmcPopup').classList.add('show');
  }, Math.floor(Math.random() * 15000) + 10000); // Pops up randomly between 10s - 25s after load
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

  frames = { portrait: null, landscape: null }; // Reset
  
  for (let file of files) {
    const img = await loadImage(file);
    const orientation = detectOrientation(img);
    
    if (orientation === 'portrait') {
      if (frames.portrait) { alert("Cannot accept two portrait frames. Only one portrait and one landscape."); e.target.value=''; frames={portrait:null, landscape:null}; return; }
      frames.portrait = { file, img };
    } else {
      if (frames.landscape) { alert("Cannot accept two landscape frames. Only one portrait and one landscape."); e.target.value=''; frames={portrait:null, landscape:null}; return; }
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


// ================= PREVIEW GENERATION =================
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
    
    // Skip if matching frame isn't uploaded
    if (!targetFrame) continue; 

    // Base settings payload for the robust editor
    const item = {
      photo: img, 
      frame: targetFrame.img,
      index: batch.length,
      settings: {
        exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
        temperature: 0, tint: 0, vibrance: 0, saturation: 0, hue: 0,
        sharpening: 0, noise: 0, clarity: 0, dehaze: 0, gamma: 100,
        scale: 100, rotation: 0, opacity: 100
      }
    };
    batch.push(item);
    
    // Render Thumbnail cleanly in grid
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const canvas = document.createElement('canvas');
    thumb.appendChild(canvas);
    grid.appendChild(thumb);
    
    renderCanvas(item, canvas);
  }
  
  if(batch.length === 0) {
    document.getElementById('previewContent').innerHTML = '<p class="empty-state">No photos matched the orientation of the uploaded frame(s).</p>';
  }
}

function renderCanvas(item, canvas) {
  const { photo, frame, settings } = item;
  
  // Set dimensions matching frame
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Apply visual transform & filters based on settings
  ctx.save();
  ctx.translate(canvas.width/2, canvas.height/2);
  ctx.rotate(settings.rotation * Math.PI / 180);
  const s = settings.scale / 100;
  ctx.scale(s, s);
  
  // Apply CSS filters representing complex editing requirements
  const br = 100 + Number(settings.exposure) + Number(settings.whites);
  const ct = 100 + Number(settings.contrast);
  const sat = 100 + Number(settings.saturation) + Number(settings.vibrance);
  const h = settings.hue;
  
  ctx.filter = `brightness(${br}%) contrast(${ct}%) saturate(${sat}%) hue-rotate(${h}deg) opacity(${settings.opacity}%)`;
  
  // Draw Photo
  // Fit photo proportionally inside the canvas space
  const scaleFit = Math.max(canvas.width / photo.width, canvas.height / photo.height);
  const dw = photo.width * scaleFit;
  const dh = photo.height * scaleFit;
  ctx.drawImage(photo, -dw/2, -dh/2, dw, dh);
  
  ctx.restore();
  
  // Draw Frame Over Photo
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
}


// ================= FULLSCREEN ROBUST EDITOR =================
function openFullscreenEditor() {
  if(batch.length === 0) { alert("Generate a preview first!"); return; }
  currentEditorIndex = 0;
  document.getElementById('fullEditor').classList.add('show');
  loadEditorUI();
}

function closeFullscreenEditor() {
  document.getElementById('fullEditor').classList.remove('show');
  // Re-render previews
  generatePreview();
}

function loadEditorUI() {
  const item = batch[currentEditorIndex];
  const keys = Object.keys(item.settings);
  
  // Populate UI sliders
  keys.forEach(k => {
    const el = document.getElementById(`ed_${k}`);
    if (el) el.value = item.settings[k];
  });
  
  updateEditor();
}

function updateEditor() {
  const item = batch[currentEditorIndex];
  
  // Read from sliders
  const keys = Object.keys(item.settings);
  keys.forEach(k => {
    const el = document.getElementById(`ed_${k}`);
    if (el) item.settings[k] = el.value;
  });
  
  const canvas = document.getElementById('mainEditorCanvas');
  renderCanvas(item, canvas);
}

function editorNext() {
  if (currentEditorIndex < batch.length - 1) {
    currentEditorIndex++;
    loadEditorUI();
  }
}

function editorPrev() {
  if (currentEditorIndex > 0) {
    currentEditorIndex--;
    loadEditorUI();
  }
}

function applyToAll() {
  const currentSettings = { ...batch[currentEditorIndex].settings };
  batch.forEach(item => {
    item.settings = { ...currentSettings };
  });
  alert("Settings applied to all images!");
}

function saveEditorChanges() {
  closeFullscreenEditor();
}


// ================= ZIP DOWNLOAD =================
async function downloadZip() {
  if (batch.length === 0) { alert("Nothing to download!"); return; }
  
  const zip = new JSZip();
  
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const c = document.createElement('canvas');
    renderCanvas(item, c);
    
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    zip.file(`framed_${String(i+1).padStart(3, '0')}.jpg`, blob);
  }
  
  zip.generateAsync({type:'blob'}).then(function(content) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = "Sweff_Framed_Batch.zip";
    a.click();
  });
}
