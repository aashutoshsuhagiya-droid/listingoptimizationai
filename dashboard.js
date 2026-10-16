(() => {
  'use strict';

  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_OPTIMIZED_IMAGE_BYTES = 820 * 1024;
  const MAX_COMBINED_IMAGE_BYTES = 2.35 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const TEMPLATE_LABELS = {
    'feature-spotlight': 'Feature Spotlight',
    'benefit-stack': 'Benefit Stack',
    'lifestyle-story': 'Lifestyle Story',
    'marketplace-main': 'Marketplace Main'
  };

  const state = {
    files: [],
    results: [],
    busy: false,
    currentUser: null,
    toastTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    authLoading: $('#auth-loading'),
    app: $('#dashboard-app'),
    form: $('#generator-form'),
    uploadZone: $('#upload-zone'),
    fileInput: $('#product-images'),
    uploadPreviews: $('#upload-previews'),
    uploadError: $('#upload-error'),
    briefError: $('#brief-error'),
    directionError: $('#direction-error'),
    templateCount: $('#template-count'),
    brandColor: $('#brand-color'),
    brandColorValue: $('#brand-color-value'),
    generateButton: $('#generate-btn'),
    progress: $('#generation-progress'),
    progressTitle: $('#progress-title'),
    progressMessage: $('#progress-message'),
    progressBar: $('#progress-bar'),
    projectStatus: $('#project-status'),
    resultsSection: $('#results-section'),
    resultsEmpty: $('#results-empty'),
    resultsGrid: $('#results-grid'),
    downloadAll: $('#download-all-btn'),
    toast: $('#toast')
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showToast(message, type = 'info') {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-error', type === 'error');
    elements.toast.classList.add('is-visible');
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 4800);
  }

  function showDashboard(user) {
    state.currentUser = user;
    const displayName = user.displayName || user.email?.split('@')[0] || 'User';
    $('#user-name').textContent = displayName;
    $('#user-email').textContent = user.email || '';
    $('#user-avatar').textContent = displayName.slice(0, 1).toUpperCase();
    elements.authLoading.hidden = true;
    elements.app.hidden = false;
    document.body.classList.remove('is-auth-loading');
  }

  function initializeAuth() {
    if (!window.Auth) {
      elements.authLoading.innerHTML = '<p>Authentication failed to load. Please refresh the page.</p>';
      return;
    }

    Auth.onAuthStateChanged((user) => {
      if (!user) {
        window.location.href = '/login.html';
        return;
      }
      showDashboard(user);
    });

    $('#logout-btn').addEventListener('click', async () => {
      const result = await Auth.logout();
      if (result.success) window.location.href = '/';
      else showToast(result.error || 'Could not log out.', 'error');
    });
  }

  function formatFileSize(bytes) {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;
  }

  function addFiles(fileList) {
    elements.uploadError.textContent = '';
    const incoming = [...fileList];

    for (const file of incoming) {
      if (state.files.length >= MAX_FILES) {
        elements.uploadError.textContent = `You can upload a maximum of ${MAX_FILES} product images.`;
        break;
      }
      if (!ACCEPTED_TYPES.has(file.type)) {
        elements.uploadError.textContent = `${file.name} is not a supported JPG, PNG, or WebP file.`;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        elements.uploadError.textContent = `${file.name} is larger than 12 MB.`;
        continue;
      }
      if (state.files.some((item) => item.file.name === file.name && item.file.size === file.size)) continue;

      state.files.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }

    elements.fileInput.value = '';
    renderUploads();
    updateWorkflow(state.files.length ? 2 : 1);
  }

  function renderUploads() {
    elements.uploadPreviews.innerHTML = state.files.map((item, index) => `
      <article class="upload-preview ${index === 0 ? 'is-primary' : ''}" data-file-id="${item.id}">
        ${index === 0 ? '<span class="preview-primary">PRIMARY</span>' : ''}
        <img src="${item.previewUrl}" alt="Preview of ${escapeHtml(item.file.name)}">
        <footer>
          <div>
            <strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong>
            <small>${formatFileSize(item.file.size)}</small>
          </div>
          <button class="remove-upload" type="button" data-remove-file="${item.id}" aria-label="Remove ${escapeHtml(item.file.name)}">×</button>
        </footer>
      </article>
    `).join('');

    $$('[data-remove-file]', elements.uploadPreviews).forEach((button) => {
      button.addEventListener('click', () => {
        const index = state.files.findIndex((item) => item.id === button.dataset.removeFile);
        if (index < 0) return;
        URL.revokeObjectURL(state.files[index].previewUrl);
        state.files.splice(index, 1);
        renderUploads();
        updateWorkflow(state.files.length ? 2 : 1);
      });
    });
  }

  function initializeUpload() {
    elements.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
    elements.uploadZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        elements.fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      elements.uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.uploadZone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      elements.uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.uploadZone.classList.remove('is-dragging');
      });
    });
    elements.uploadZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  }

  function selectedTemplates() {
    return $$('input[name="templates"]:checked').map((input) => input.value);
  }

  function updateTemplateCount() {
    const count = selectedTemplates().length;
    elements.templateCount.textContent = `${count} of 3 concepts selected`;
  }

  function initializeTemplates() {
    $$('input[name="templates"]').forEach((input) => {
      input.addEventListener('change', () => {
        const selected = selectedTemplates();
        if (selected.length > 3) {
          input.checked = false;
          showToast('Choose a maximum of three concepts.', 'error');
        }
        updateTemplateCount();
      });
    });
    updateTemplateCount();
  }

  function updateWorkflow(activeStep) {
    $$('[data-nav-step]').forEach((item) => {
      const step = Number(item.dataset.navStep);
      item.classList.toggle('is-complete', step < activeStep);
      item.classList.toggle('is-active', step === activeStep);
    });
  }

  function clearValidation() {
    [elements.uploadError, elements.briefError, elements.directionError].forEach((element) => { element.textContent = ''; });
    $$('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
  }

  function markInvalid(element) {
    if (element) element.setAttribute('aria-invalid', 'true');
  }

  function readBenefits() {
    return $('#product-benefits').value
      .split(/\n|;/)
      .map((benefit) => benefit.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  function validateForm() {
    clearValidation();
    let valid = true;
    const productName = $('#product-name');
    const category = $('#product-category');
    const benefits = readBenefits();
    const templates = selectedTemplates();

    if (!state.files.length) {
      elements.uploadError.textContent = 'Upload at least one clear product image.';
      valid = false;
    }
    if (!productName.value.trim()) {
      elements.briefError.textContent = 'Add the product name and at least one verified benefit.';
      markInvalid(productName);
      valid = false;
    }
    if (!category.value.trim()) {
      elements.briefError.textContent = 'Add the product name, category, and at least one verified benefit.';
      markInvalid(category);
      valid = false;
    }
    if (!benefits.length) {
      elements.briefError.textContent = 'Add at least one verified benefit.';
      markInvalid($('#product-benefits'));
      valid = false;
    }
    if (!templates.length) {
      elements.directionError.textContent = 'Select at least one creative concept.';
      valid = false;
    }
    if (!$('#rights-confirmation').checked) {
      elements.directionError.textContent = 'Confirm image rights and claim accuracy before generating.';
      valid = false;
    }

    if (!valid) {
      const firstError = $('.field-error:not(:empty)');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }

    return {
      productName: productName.value.trim(),
      category: category.value.trim(),
      audience: $('#target-audience').value.trim(),
      marketplace: $('#marketplace').value,
      benefits,
      headline: $('#creative-headline').value.trim() || productName.value.trim(),
      subheadline: $('#creative-subheadline').value.trim() || benefits[0],
      visualStyle: $('#visual-style').value,
      canvasFormat: $('#canvas-format').value,
      brandColor: elements.brandColor.value,
      templates
    };
  }

  function loadFileImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Could not read ${file.name}.`));
      };
      image.src = url;
    });
  }

  function estimateDataUrlBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    return Math.ceil(base64.length * .75);
  }

  async function compressImage(file) {
    const image = await loadFileImage(file);
    if (image.naturalWidth < 256 || image.naturalHeight < 256) {
      throw new Error(`${file.name} must be at least 256 × 256 pixels.`);
    }
    if (image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new Error(`${file.name} has too many pixels. Resize it below 40 megapixels.`);
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    let edge = 1400;
    let quality = .88;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const result = canvas.toDataURL('image/jpeg', quality);
      if (estimateDataUrlBytes(result) <= MAX_OPTIMIZED_IMAGE_BYTES) return result;

      if (quality > .65) quality -= .08;
      else {
        edge = Math.max(768, Math.round(edge * .82));
        quality = .8;
      }
    }

    throw new Error(`${file.name} could not be optimized safely. Use a simpler or smaller photo.`);
  }

  function setProgress(percent, title, message) {
    elements.progressBar.style.width = `${Math.max(4, Math.min(100, percent))}%`;
    elements.progressTitle.textContent = title;
    elements.progressMessage.textContent = message;
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.generateButton.disabled = busy;
    elements.projectStatus.textContent = busy ? 'Generating' : state.results.length ? 'Complete' : 'Draft';
    elements.projectStatus.classList.toggle('is-generating', busy);
    elements.progress.hidden = !busy;
    elements.form.querySelectorAll('input, textarea, select, button').forEach((control) => {
      if (control !== elements.generateButton) control.disabled = busy;
    });
  }

  async function requestGeneration(payload, template, images, token) {
    const response = await fetch('/api/generate-infographic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...payload,
        template,
        images
      })
    });

    let body;
    try { body = await response.json(); }
    catch { body = {}; }

    if (!response.ok) {
      const error = new Error(body.error || 'Image generation failed.');
      error.code = body.code;
      error.status = response.status;
      throw error;
    }
    if (!body.image) throw new Error('The generation service returned no image.');
    return body;
  }

  function loadDataImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not prepare the generated image.'));
      image.src = source;
    });
  }

  function hexToRgb(hex) {
    const clean = String(hex).replace('#', '');
    const parsed = Number.parseInt(clean.length === 3
      ? clean.split('').map((value) => value + value).join('')
      : clean, 16);
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function fitText(context, text, maxWidth) {
    const copy = String(text).trim();
    if (context.measureText(copy).width <= maxWidth) return copy;

    const characters = [...copy];
    while (characters.length && context.measureText(`${characters.join('')}…`).width > maxWidth) {
      characters.pop();
    }
    return characters.length ? `${characters.join('').trim()}…` : '';
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text).trim().split(/\s+/);
    const lines = [];
    let line = '';

    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        if (lines.length === maxLines - 1) {
          line = fitText(context, `${line} ${words.slice(index).join(' ')}`, maxWidth);
          break;
        }
        lines.push(fitText(context, line, maxWidth));
        line = word;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(fitText(context, line, maxWidth));

    lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  function drawBenefitPills(context, benefits, x, y, maxWidth, scale, dark = true) {
    let currentY = y;
    benefits.slice(0, 3).forEach((benefit) => {
      const height = 44 * scale;
      roundRect(context, x, currentY, maxWidth, height, 22 * scale);
      context.fillStyle = dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.88)';
      context.fill();
      context.fillStyle = dark ? '#ffffff' : '#20213f';
      context.font = `600 ${14 * scale}px Inter, Arial, sans-serif`;
      const copy = fitText(context, `✓  ${benefit}`, maxWidth - 32 * scale);
      context.fillText(copy, x + 16 * scale, currentY + 28 * scale);
      currentY += height + 10 * scale;
    });
  }

  async function composeInfographic(source, payload, template) {
    if (template === 'marketplace-main') return source;
    await document.fonts?.ready;
    const image = await loadDataImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.max(.72, Math.min(1.45, width / 1536));
    const accent = payload.brandColor;

    if (template === 'feature-spotlight') {
      const gradient = context.createLinearGradient(0, 0, width * .72, 0);
      gradient.addColorStop(0, 'rgba(12,13,38,.94)');
      gradient.addColorStop(.58, 'rgba(12,13,38,.76)');
      gradient.addColorStop(1, 'rgba(12,13,38,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width * .76, height);

      context.fillStyle = accent;
      roundRect(context, 72 * scale, 78 * scale, 148 * scale, 35 * scale, 18 * scale);
      context.fill();
      context.fillStyle = '#fff';
      context.font = `800 ${12 * scale}px Inter, Arial, sans-serif`;
      context.fillText('FEATURE SPOTLIGHT', 88 * scale, 101 * scale);

      context.fillStyle = '#fff';
      context.font = `800 ${56 * scale}px Inter, Arial, sans-serif`;
      const copyEnd = wrapText(context, payload.headline, 72 * scale, 190 * scale, width * .42, 63 * scale, 3);
      context.fillStyle = 'rgba(255,255,255,.8)';
      context.font = `500 ${21 * scale}px Inter, Arial, sans-serif`;
      wrapText(context, payload.subheadline, 74 * scale, copyEnd + 22 * scale, width * .39, 29 * scale, 2);
      drawBenefitPills(context, payload.benefits.slice(0, 2), 72 * scale, height - 175 * scale, width * .39, scale, true);
    }

    if (template === 'benefit-stack') {
      const gradient = context.createLinearGradient(0, height * .38, 0, height);
      gradient.addColorStop(0, 'rgba(10,11,30,0)');
      gradient.addColorStop(.55, 'rgba(10,11,30,.62)');
      gradient.addColorStop(1, 'rgba(10,11,30,.94)');
      context.fillStyle = gradient;
      context.fillRect(0, height * .3, width, height * .7);

      context.fillStyle = rgba(accent, .95);
      context.fillRect(66 * scale, height - 290 * scale, 8 * scale, 188 * scale);
      context.fillStyle = '#fff';
      context.font = `800 ${46 * scale}px Inter, Arial, sans-serif`;
      wrapText(context, payload.headline, 96 * scale, height - 250 * scale, width * .45, 53 * scale, 2);
      drawBenefitPills(context, payload.benefits, width * .57, height - 245 * scale, width * .36, scale, true);
    }

    if (template === 'lifestyle-story') {
      const panelX = 58 * scale;
      const panelY = 60 * scale;
      const panelWidth = width * .43;
      const panelHeight = Math.min(height * .55, 390 * scale);
      roundRect(context, panelX, panelY, panelWidth, panelHeight, 22 * scale);
      context.fillStyle = 'rgba(255,255,255,.9)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.55)';
      context.lineWidth = 2 * scale;
      context.stroke();

      context.fillStyle = accent;
      context.font = `800 ${13 * scale}px Inter, Arial, sans-serif`;
      context.fillText(payload.category.toUpperCase(), panelX + 35 * scale, panelY + 50 * scale);
      context.fillStyle = '#171838';
      context.font = `800 ${43 * scale}px Inter, Arial, sans-serif`;
      const end = wrapText(context, payload.headline, panelX + 35 * scale, panelY + 112 * scale, panelWidth - 70 * scale, 49 * scale, 3);
      context.fillStyle = '#686b7e';
      context.font = `500 ${18 * scale}px Inter, Arial, sans-serif`;
      wrapText(context, payload.subheadline, panelX + 35 * scale, end + 18 * scale, panelWidth - 70 * scale, 26 * scale, 2);
    }

    return canvas.toDataURL('image/jpeg', .92);
  }

  function resultRatio(format) {
    if (format === 'square') return '1 / 1';
    if (format === 'portrait') return '2 / 3';
    return '3 / 2';
  }

  function resultFilename(result) {
    const base = slugify(result.productName || 'product');
    return `${base}-${result.template}.jpg`;
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55) || 'creative';
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function openDataImage(dataUrl) {
    try {
      const [metadata, encoded] = dataUrl.split(',');
      const mimeType = /^data:([^;]+);base64$/i.exec(metadata)?.[1] || 'image/jpeg';
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const popup = window.open(objectUrl, '_blank');
      if (popup) popup.opener = null;
      else showToast('Allow pop-ups to open the full-size preview.', 'error');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      showToast('The full-size preview could not be opened. Download the image instead.', 'error');
    }
  }

  function renderResults() {
    elements.resultsEmpty.hidden = Boolean(state.results.length);
    elements.downloadAll.hidden = state.results.length < 2;
    elements.resultsGrid.innerHTML = '';

    state.results.forEach((result) => {
      const card = document.createElement('article');
      card.className = 'result-card';
      card.style.setProperty('--result-ratio', resultRatio(result.canvasFormat));

      const image = document.createElement('img');
      image.src = result.image;
      image.alt = `${TEMPLATE_LABELS[result.template]} creative for ${result.productName}`;

      const footer = document.createElement('footer');
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      title.textContent = TEMPLATE_LABELS[result.template] || result.template;
      meta.textContent = `${result.canvasFormat} · JPG`;
      copy.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'result-actions';
      const view = document.createElement('button');
      view.type = 'button';
      view.textContent = 'View';
      view.addEventListener('click', () => openDataImage(result.image));
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'primary';
      download.textContent = 'Download';
      download.addEventListener('click', () => downloadDataUrl(result.image, resultFilename(result)));
      actions.append(view, download);
      footer.append(copy, actions);
      card.append(image, footer);
      elements.resultsGrid.append(card);
    });
  }

  async function handleGeneration(event) {
    event.preventDefault();
    if (state.busy) return;
    const payload = validateForm();
    if (!payload) return;

    setBusy(true);
    updateWorkflow(4);
    setProgress(7, 'Preparing your product references…', 'Compressing uploads securely in your browser.');
    elements.progress.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const generated = [];
    const previousResults = state.results;

    try {
      const images = [];
      for (let index = 0; index < state.files.length; index += 1) {
        setProgress(8 + index * 4, 'Preparing your product references…', `Optimizing image ${index + 1} of ${state.files.length}.`);
        images.push(await compressImage(state.files[index].file));
      }

      const totalBytes = images.reduce((sum, image) => sum + estimateDataUrlBytes(image), 0);
      if (totalBytes > MAX_COMBINED_IMAGE_BYTES) {
        throw new Error('The optimized uploads are still too large. Use fewer or smaller source photos.');
      }

      const token = await state.currentUser.getIdToken(true);
      for (let index = 0; index < payload.templates.length; index += 1) {
        const template = payload.templates[index];
        const conceptPayload = template === 'marketplace-main'
          ? { ...payload, canvasFormat: 'square' }
          : payload;
        const start = 22 + (index / payload.templates.length) * 68;
        setProgress(
          start,
          `Creating ${TEMPLATE_LABELS[template]}…`,
          'Preserving the product while building the scene. This can take up to 90 seconds.'
        );
        const response = await requestGeneration(conceptPayload, template, images, token);
        setProgress(start + 16, 'Applying exact approved copy…', 'Rendering your headline and benefits without AI spelling errors.');
        const finalImage = await composeInfographic(response.image, conceptPayload, template);
        const result = {
          id: response.requestId || `${Date.now()}-${index}`,
          image: finalImage,
          template,
          productName: payload.productName,
          canvasFormat: conceptPayload.canvasFormat
        };
        generated.push(result);
        state.results = [...generated, ...previousResults];
        renderResults();
        incrementLocalGenerationCount(1);
      }

      setProgress(100, 'Creative set complete', 'Your finished images are ready to review and download.');
      showToast(`${generated.length} creative${generated.length === 1 ? '' : 's'} generated successfully.`);
      elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Generation failed:', error.code || error.status || error.message);
      const friendly = error.code === 'SERVICE_NOT_CONFIGURED'
        ? 'Generation is not configured yet. Add the required environment variables in Vercel and redeploy.'
        : error.code === 'DAILY_LIMIT_REACHED'
          ? 'Your daily generation limit has been reached.'
          : error.message || 'Generation failed. Please try again.';
      const message = generated.length
        ? `${generated.length} creative${generated.length === 1 ? '' : 's'} completed. The next concept stopped: ${friendly}`
        : friendly;
      showToast(message, 'error');
      setProgress(4, 'Generation stopped', message);
      if (generated.length) elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setTimeout(() => {
        setBusy(false);
        updateWorkflow(state.results.length ? 4 : 3);
      }, 500);
    }
  }

  function incrementLocalGenerationCount(amount) {
    try {
      const current = Number(localStorage.getItem('loai-generation-count') || 0);
      localStorage.setItem('loai-generation-count', String(current + amount));
    } catch {
      // Local history is optional.
    }
  }

  function initializeForm() {
    elements.brandColor.addEventListener('input', () => {
      elements.brandColorValue.value = elements.brandColor.value.toUpperCase();
      elements.brandColorValue.textContent = elements.brandColor.value.toUpperCase();
    });
    elements.form.addEventListener('submit', handleGeneration);
    elements.downloadAll.addEventListener('click', () => {
      state.results.forEach((result, index) => {
        setTimeout(() => downloadDataUrl(result.image, resultFilename(result)), index * 250);
      });
    });

    ['product-name', 'product-category', 'product-benefits'].forEach((id) => {
      $(`#${id}`).addEventListener('input', () => {
        if (state.files.length) updateWorkflow(3);
      });
    });
  }

  initializeAuth();
  initializeUpload();
  initializeTemplates();
  initializeForm();
})();
