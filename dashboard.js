(() => {
  'use strict';

  const MAX_FILES = 3;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_OPTIMIZED_IMAGE_BYTES = 1.15 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const FINAL_SIZES = {
    landscape: { width: 2000, height: 1334 },
    square: { width: 2000, height: 2000 },
    portrait: { width: 1334, height: 2000 }
  };
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
    preparedProduct: null,
    lastRun: null,
    runStatus: 'draft',
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
    progressTrack: $('#progress-track'),
    cutoutReview: $('#cutout-review'),
    cutoutPreviewImage: $('#cutout-preview-image'),
    approveCutout: $('#approve-cutout-btn'),
    rejectCutout: $('#reject-cutout-btn'),
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
    const primaryIdBefore = state.files[0]?.id;

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
    if (primaryIdBefore !== state.files[0]?.id) state.preparedProduct = null;
    renderUploads();
    updateWorkflow(state.files.length ? 2 : 1);
  }

  function renderUploads() {
    elements.uploadPreviews.innerHTML = state.files.map((item, index) => `
      <article class="upload-preview ${index === 0 ? 'is-primary' : ''}" data-file-id="${item.id}">
        ${index === 0 ? '<span class="preview-primary">PRIMARY</span>' : ''}
        <img src="${item.previewUrl}" alt="Preview of ${escapeHtml(item.file.name)}">
        <footer>
          <div class="upload-file-copy">
            <strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong>
            <small>${formatFileSize(item.file.size)}</small>
          </div>
          <div class="upload-actions">
            ${index === 0 ? '' : `<button class="make-primary" type="button" data-primary-file="${item.id}" aria-label="Use ${escapeHtml(item.file.name)} as the primary product angle">Use</button>`}
            <button class="remove-upload" type="button" data-remove-file="${item.id}" aria-label="Remove ${escapeHtml(item.file.name)}">×</button>
          </div>
        </footer>
      </article>
    `).join('');

    $$('[data-primary-file]', elements.uploadPreviews).forEach((button) => {
      button.addEventListener('click', () => {
        const index = state.files.findIndex((item) => item.id === button.dataset.primaryFile);
        if (index < 1) return;
        const [selected] = state.files.splice(index, 1);
        state.files.unshift(selected);
        state.preparedProduct = null;
        renderUploads();
        showToast('Primary product angle updated.');
      });
    });

    $$('[data-remove-file]', elements.uploadPreviews).forEach((button) => {
      button.addEventListener('click', () => {
        const index = state.files.findIndex((item) => item.id === button.dataset.removeFile);
        if (index < 0) return;
        const removedPrimary = index === 0;
        URL.revokeObjectURL(state.files[index].previewUrl);
        state.files.splice(index, 1);
        if (removedPrimary) state.preparedProduct = null;
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
    const infographicBriefRequired = selectedTemplates().some((template) => template !== 'marketplace-main');
    $('#product-category').setAttribute('aria-required', String(infographicBriefRequired));
    $('#product-benefits').setAttribute('aria-required', String(infographicBriefRequired));
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
      .split(/\r?\n/)
      .map((benefit) => benefit.trim())
      .filter(Boolean);
  }

  function validateForm() {
    clearValidation();
    let valid = true;
    const productName = $('#product-name');
    const category = $('#product-category');
    const benefits = readBenefits();
    const templates = selectedTemplates();
    const needsInfographicBrief = templates.some((template) => template !== 'marketplace-main');

    if (!state.files.length) {
      elements.uploadError.textContent = 'Upload at least one clear product image.';
      valid = false;
    }
    if (!productName.value.trim()) {
      elements.briefError.textContent = 'Add the product name and at least one verified benefit.';
      markInvalid(productName);
      valid = false;
    }
    if (needsInfographicBrief && !category.value.trim()) {
      elements.briefError.textContent = 'Add the product name, category, and at least one verified benefit.';
      markInvalid(category);
      valid = false;
    }
    if (needsInfographicBrief && !benefits.length) {
      elements.briefError.textContent = 'Add at least one verified benefit.';
      markInvalid($('#product-benefits'));
      valid = false;
    }
    if (benefits.length > 3) {
      elements.briefError.textContent = 'Use a maximum of three verified benefit lines.';
      markInvalid($('#product-benefits'));
      valid = false;
    } else if (benefits.some((benefit) => benefit.length > 60)) {
      elements.briefError.textContent = 'Keep each verified benefit to 60 characters or fewer so it remains readable.';
      markInvalid($('#product-benefits'));
      valid = false;
    }
    if (!templates.length) {
      elements.directionError.textContent = 'Select at least one creative concept.';
      markInvalid($('input[name="templates"]'));
      valid = false;
    }
    if (!$('#rights-confirmation').checked) {
      elements.directionError.textContent = 'Confirm image rights and claim accuracy before generating.';
      markInvalid($('#rights-confirmation'));
      valid = false;
    }

    if (!valid) {
      const firstInvalid = $('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus({ preventScroll: false });
      else $('.field-error:not(:empty)')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }

    return {
      productName: productName.value.trim(),
      category: category.value.trim(),
      audience: $('#target-audience').value.trim(),
      marketplace: $('#marketplace').value,
      benefits: benefits.slice(0, 3),
      headline: $('#creative-headline').value.trim() || productName.value.trim(),
      subheadline: $('#creative-subheadline').value.trim() || benefits[0] || '',
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

  function readFileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function estimateDataUrlBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    return Math.ceil(base64.length * .75);
  }

  async function compressImage(file) {
    const image = await loadFileImage(file);
    if (image.naturalWidth < 512 || image.naturalHeight < 512) {
      throw new Error(`${file.name} must be at least 512 × 512 pixels.`);
    }
    if (image.naturalWidth * image.naturalHeight > 40_000_000) {
      throw new Error(`${file.name} has too many pixels. Resize it below 40 megapixels.`);
    }
    if (file.size <= MAX_OPTIMIZED_IMAGE_BYTES) return readFileDataUrl(file);

    const canvas = document.createElement('canvas');
    const preserveAlpha = file.type === 'image/png' || file.type === 'image/webp';
    const context = canvas.getContext('2d', { alpha: preserveAlpha });
    const outputType = preserveAlpha ? 'image/webp' : 'image/jpeg';
    let edge = 1800;
    let quality = .92;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      if (preserveAlpha) context.clearRect(0, 0, width, height);
      else {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);

      const result = canvas.toDataURL(outputType, quality);
      if (estimateDataUrlBytes(result) <= MAX_OPTIMIZED_IMAGE_BYTES) return result;

      if (quality > .68) quality -= .08;
      else {
        edge = Math.max(960, Math.round(edge * .84));
        quality = .84;
      }
    }

    throw new Error(`${file.name} could not be optimized safely. Use a simpler or smaller photo.`);
  }

  function setProgress(percent, title, message) {
    const bounded = Math.max(0, Math.min(100, Math.round(percent)));
    elements.progressBar.style.width = `${Math.max(4, bounded)}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(bounded));
    elements.progressTitle.textContent = title;
    elements.progressMessage.textContent = message;
  }

  function setRunStatus(status) {
    const labels = {
      draft: 'Draft',
      generating: 'Generating',
      complete: 'Complete',
      failed: 'Needs attention'
    };
    state.runStatus = status;
    elements.projectStatus.textContent = labels[status] || labels.draft;
    elements.projectStatus.classList.toggle('is-generating', status === 'generating');
    elements.projectStatus.classList.toggle('is-error', status === 'failed');
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.generateButton.disabled = busy;
    if (busy) setRunStatus('generating');
    elements.progress.hidden = !busy && state.runStatus !== 'failed';
    elements.form.querySelectorAll('input, textarea, select, button').forEach((control) => {
      if (control !== elements.generateButton) control.disabled = busy;
    });
  }

  async function requestProductPreparation(image, token) {
    const response = await fetch('/api/prepare-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ image })
    });

    let body;
    try { body = await response.json(); }
    catch { body = {}; }

    if (!response.ok) {
      const error = new Error(body.error || 'Product cutout preparation failed.');
      error.code = body.code;
      error.status = response.status;
      throw error;
    }
    if (!body.cutout) throw new Error('The product preparation service returned no cutout.');
    return body;
  }

  function requestCutoutApproval(source) {
    elements.cutoutPreviewImage.src = source;
    elements.cutoutReview.hidden = false;

    return new Promise((resolve, reject) => {
      const finish = (approved) => {
        elements.approveCutout.removeEventListener('click', approve);
        elements.rejectCutout.removeEventListener('click', decline);
        elements.cutoutReview.hidden = true;
        if (approved) {
          resolve();
          return;
        }
        const error = new Error('Choose a different primary product photo, then generate again.');
        error.code = 'CUTOUT_REJECTED_BY_USER';
        reject(error);
      };
      const approve = () => finish(true);
      const decline = () => finish(false);
      elements.approveCutout.addEventListener('click', approve);
      elements.rejectCutout.addEventListener('click', decline);
      elements.approveCutout.focus();
    });
  }

  async function requestGeneration(payload, template, token) {
    const response = await fetch('/api/generate-infographic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...payload,
        template
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
    if (!body.background) throw new Error('The generation service returned no background.');
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

  function layoutTextLines(context, text, maxWidth) {
    let remaining = String(text).replace(/\s+/g, ' ').trim();
    const lines = [];
    while (remaining) {
      if (context.measureText(remaining).width <= maxWidth) {
        lines.push(remaining);
        break;
      }

      let end = remaining.length;
      while (end > 1 && context.measureText(remaining.slice(0, end)).width > maxWidth) end -= 1;
      const wordBoundary = remaining.lastIndexOf(' ', end);
      if (wordBoundary > 0) end = wordBoundary;
      const line = remaining.slice(0, end).trim();
      if (!line) throw new Error('Copy contains a word that is too long for the selected layout.');
      lines.push(line);
      remaining = remaining.slice(end).trim();
    }
    return lines;
  }

  function drawFittedWrappedText(context, text, options) {
    const {
      x,
      y,
      maxWidth,
      maxLines,
      initialSize,
      minimumSize,
      weight,
      lineHeightRatio = 1.14
    } = options;
    let lines = [];
    let fontSize = initialSize;

    for (; fontSize >= minimumSize; fontSize -= 1) {
      context.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;
      lines = layoutTextLines(context, text, maxWidth);
      if (lines.length <= maxLines) break;
    }
    if (lines.length > maxLines) {
      const error = new Error('Shorten the headline or supporting line for the selected canvas format.');
      error.code = 'COPY_TOO_LONG';
      throw error;
    }

    const lineHeight = fontSize * lineHeightRatio;
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    return y + lines.length * lineHeight;
  }

  function drawFittedSingleLine(context, text, x, y, maxWidth, weight, initialSize, minimumSize) {
    const copy = String(text).replace(/\s+/g, ' ').trim();
    let fontSize = initialSize;
    for (; fontSize >= minimumSize; fontSize -= .5) {
      context.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;
      if (context.measureText(copy).width <= maxWidth) {
        context.fillText(copy, x, y);
        return;
      }
    }
    const error = new Error('Shorten the category or benefit copy so it remains readable.');
    error.code = 'COPY_TOO_LONG';
    throw error;
  }

  function drawBenefitPills(context, benefits, x, y, maxWidth, scale, dark = true) {
    let currentY = y;
    benefits.slice(0, 3).forEach((benefit) => {
      const height = 58 * scale;
      roundRect(context, x, currentY, maxWidth, height, 29 * scale);
      context.fillStyle = dark ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.88)';
      context.fill();
      context.fillStyle = dark ? '#ffffff' : '#20213f';
      drawFittedSingleLine(
        context,
        `✓  ${benefit}`,
        x + 16 * scale,
        currentY + 37 * scale,
        maxWidth - 32 * scale,
        700,
        18 * scale,
        10 * scale
      );
      currentY += height + 12 * scale;
    });
  }

  function canvasSizeFor(payload, template) {
    const format = template === 'marketplace-main' ? 'square' : payload.canvasFormat;
    return { ...FINAL_SIZES[format], format };
  }

  function drawCover(context, image, width, height) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;

    if (imageRatio > targetRatio) {
      sourceWidth = sourceHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = sourceWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height
    );
  }

  function productPlacement(template) {
    const placements = {
      'feature-spotlight': { centerX: .77, centerY: .54, maxWidth: .38, maxHeight: .74 },
      'benefit-stack': { centerX: .5, centerY: .33, maxWidth: .46, maxHeight: .53 },
      'lifestyle-story': { centerX: .77, centerY: .56, maxWidth: .38, maxHeight: .72 },
      'marketplace-main': { centerX: .5, centerY: .5, maxWidth: .88, maxHeight: .88 }
    };
    return placements[template] || placements['feature-spotlight'];
  }

  function validateProductResolution(product, payload) {
    for (const template of payload.templates) {
      const placement = productPlacement(template);
      const dimensions = canvasSizeFor(payload, template);
      const requiredScale = Math.min(
        (dimensions.width * placement.maxWidth) / product.naturalWidth,
        (dimensions.height * placement.maxHeight) / product.naturalHeight
      );
      const maximumUpscale = template === 'marketplace-main' ? 1.25 : 1.5;
      if (requiredScale > maximumUpscale) {
        const error = new Error(`The isolated product is too small for a sharp ${TEMPLATE_LABELS[template]} image. Upload a closer photo at 1500px or larger.`);
        error.code = 'PRODUCT_RESOLUTION_LOW';
        throw error;
      }
    }
  }

  function drawProductCutout(context, product, template, width, height) {
    const placement = productPlacement(template);
    const desiredScale = Math.min(
      (width * placement.maxWidth) / product.naturalWidth,
      (height * placement.maxHeight) / product.naturalHeight
    );
    const isMarketplaceMain = template === 'marketplace-main';
    const scale = isMarketplaceMain ? desiredScale : Math.min(desiredScale, 1.5);
    const drawWidth = product.naturalWidth * scale;
    const drawHeight = product.naturalHeight * scale;
    const x = width * placement.centerX - drawWidth / 2;
    const y = height * placement.centerY - drawHeight / 2;

    if (isMarketplaceMain) {
      context.drawImage(product, x, y, drawWidth, drawHeight);
      return;
    }

    context.save();
    context.filter = `blur(${Math.max(10, Math.round(width * .009))}px)`;
    context.fillStyle = 'rgba(10,12,25,.2)';
    context.beginPath();
    context.ellipse(
      x + drawWidth / 2,
      y + drawHeight * .965,
      drawWidth * .34,
      Math.max(10, drawHeight * .025),
      0,
      0,
      Math.PI * 2
    );
    context.fill();
    context.restore();

    context.save();
    context.shadowColor = 'rgba(10,12,25,.2)';
    context.shadowBlur = Math.max(14, width * .016);
    context.shadowOffsetY = Math.max(8, height * .008);
    context.drawImage(product, x, y, drawWidth, drawHeight);
    context.restore();
  }

  function drawTemplateBase(context, template, width, height, scale) {
    if (template === 'feature-spotlight') {
      const gradient = context.createLinearGradient(0, 0, width * .72, 0);
      gradient.addColorStop(0, 'rgba(12,13,38,.94)');
      gradient.addColorStop(.58, 'rgba(12,13,38,.76)');
      gradient.addColorStop(1, 'rgba(12,13,38,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width * .76, height);
    }

    if (template === 'benefit-stack') {
      const gradient = context.createLinearGradient(0, height * .34, 0, height);
      gradient.addColorStop(0, 'rgba(10,11,30,0)');
      gradient.addColorStop(.55, 'rgba(10,11,30,.62)');
      gradient.addColorStop(1, 'rgba(10,11,30,.95)');
      context.fillStyle = gradient;
      context.fillRect(0, height * .27, width, height * .73);
    }

    if (template === 'lifestyle-story') {
      const panelX = 58 * scale;
      const panelY = 60 * scale;
      const panelWidth = width * .43;
      const panelHeight = Math.min(height * .72, 660 * scale);
      roundRect(context, panelX, panelY, panelWidth, panelHeight, 22 * scale);
      context.fillStyle = 'rgba(255,255,255,.92)';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.65)';
      context.lineWidth = 2 * scale;
      context.stroke();
    }
  }

  function drawTemplateCopy(context, payload, template, width, height, scale) {
    const accent = payload.brandColor;

    if (template === 'feature-spotlight') {
      context.fillStyle = accent;
      roundRect(context, 72 * scale, 78 * scale, 164 * scale, 35 * scale, 18 * scale);
      context.fill();
      context.fillStyle = '#fff';
      context.font = `800 ${12 * scale}px Inter, Arial, sans-serif`;
      context.fillText('FEATURE SPOTLIGHT', 88 * scale, 101 * scale);

      context.fillStyle = '#fff';
      const copyEnd = drawFittedWrappedText(context, payload.headline, {
        x: 72 * scale,
        y: 190 * scale,
        maxWidth: width * .42,
        maxLines: 3,
        initialSize: 56 * scale,
        minimumSize: 34 * scale,
        weight: 800
      });
      context.fillStyle = 'rgba(255,255,255,.82)';
      drawFittedWrappedText(context, payload.subheadline, {
        x: 74 * scale,
        y: copyEnd + 22 * scale,
        maxWidth: width * .39,
        maxLines: 3,
        initialSize: 21 * scale,
        minimumSize: 14 * scale,
        weight: 500,
        lineHeightRatio: 1.35
      });
      const pillBlockHeight = (payload.benefits.length * 58 + Math.max(0, payload.benefits.length - 1) * 12) * scale;
      drawBenefitPills(
        context,
        payload.benefits,
        72 * scale,
        height - pillBlockHeight - 48 * scale,
        width * .39,
        scale,
        true
      );
    }

    if (template === 'benefit-stack') {
      context.fillStyle = rgba(accent, .95);
      context.fillRect(66 * scale, height - 290 * scale, 8 * scale, 188 * scale);
      context.fillStyle = '#fff';
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: 96 * scale,
        y: height - 250 * scale,
        maxWidth: width * .45,
        maxLines: 2,
        initialSize: 46 * scale,
        minimumSize: 30 * scale,
        weight: 800
      });
      context.fillStyle = 'rgba(255,255,255,.82)';
      drawFittedWrappedText(context, payload.subheadline, {
        x: 96 * scale,
        y: headlineEnd + 12 * scale,
        maxWidth: width * .43,
        maxLines: 2,
        initialSize: 17 * scale,
        minimumSize: 12 * scale,
        weight: 500,
        lineHeightRatio: 1.3
      });
      drawBenefitPills(context, payload.benefits, width * .57, height - 245 * scale, width * .36, scale, true);
    }

    if (template === 'lifestyle-story') {
      const panelX = 58 * scale;
      const panelY = 60 * scale;
      const panelWidth = width * .43;
      context.fillStyle = accent;
      drawFittedSingleLine(
        context,
        payload.category.toUpperCase(),
        panelX + 35 * scale,
        panelY + 50 * scale,
        panelWidth - 70 * scale,
        800,
        13 * scale,
        9 * scale
      );
      context.fillStyle = '#171838';
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: panelX + 35 * scale,
        y: panelY + 112 * scale,
        maxWidth: panelWidth - 70 * scale,
        maxLines: 3,
        initialSize: 43 * scale,
        minimumSize: 28 * scale,
        weight: 800
      });
      context.fillStyle = '#686b7e';
      const supportingEnd = drawFittedWrappedText(context, payload.subheadline, {
        x: panelX + 35 * scale,
        y: headlineEnd + 18 * scale,
        maxWidth: panelWidth - 70 * scale,
        maxLines: 3,
        initialSize: 18 * scale,
        minimumSize: 12 * scale,
        weight: 500,
        lineHeightRatio: 1.35
      });
      drawBenefitPills(
        context,
        payload.benefits,
        panelX + 35 * scale,
        supportingEnd + 18 * scale,
        panelWidth - 70 * scale,
        scale,
        false
      );
    }
  }

  function validateCopyLayout(payload) {
    payload.templates
      .filter((template) => template !== 'marketplace-main')
      .forEach((template) => {
        const dimensions = canvasSizeFor(payload, template);
        const canvas = document.createElement('canvas');
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const context = canvas.getContext('2d');
        const scale = Math.max(.8, Math.min(1.35, canvas.width / 1536));
        drawTemplateCopy(context, payload, template, canvas.width, canvas.height, scale);
      });
  }

  async function composeInfographic(backgroundSource, product, payload, template) {
    await document.fonts?.ready;
    const dimensions = canvasSizeFor(payload, template);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (backgroundSource) {
      const background = await loadDataImage(backgroundSource);
      drawCover(context, background, canvas.width, canvas.height);
    }

    const scale = Math.max(.8, Math.min(1.35, canvas.width / 1536));
    drawTemplateBase(context, template, canvas.width, canvas.height, scale);
    drawProductCutout(context, product, template, canvas.width, canvas.height);
    if (template !== 'marketplace-main') {
      drawTemplateCopy(context, payload, template, canvas.width, canvas.height, scale);
    }

    return {
      image: canvas.toDataURL('image/jpeg', .95),
      width: canvas.width,
      height: canvas.height,
      format: dimensions.format
    };
  }

  function resultRatio(format) {
    if (format === 'square') return '1 / 1';
    if (format === 'portrait') return '2 / 3';
    return '3 / 2';
  }

  function runSignature(payload, primaryFileId) {
    const { templates, ...creativeBrief } = payload;
    return JSON.stringify({ primaryFileId, creativeBrief });
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
      meta.textContent = `${result.width}×${result.height} · JPG`;
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

    try {
      await document.fonts?.ready;
      validateCopyLayout(payload);
    } catch (error) {
      elements.briefError.textContent = error.message || 'Shorten the infographic copy for the selected layout.';
      elements.briefError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const primaryFile = state.files[0];
    const signature = runSignature(payload, primaryFile.id);
    const canResume = (
      state.runStatus === 'failed' &&
      state.lastRun?.signature === signature
    );
    const previousResults = canResume ? state.lastRun.previousResults : state.results.slice(0, 6);
    const generated = canResume
      ? state.lastRun.results.filter((result) => payload.templates.includes(result.template))
      : [];
    state.lastRun = { signature, results: generated, previousResults };
    state.results = [...generated, ...previousResults].slice(0, 6);
    renderResults();
    elements.cutoutReview.hidden = true;
    setBusy(true);
    updateWorkflow(4);
    setProgress(7, 'Preparing your product references…', 'Compressing uploads securely in your browser.');
    elements.progress.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      setProgress(10, 'Preparing the locked product layer…', 'Optimizing the selected primary product photo.');
      const primaryImage = await compressImage(primaryFile.file);
      const token = await state.currentUser.getIdToken(true);

      let prepared = state.preparedProduct;
      if (!prepared || prepared.fileId !== primaryFile.id) {
        setProgress(
          17,
          'Removing the background…',
          'Creating a transparent cutout while preserving the original label and packaging.'
        );
        const response = await requestProductPreparation(primaryImage, token);
        prepared = {
          fileId: primaryFile.id,
          cutout: response.cutout,
          provider: response.provider,
          requestId: response.requestId,
          width: response.width,
          height: response.height,
          approved: false
        };
        state.preparedProduct = prepared;
      }

      const productImage = await loadDataImage(prepared.cutout);
      validateProductResolution(productImage, payload);
      if (!prepared.approved) {
        setProgress(23, 'Review the product cutout', 'Paid background generation will begin only after you approve this product layer.');
        await requestCutoutApproval(prepared.cutout);
        prepared.approved = true;
      }

      setProgress(26, 'Product layer locked', 'The non-generative product cutout is ready for 2K composition.');
      for (let index = 0; index < payload.templates.length; index += 1) {
        const template = payload.templates[index];
        if (generated.some((result) => result.template === template)) continue;
        const conceptPayload = template === 'marketplace-main'
          ? { ...payload, canvasFormat: 'square' }
          : payload;
        const start = 30 + (index / payload.templates.length) * 62;
        let background = null;
        let requestId = `${prepared.requestId || Date.now()}-${template}`;

        if (template === 'marketplace-main') {
          setProgress(start, 'Composing Marketplace Main…', 'Placing the original product on a compliant pure-white canvas.');
        } else {
          setProgress(
            start,
            `Creating ${TEMPLATE_LABELS[template]} background…`,
            'Generating a product-free 2K scene. High-quality output can take a few minutes.'
          );
          const response = await requestGeneration(conceptPayload, template, token);
          background = response.background;
          requestId = response.requestId || requestId;
        }

        setProgress(
          start + 15,
          'Compositing the original product…',
          template === 'marketplace-main'
            ? 'Placing the locked product layer on a shadow-free pure-white canvas.'
            : 'Adding the locked product layer, natural shadow, and approved copy.'
        );
        const composition = await composeInfographic(
          background,
          productImage,
          conceptPayload,
          template
        );
        const result = {
          id: requestId,
          image: composition.image,
          template,
          productName: payload.productName,
          canvasFormat: composition.format,
          width: composition.width,
          height: composition.height
        };
        generated.push(result);
        state.lastRun.results = [...generated];
        state.results = [...generated, ...previousResults].slice(0, 6);
        renderResults();
        incrementLocalGenerationCount(1);
      }

      setProgress(100, 'Creative set complete', 'Your finished images are ready to review and download.');
      state.results = [...generated];
      state.lastRun.results = [...generated];
      renderResults();
      setRunStatus('complete');
      showToast(`${generated.length} creative${generated.length === 1 ? '' : 's'} generated successfully.`);
      elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Generation failed:', error.code || error.status || error.message);
      if (error.code === 'CUTOUT_REJECTED_BY_USER') state.preparedProduct = null;
      const friendly = error.code === 'SERVICE_NOT_CONFIGURED'
        ? 'Generation is not configured yet. Add the required environment variables in Vercel and redeploy.'
        : error.code === 'CUTOUT_SERVICE_NOT_CONFIGURED'
          ? 'Product background removal is not configured yet. Add PHOTOROOM_API_KEY in Vercel and redeploy.'
        : error.code === 'DAILY_LIMIT_REACHED'
          ? 'Your daily generation limit has been reached.'
          : error.code === 'DAILY_PREPARATION_LIMIT_REACHED'
            ? 'Your daily product preparation limit has been reached.'
          : error.code === 'GLOBAL_DAILY_LIMIT_REACHED'
            ? 'The image service has reached today’s protected spending limit. Please try again tomorrow.'
          : error.code === 'EMAIL_VERIFICATION_REQUIRED'
            ? 'Verify your email address, then sign in again before generating.'
          : error.code === 'GENERATION_ACCESS_REQUIRED'
            ? 'Your account needs an active image-generation entitlement.'
          : error.code === 'PRODUCT_RESOLUTION_LOW'
            ? error.message
          : error.message || 'Generation failed. Please try again.';
      const message = generated.length
        ? `${generated.length} creative${generated.length === 1 ? '' : 's'} completed. The next concept stopped: ${friendly}`
        : friendly;
      showToast(message, 'error');
      setProgress(4, 'Generation stopped', message);
      setRunStatus('failed');
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
