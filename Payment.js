// ======================== PAYMENT METHODS (with localStorage) =================
let paymentMethods = [];

function loadPaymentMethods() {
  const stored = localStorage.getItem('batchFramer_paymentMethods');
  if (stored) {
    try {
      paymentMethods = JSON.parse(stored);
    } catch(e) { paymentMethods = []; }
  }
  if (!paymentMethods.length) paymentMethods = [];
}

function savePaymentMethods() {
  localStorage.setItem('batchFramer_paymentMethods', JSON.stringify(paymentMethods));
  const publicContainer = document.getElementById('paymentMethodsContainer');
  if (publicContainer && getComputedStyle(document.getElementById('paymentDisplayModal')).display !== 'none') {
    renderPublicModal();
  }
}

function renderPublicModal() {
  const container = document.getElementById('paymentMethodsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (paymentMethods.length === 0) {
    container.innerHTML = '<p style="text-align:center">No payment methods configured yet.</p>';
    return;
  }
  paymentMethods.forEach(method => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#2d3748; border-radius:16px; padding:12px; margin-bottom:12px;';
    let qrHtml = '';
    if (method.qr && method.qr.startsWith('data:image')) {
      qrHtml = `<img src="${method.qr}" style="max-width:100px; margin-top:8px" alt="QR">`;
    }
    card.innerHTML = `
      <div style="font-weight:bold; margin-bottom:6px">${escapeHtml(method.name)}</div>
      <div style="font-family:monospace; font-size:0.8rem; word-break:break-all">${escapeHtml(method.value)}</div>
      ${qrHtml}
    `;
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Editor functions
function renderEditorModal() {
  const container = document.getElementById('editorPaymentList');
  if (!container) return;
  container.innerHTML = '';
  if (paymentMethods.length === 0) {
    container.innerHTML = '<p style="color:#9ca3af">No payment methods. Click "Add New".</p>';
  }
  paymentMethods.forEach((method, idx) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#374151; border-radius:16px; padding:12px; margin-bottom:12px;';
    let qrPreview = '';
    if (method.qr && method.qr.startsWith('data:image')) {
      qrPreview = `<img src="${method.qr}" style="max-width:60px; max-height:60px; margin-top:4px; display:block">`;
    }
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap;">
        <div style="flex:1">
          <strong>${escapeHtml(method.name)}</strong><br>
          <span style="font-size:0.8rem; word-break:break-all">${escapeHtml(method.value)}</span><br>
          ${qrPreview}
        </div>
        <div>
          <button class="btn btn-outline edit-method-btn" data-index="${idx}" style="padding:4px 10px; font-size:0.75rem; margin-right:6px;">✏️ Edit</button>
          <button class="btn btn-red delete-method-btn" data-index="${idx}" style="padding:4px 10px; font-size:0.75rem;">🗑️ Delete</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  document.querySelectorAll('.edit-method-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      editMethod(idx);
    });
  });
  document.querySelectorAll('.delete-method-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.index);
      if (confirm(`Delete "${paymentMethods[idx].name}"?`)) {
        paymentMethods.splice(idx, 1);
        savePaymentMethods();
        renderEditorModal();
      }
    });
  });
}

function editMethod(index) {
  const method = paymentMethods[index];
  const formHtml = `
    <div style="background:#1f2937; padding:16px; border-radius:16px; margin-bottom:16px">
      <h4>Edit Payment Method</h4>
      <label>Name</label>
      <input type="text" id="editName" value="${escapeHtml(method.name)}" style="width:100%; margin-bottom:12px">
      <label>Value / Account info</label>
      <textarea id="editValue" rows="2" style="width:100%; margin-bottom:12px">${escapeHtml(method.value)}</textarea>
      <label>QR Code (image file) – optional</label>
      <input type="file" id="editQRUpload" accept="image/*" style="margin-bottom:12px">
      <div id="editQRPreview">${method.qr ? `<img src="${method.qr}" style="max-width:100px">` : ''}</div>
      <div style="display:flex; gap:8px; margin-top:12px">
        <button class="btn btn-primary" id="saveEditBtn">Save</button>
        <button class="btn btn-outline" id="cancelEditBtn">Cancel</button>
      </div>
    </div>
  `;
  const container = document.getElementById('editorPaymentList');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = formHtml;
  container.appendChild(tempDiv);
  const saveBtn = tempDiv.querySelector('#saveEditBtn');
  const cancelBtn = tempDiv.querySelector('#cancelEditBtn');
  const fileInput = tempDiv.querySelector('#editQRUpload');
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(ev) {
        const previewDiv = tempDiv.querySelector('#editQRPreview');
        previewDiv.innerHTML = `<img src="${ev.target.result}" style="max-width:100px">`;
        method.qr = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
  saveBtn.onclick = () => {
    const newName = tempDiv.querySelector('#editName').value.trim();
    const newValue = tempDiv.querySelector('#editValue').value.trim();
    if (newName && newValue) {
      method.name = newName;
      method.value = newValue;
      if (!method.qr) method.qr = '';
      savePaymentMethods();
      renderEditorModal();
    } else {
      alert("Name and Value are required.");
    }
  };
  cancelBtn.onclick = () => {
    renderEditorModal();
  };
}

function addNewMethod() {
  const newMethod = { name: "New Method", value: "Enter details", type: "", qr: "" };
  paymentMethods.push(newMethod);
  savePaymentMethods();
  renderEditorModal();
  editMethod(paymentMethods.length - 1);
}

function openPaymentEditor() {
  renderEditorModal();
  document.getElementById('paymentEditorModal').classList.add('open');
}

function openPublicDisplayModal() {
  renderPublicModal();
  document.getElementById('paymentDisplayModal').classList.add('open');
}

// Secret trigger: 5 clicks on logo
let clickCount = 0, clickTimer = null;
const logo = document.getElementById('secretLogoTrigger');
if (logo) {
  logo.addEventListener('click', () => {
    clickCount++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clickCount = 0; }, 2000);
    if (clickCount >= 5) {
      clickCount = 0;
      openPaymentEditor();
    }
  });
}

// Modal close buttons
const closeDisplay = document.getElementById('closePaymentDisplayModal');
if (closeDisplay) closeDisplay.onclick = () => document.getElementById('paymentDisplayModal').classList.remove('open');
const closeEditor = document.getElementById('closeEditorModalBtn');
if (closeEditor) closeEditor.onclick = () => document.getElementById('paymentEditorModal').classList.remove('open');
const viewPublic = document.getElementById('viewPublicModalBtn');
if (viewPublic) viewPublic.onclick = () => openPublicDisplayModal();
const addNew = document.getElementById('addNewMethodBtn');
if (addNew) addNew.onclick = () => addNewMethod();

// Load saved data
loadPaymentMethods();