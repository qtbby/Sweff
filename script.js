// script.js
const THUMB_MAX_WIDTH = 200;
let frameFile = null;
let photosFiles = [];
let batch = [];

// Track inputs
document.getElementById('frameInput').addEventListener('change', (e) => {
  if (e.target.files[0]) frameFile = e.target.files[0];
});

document.getElementById('photosInput').addEventListener('change', (e) => {
  photosFiles = Array.from(e.target.files);
});

// Helper to safely load images
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

function detectOrientation(img) {
  return img.width > img.height ? 'landscape' : 'portrait';
}

// Generate minimal preview grid automatically
async function generatePreview() {
  if (!frameFile) { alert("Please upload a frame PNG first."); return; }
  if (photosFiles.length === 0) { alert("Please upload at least one photo."); return; }

  const frameImg = await loadImage(frameFile);
  const frameOrientation = detectOrientation(frameImg);

  batch = [];
  const previewContent = document.getElementById('previewContent');
  previewContent.innerHTML = ''; // Clear empty state
  
  const grid = document.createElement('div');
  grid.className = 'preview-grid';
  previewContent.appendChild(grid);

  for (let i = 0; i < photosFiles.length; i++) {
    const img = await loadImage(photosFiles[i]);
    
    // Auto-match system orientation filter
    if (detectOrientation(img) !== frameOrientation) continue;

    batch.push({ photo: img, frame: frameImg });

    // Create minimal thumbnail preview slot
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const canvas = document.createElement('canvas');
    thumb.appendChild(canvas);
    grid.appendChild(thumb);

    // Calculate preview layout constraints
    const aspect = frameImg.width / frameImg.height;
    let tw = THUMB_MAX_WIDTH, th = THUMB_MAX_WIDTH / aspect;
    if (aspect < 1) { th = THUMB_MAX_WIDTH; tw = THUMB_MAX_WIDTH * aspect; }
    
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');

    // Composite: Center Crop Photo + Frame overlay
    renderComposite(img, frameImg, canvas, tw, th);
  }

  if (batch.length === 0) {
    previewContent.innerHTML = '<div class="empty-state"><p style="color:#ef4444;">No photos matched your frame orientation.</p></div>';
  } else {
    document.getElementById('exportSection').style.display = 'block';
  }
}

// Simple center-crop rendering logic shared between preview and final export
function renderComposite(photo, frame, canvas, targetW, targetH) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetW, targetH);

  const photoAspect = photo.width / photo.height;
  const frameAspect = frame.width / frame.height;
  
  let sw, sh, sx, sy;
  if (photoAspect > frameAspect) {
    sh = photo.height; sw = photo.height * frameAspect;
    sx = (photo.width - sw) / 2; sy = 0;
  } else {
    sw = photo.width; sh = photo.width / photoAspect;
    sx = 0; sy = (photo.height - sh) / 2;
  }

  ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, targetW, targetH);
  ctx.drawImage(frame, 0, 0, targetW, targetH);
}

// Export high resolution results directly to ZIP
async function downloadZip() {
  if (batch.length === 0) return;
  const zip = new JSZip();
  const zipName = document.getElementById('zipName').value || 'Framed_Photos';

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const canvas = document.createElement('canvas');
    canvas.width = item.frame.width;
    canvas.height = item.frame.height;

    renderComposite(item.photo, item.frame, canvas, canvas.width, canvas.height);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    zip.file(`framed_${String(i + 1).padStart(3, '0')}.jpg`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  a.download = zipName + '.zip';
  a.click();
}
