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
  const FIXED_TEMPLATE_FORMATS = {
    'marketplace-main': 'square',
    'a-plus-claim-hero': 'landscape',
    'comparison-chart': 'landscape',
    'problem-solution': 'landscape',
    'feature-collage': 'landscape'
  };
  const TEMPLATE_LABELS = {
    'feature-spotlight': 'Feature Spotlight',
    'benefit-stack': 'Benefit Stack',
    'lifestyle-story': 'Lifestyle Story',
    'a-plus-claim-hero': 'A+ Claim Hero',
    'comparison-chart': 'Comparison Guide',
    'usage-timeline': '3-Step Usage Guide',
    'problem-solution': 'Problem / Solution',
    'detail-callouts': 'Detail Callouts',
    'performance-action': 'Performance Action',
    'feature-collage': 'Feature Collage',
    'marketplace-main': 'Marketplace Main'
  };
  const VARIANT_TYPE_LABELS = {
    color: 'Color',
    size: 'Size',
    shape: 'Shape'
  };
  const MAX_VARIANT_JOBS = 3;

  const state = {
    files: [],
    results: [],
    busy: false,
    currentUser: null,
    preparedProduct: null,
    variantJobs: [],
    variantLayers: new Map(),
    rawVariantEdits: new Map(),
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
    outputModeInputs: $$('input[name="outputMode"]'),
    creativeOptions: $('#creative-options'),
    variantOptions: $('#variant-options'),
    variantJobs: $('#variant-jobs'),
    variantCount: $('#variant-count'),
    variantError: $('#variant-error'),
    addVariantJob: $('#add-variant-job'),
    variantEditAck: $('#variant-fidelity-ack'),
    comparisonFields: $('#comparison-fields'),
    comparisonTarget: $('#comparison-target'),
    comparisonPoints: $('#comparison-points'),
    comparisonAck: $('#comparison-ack'),
    usageFields: $('#usage-fields'),
    usageSteps: $('#usage-steps'),
    usageAck: $('#usage-ack'),
    problemSolutionFields: $('#problem-solution-fields'),
    problemCopy: $('#problem-copy'),
    solutionCopy: $('#solution-copy'),
    problemSolutionAck: $('#problem-solution-ack'),
    featureCollageHelp: $('#feature-collage-help'),
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
    variantReview: $('#variant-review'),
    variantPreviewImage: $('#variant-preview-image'),
    approveVariant: $('#approve-variant-btn'),
    rejectVariant: $('#reject-variant-btn'),
    openVariantPreview: $('#open-variant-preview-btn'),
    openOriginalPreview: $('#open-original-preview-btn'),
    privacyNote: $('#generation-privacy-note'),
    projectStatus: $('#project-status'),
    generatorTitle: $('#generator-title'),
    directionTitle: $('#direction-title'),
    directionDescription: $('#direction-title + p'),
    resultsSection: $('#results-section'),
    resultsTitle: $('#results-title'),
    resultsEmptyCopy: $('#results-empty-copy'),
    exportSizeNote: $('#export-size-note'),
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

  function clearVariantLayers() {
    state.variantLayers.clear();
    state.rawVariantEdits.clear();
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
    if (primaryIdBefore !== state.files[0]?.id) {
      state.preparedProduct = null;
      clearVariantLayers();
    }
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
        clearVariantLayers();
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
        if (removedPrimary) {
          state.preparedProduct = null;
          clearVariantLayers();
        }
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

  function currentOutputMode() {
    return $('input[name="outputMode"]:checked')?.value === 'variant' ? 'variant' : 'creative';
  }

  function selectedVariantType() {
    return $('input[name="variantType"]:checked')?.value || 'color';
  }

  function normalizeUserText(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function variantPlaceholder(type) {
    if (type === 'size') return 'e.g. Create the 500 mL size with a taller body; preserve the cap and label.';
    if (type === 'shape') return 'e.g. Use a rounded-square container profile; keep the same closure and label.';
    return 'e.g. Change only the container body to deep navy blue; preserve the cap and label.';
  }

  function syncVariantJobsFromDom() {
    if (!elements.variantJobs) return;
    state.variantJobs = $$('.variant-job', elements.variantJobs).map((row) => ({
      id: row.dataset.jobId,
      label: $('.variant-label', row)?.value || '',
      instruction: $('.variant-instruction', row)?.value || '',
      color: $('.variant-color', row)?.value || '#1D4ED8',
      target: $('.variant-target', row)?.value || 'container body'
    }));
  }

  function variantDefaultLabel(type, index) {
    return `${VARIANT_TYPE_LABELS[type] || 'Product'} variant ${index + 1}`;
  }

  function addVariantJob(initial = {}) {
    if (state.variantJobs.length >= MAX_VARIANT_JOBS) return;
    const type = selectedVariantType();
    state.variantJobs.push({
      id: initial.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      label: initial.label || variantDefaultLabel(type, state.variantJobs.length),
      instruction: initial.instruction || '',
      color: initial.color || '#1D4ED8',
      target: initial.target || 'container body'
    });
    renderVariantJobs();
  }

  function applyColorHelper(row) {
    const target = $('.variant-target', row)?.value || 'container body';
    const color = $('.variant-color', row)?.value?.toUpperCase() || '#1D4ED8';
    const instruction = $('.variant-instruction', row);
    if (!instruction) return;
    instruction.value = `Change only the ${target} to ${color}. Preserve the exact label, logo, text, finish, viewpoint, and every other product attribute.`;
    instruction.focus();
  }

  function renderVariantJobs() {
    if (!elements.variantJobs) return;
    const type = selectedVariantType();
    elements.variantJobs.innerHTML = state.variantJobs.map((job, index) => `
      <article class="variant-job" data-job-id="${escapeHtml(job.id)}">
        <header class="variant-job-heading">
          <div><strong>${escapeHtml(VARIANT_TYPE_LABELS[type])} option ${index + 1}</strong><small>One paid controlled edit</small></div>
          ${state.variantJobs.length > 1 ? `<button class="remove-variant-job" type="button" aria-label="Remove ${escapeHtml(job.label || `variant ${index + 1}`)}">Remove</button>` : ''}
        </header>
        <div class="variant-job-grid">
          <label class="variant-job-field">
            <span>Variant label <b>*</b></span>
            <input class="variant-label" type="text" maxlength="40" value="${escapeHtml(job.label)}" placeholder="e.g. Slate Blue">
          </label>
          <div class="variant-color-helper" ${type === 'color' ? '' : 'hidden'}>
            <label class="variant-job-field">
              <span>Color target</span>
              <select class="variant-target">
                <option value="container body" ${job.target === 'container body' ? 'selected' : ''}>Body / container</option>
                <option value="cap or closure" ${job.target === 'cap or closure' ? 'selected' : ''}>Cap / closure</option>
                <option value="outer package surface" ${job.target === 'outer package surface' ? 'selected' : ''}>Outer package</option>
              </select>
            </label>
            <label class="variant-job-field color-field">
              <span>Color swatch</span>
              <span class="color-control"><input class="variant-color" type="color" value="${escapeHtml(job.color || '#1D4ED8')}"><output>${escapeHtml(String(job.color || '#1D4ED8').toUpperCase())}</output></span>
            </label>
            <button class="apply-variant-color" type="button">Use swatch</button>
          </div>
          <label class="variant-job-field variant-instruction-field">
            <span>Exact controlled change <b>*</b> <small>3–300 characters</small></span>
            <textarea class="variant-instruction" rows="3" maxlength="300" placeholder="${escapeHtml(variantPlaceholder(type))}">${escapeHtml(job.instruction)}</textarea>
          </label>
        </div>
      </article>
    `).join('');

    $$('.variant-label, .variant-instruction', elements.variantJobs).forEach((input) => {
      input.addEventListener('input', syncVariantJobsFromDom);
    });
    $$('.variant-color', elements.variantJobs).forEach((input) => {
      input.addEventListener('input', () => {
        const output = input.closest('.color-control')?.querySelector('output');
        if (output) output.textContent = input.value.toUpperCase();
        syncVariantJobsFromDom();
      });
    });
    $$('.variant-target', elements.variantJobs).forEach((input) => {
      input.addEventListener('change', syncVariantJobsFromDom);
    });
    $$('.apply-variant-color', elements.variantJobs).forEach((button) => {
      button.addEventListener('click', () => {
        applyColorHelper(button.closest('.variant-job'));
        syncVariantJobsFromDom();
      });
    });
    $$('.remove-variant-job', elements.variantJobs).forEach((button) => {
      button.addEventListener('click', () => {
        syncVariantJobsFromDom();
        const id = button.closest('.variant-job')?.dataset.jobId;
        state.variantJobs = state.variantJobs.filter((job) => job.id !== id);
        renderVariantJobs();
      });
    });
    if (elements.variantCount) {
      elements.variantCount.textContent = `${state.variantJobs.length} of ${MAX_VARIANT_JOBS} variants`;
    }
    if (elements.addVariantJob) elements.addVariantJob.disabled = state.variantJobs.length >= MAX_VARIANT_JOBS;
  }

  function updateCreativeFieldVisibility() {
    const templates = selectedTemplates();
    const comparisonActive = currentOutputMode() === 'creative' && templates.includes('comparison-chart');
    const usageActive = currentOutputMode() === 'creative' && templates.includes('usage-timeline');
    const problemSolutionActive = currentOutputMode() === 'creative' && templates.includes('problem-solution');
    const featureCollageActive = currentOutputMode() === 'creative' && templates.includes('feature-collage');
    if (elements.comparisonFields) elements.comparisonFields.hidden = !comparisonActive;
    if (elements.usageFields) elements.usageFields.hidden = !usageActive;
    if (elements.problemSolutionFields) elements.problemSolutionFields.hidden = !problemSolutionActive;
    if (elements.featureCollageHelp) elements.featureCollageHelp.hidden = !featureCollageActive;
    if (elements.comparisonTarget) elements.comparisonTarget.disabled = !comparisonActive;
    if (elements.comparisonPoints) elements.comparisonPoints.disabled = !comparisonActive;
    if (elements.comparisonAck) elements.comparisonAck.disabled = !comparisonActive;
    if (elements.usageSteps) elements.usageSteps.disabled = !usageActive;
    if (elements.usageAck) elements.usageAck.disabled = !usageActive;
    if (elements.problemCopy) elements.problemCopy.disabled = !problemSolutionActive;
    if (elements.solutionCopy) elements.solutionCopy.disabled = !problemSolutionActive;
    if (elements.problemSolutionAck) elements.problemSolutionAck.disabled = !problemSolutionActive;
    [elements.problemCopy, elements.solutionCopy, elements.problemSolutionAck]
      .filter(Boolean)
      .forEach((control) => {
        control.required = problemSolutionActive;
        control.setAttribute('aria-required', String(problemSolutionActive));
      });
  }

  function updateOutputMode() {
    const variantMode = currentOutputMode() === 'variant';
    if (elements.creativeOptions) elements.creativeOptions.hidden = variantMode;
    if (elements.variantOptions) elements.variantOptions.hidden = !variantMode;
    elements.creativeOptions?.querySelectorAll('input, textarea, select, button').forEach((control) => {
      control.disabled = variantMode;
    });
    elements.variantOptions?.querySelectorAll('input, textarea, select, button').forEach((control) => {
      control.disabled = !variantMode;
    });
    if (elements.addVariantJob) {
      elements.addVariantJob.disabled = !variantMode || state.variantJobs.length >= MAX_VARIANT_JOBS;
    }
    elements.generateButton.lastChild.textContent = variantMode ? ' Generate variants' : ' Generate creatives';
    if (elements.privacyNote) {
      elements.privacyNote.textContent = variantMode
        ? 'Your approved cutout is sent to OpenAI for the requested Color, Size, or Shape edit. The edited image is then sent to PhotoRoom for clean isolation. The original stays unchanged; every result requires visual verification. Images are not stored by this app.'
        : 'Opaque primary photos are sent to PhotoRoom for background removal; transparent uploads bypass it. AI receives the brief only and creates a product-free scene. Images are not stored by this app.';
    }
    if (elements.generatorTitle) elements.generatorTitle.textContent = variantMode ? 'Build your product variant set' : 'Build your infographic set';
    if (elements.directionTitle) elements.directionTitle.textContent = variantMode ? 'Choose the product change' : 'Choose your creative direction';
    if (elements.directionDescription) {
      elements.directionDescription.textContent = variantMode
        ? 'Choose Color, Size, or Shape and create up to three separately reviewed variants.'
        : 'Select one to three concepts. Each concept is generated separately for better quality and control.';
    }
    if (elements.resultsTitle) elements.resultsTitle.textContent = 'Generated outputs';
    if (elements.exportSizeNote) {
      elements.exportSizeNote.textContent = variantMode ? 'Review 1600px variant cards' : 'Review 2000px infographic JPGs';
    }
    if (elements.resultsEmptyCopy) {
      elements.resultsEmptyCopy.textContent = variantMode
        ? 'Complete the brief above to create separately reviewed 1600px product-variant cards.'
        : 'Complete the brief above to create your first product-locked 2000px infographic set.';
    }
    updateTemplateCount();
  }

  function initializeOutputModes() {
    elements.outputModeInputs.forEach((input) => input.addEventListener('change', updateOutputMode));
    $$('input[name="variantType"]').forEach((input) => {
      input.addEventListener('change', () => {
        syncVariantJobsFromDom();
        const type = selectedVariantType();
        state.variantJobs = state.variantJobs.map((job, index) => ({
          ...job,
          label: variantDefaultLabel(type, index),
          instruction: ''
        }));
        renderVariantJobs();
        showToast(`Switched to ${VARIANT_TYPE_LABELS[type]} variants. Add a new type-specific instruction.`);
      });
    });
    elements.addVariantJob?.addEventListener('click', () => {
      syncVariantJobsFromDom();
      addVariantJob();
    });
    if (!state.variantJobs.length) addVariantJob();
    updateOutputMode();
  }

  function selectedTemplates() {
    return $$('input[name="templates"]:checked').map((input) => input.value);
  }

  function updateTemplateCount() {
    const count = selectedTemplates().length;
    elements.templateCount.textContent = `${count} of 3 concepts selected`;
    const infographicBriefRequired = currentOutputMode() === 'creative' && selectedTemplates().some((template) => template !== 'marketplace-main');
    $('#product-category').setAttribute('aria-required', String(infographicBriefRequired));
    $('#product-benefits').setAttribute('aria-required', String(infographicBriefRequired));
    updateCreativeFieldVisibility();
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
    [elements.uploadError, elements.briefError, elements.directionError, elements.variantError]
      .filter(Boolean)
      .forEach((element) => { element.textContent = ''; });
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

  function readLines(element) {
    return String(element?.value || '')
      .split(/\r?\n/)
      .map(normalizeUserText)
      .filter(Boolean);
  }

  function parseComparisonPoints(lines) {
    return lines.map((line) => {
      const parts = line.split('|').map(normalizeUserText);
      return { feature: parts[0] || '', ours: parts[1] || '', alternative: parts[2] || '', parts: parts.length };
    });
  }

  function parseUsageSteps(lines) {
    return lines.map((line) => {
      const parts = line.split('|').map(normalizeUserText);
      return { title: parts[0] || '', detail: parts[1] || '', parts: parts.length };
    });
  }

  function validateForm() {
    clearValidation();
    let valid = true;
    const productName = $('#product-name');
    const category = $('#product-category');
    const benefits = readBenefits();
    const mode = currentOutputMode();
    const templates = mode === 'creative' ? selectedTemplates() : [];
    const needsInfographicBrief = mode === 'creative' && templates.some((template) => template !== 'marketplace-main');
    const comparisonLines = readLines(elements.comparisonPoints);
    const comparisonPoints = parseComparisonPoints(comparisonLines);
    const comparisonTarget = normalizeUserText(elements.comparisonTarget?.value);
    const usageLines = readLines(elements.usageSteps);
    const usageSteps = parseUsageSteps(usageLines);
    const problemCopy = normalizeUserText(elements.problemCopy?.value);
    const solutionCopy = normalizeUserText(elements.solutionCopy?.value);
    syncVariantJobsFromDom();
    const variantJobs = state.variantJobs.map((job) => ({
      id: job.id,
      label: normalizeUserText(job.label),
      instruction: normalizeUserText(job.instruction),
      color: /^#[0-9a-f]{6}$/i.test(job.color) ? job.color.toUpperCase() : '#1D4ED8',
      target: normalizeUserText(job.target)
    }));

    if (!state.files.length) {
      elements.uploadError.textContent = 'Upload at least one clear product image.';
      valid = false;
    }
    if (!productName.value.trim()) {
      elements.briefError.textContent = mode === 'variant'
        ? 'Add the product name.'
        : 'Add the product name and at least one verified benefit.';
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
    if (needsInfographicBrief && benefits.length > 3) {
      elements.briefError.textContent = 'Use a maximum of three verified benefit lines.';
      markInvalid($('#product-benefits'));
      valid = false;
    } else if (needsInfographicBrief && benefits.some((benefit) => benefit.length > 60)) {
      elements.briefError.textContent = 'Keep each verified benefit to 60 characters or fewer so it remains readable.';
      markInvalid($('#product-benefits'));
      valid = false;
    }
    if (mode === 'creative' && !templates.length) {
      elements.directionError.textContent = 'Select at least one creative concept.';
      markInvalid($('input[name="templates"]'));
      valid = false;
    }
    if (mode === 'creative' && templates.includes('comparison-chart')) {
      const malformed = comparisonPoints.some((point) => (
        point.parts !== 3 || !point.feature || !point.ours || !point.alternative ||
        point.feature.length > 28 || point.ours.length > 40 || point.alternative.length > 40
      ));
      if (!comparisonTarget || comparisonTarget.length > 30) {
        elements.directionError.textContent = 'Name the exact comparison benchmark or owned SKU.';
        markInvalid(elements.comparisonTarget);
        valid = false;
      } else if (comparisonPoints.length < 2 || comparisonPoints.length > 3 || malformed) {
        elements.directionError.textContent = 'Add 2–3 comparison rows as Feature | This product | Alternative. Keep labels to 28 characters and values to 40.';
        markInvalid(elements.comparisonPoints);
        valid = false;
      } else if (!elements.comparisonAck?.checked) {
        elements.directionError.textContent = 'Confirm that every comparison value is accurate and substantiated.';
        markInvalid(elements.comparisonAck);
        valid = false;
      }
    }
    if (mode === 'creative' && templates.includes('usage-timeline')) {
      const malformed = usageSteps.some((step) => (
        step.parts !== 2 || !step.title || !step.detail || step.title.length > 24 || step.detail.length > 55
      ));
      if (usageSteps.length !== 3 || malformed) {
        elements.directionError.textContent = 'Add exactly 3 usage lines as Step title | short verified instruction.';
        markInvalid(elements.usageSteps);
        valid = false;
      } else if (!elements.usageAck?.checked) {
        elements.directionError.textContent = 'Confirm that every usage step matches the official product directions.';
        markInvalid(elements.usageAck);
        valid = false;
      }
    }
    if (mode === 'creative' && templates.includes('problem-solution')) {
      if (!problemCopy || !solutionCopy || problemCopy.length > 55 || solutionCopy.length > 55) {
        elements.directionError.textContent = 'Add both verified Problem and Solution states, each 55 characters or fewer.';
        markInvalid(!problemCopy || problemCopy.length > 55 ? elements.problemCopy : elements.solutionCopy);
        valid = false;
      } else if (!elements.problemSolutionAck?.checked) {
        elements.directionError.textContent = 'Confirm that both Problem and Solution statements are accurate and substantiated.';
        markInvalid(elements.problemSolutionAck);
        valid = false;
      }
    }
    if (mode === 'creative' && templates.includes('feature-collage') && benefits.length !== 3) {
      elements.directionError.textContent = 'Feature Collage requires exactly 3 verified benefits.';
      markInvalid($('#product-benefits'));
      valid = false;
    }
    if (mode === 'variant') {
      const duplicateLabels = new Set(variantJobs.map((job) => job.label.toLocaleLowerCase())).size !== variantJobs.length;
      const duplicateInstructions = new Set(variantJobs.map((job) => job.instruction.toLocaleLowerCase())).size !== variantJobs.length;
      const invalidJob = variantJobs.find((job) => (
        !job.label || job.label.length > 40 || job.instruction.length < 3 || job.instruction.length > 300 ||
        (selectedVariantType() === 'color' && (
          job.color === '#00FF00' ||
          !job.instruction.toUpperCase().includes(job.color) ||
          !job.instruction.toLocaleLowerCase().includes(job.target.toLocaleLowerCase())
        ))
      ));
      if (!variantJobs.length || variantJobs.length > MAX_VARIANT_JOBS || invalidJob || duplicateLabels || duplicateInstructions) {
        elements.variantError.textContent = duplicateLabels || duplicateInstructions
          ? 'Use a different label and edit instruction for each variant.'
          : selectedVariantType() === 'color' && invalidJob?.color === '#00FF00'
            ? 'Pure #00FF00 is reserved for background isolation. Choose a nearby sellable shade or upload the real green SKU photo.'
          : selectedVariantType() === 'color' && invalidJob?.instruction
            ? 'Use the color swatch button so the target, selected HEX color, and edit instruction match.'
            : 'Add 1–3 variants. Each needs a label and a precise 3–300 character change.';
        const invalidRow = invalidJob
          ? document.querySelector(`.variant-job[data-job-id="${CSS.escape(invalidJob.id)}"]`)
          : null;
        const invalidLabel = invalidJob && (!invalidJob.label || invalidJob.label.length > 40);
        const invalidControl = invalidLabel
          ? invalidRow?.querySelector('.variant-label')
          : invalidRow?.querySelector('.variant-instruction');
        markInvalid(
          invalidControl ||
          (duplicateLabels ? $('.variant-label', elements.variantJobs) : null) ||
          (duplicateInstructions ? $('.variant-instruction', elements.variantJobs) : null)
        );
        valid = false;
      }
      if (!elements.variantEditAck?.checked) {
        if (!elements.variantError.textContent) {
          elements.variantError.textContent = 'Confirm that you will verify every AI-edited variant against the real SKU.';
        }
        markInvalid(elements.variantEditAck);
        valid = false;
      }
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
      mode,
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
      templates,
      comparisonTarget,
      comparisonPoints,
      usageSteps,
      problemCopy,
      solutionCopy,
      variantType: mode === 'variant' ? selectedVariantType() : null,
      variantJobs: mode === 'variant' ? variantJobs : []
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

  async function compressDataImage(source) {
    if (estimateDataUrlBytes(source) <= MAX_OPTIMIZED_IMAGE_BYTES) return source;
    const image = await loadDataImage(source);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    let edge = Math.max(image.naturalWidth, image.naturalHeight);
    let quality = .9;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(512, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(512, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#00ff00';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/webp', quality);
      if (estimateDataUrlBytes(result) <= MAX_OPTIMIZED_IMAGE_BYTES) return result;
      if (quality > .66) quality -= .08;
      else edge = Math.max(720, Math.round(edge * .88));
    }
    throw new Error('The generated variant could not be prepared safely. Try the edit again.');
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

  function requestVariantApproval(source, label) {
    elements.variantPreviewImage.src = source;
    elements.variantPreviewImage.alt = `AI-generated ${label} variant for verification`;
    elements.variantReview.hidden = false;

    return new Promise((resolve, reject) => {
      const finish = (approved) => {
        elements.approveVariant.removeEventListener('click', approve);
        elements.rejectVariant.removeEventListener('click', decline);
        elements.variantReview.hidden = true;
        if (approved) {
          resolve();
          return;
        }
        const error = new Error(`The ${label} variant was rejected. Adjust its instruction and generate again.`);
        error.code = 'VARIANT_REJECTED_BY_USER';
        reject(error);
      };
      const approve = () => finish(true);
      const decline = () => finish(false);
      elements.approveVariant.addEventListener('click', approve);
      elements.rejectVariant.addEventListener('click', decline);
      elements.approveVariant.focus();
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

  async function requestVariantGeneration(cutout, preparationProof, variantType, instruction, token) {
    const response = await fetch('/api/generate-variant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ cutout, preparationProof, variantType, instruction })
    });

    let body;
    try { body = await response.json(); }
    catch { body = {}; }

    if (!response.ok) {
      const error = new Error(body.error || 'Variant generation failed.');
      error.code = body.code;
      error.status = response.status;
      throw error;
    }
    if (!body.variant) throw new Error('The variant service returned no image.');
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
    const format = FIXED_TEMPLATE_FORMATS[template] || payload.canvasFormat;
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
      'a-plus-claim-hero': { centerX: .77, centerY: .55, maxWidth: .38, maxHeight: .73 },
      'comparison-chart': { centerX: .8, centerY: .2, maxWidth: .27, maxHeight: .27 },
      'usage-timeline': { centerX: .22, centerY: .57, bottomY: .87, maxWidth: .3, maxHeight: .64 },
      'problem-solution': { centerX: .5, centerY: .65, bottomY: .92, maxWidth: .3, maxHeight: .56 },
      'detail-callouts': { centerX: .5, centerY: .57, bottomY: .9, maxWidth: .32, maxHeight: .6 },
      'performance-action': { centerX: .24, centerY: .66, bottomY: .91, maxWidth: .34, maxHeight: .56 },
      'feature-collage': { centerX: .27, centerY: .6, bottomY: .92, maxWidth: .38, maxHeight: .62 },
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

  function validateVariantResolution(product, label) {
    if (Math.max(product.naturalWidth, product.naturalHeight) < 800) {
      const error = new Error(`${label} is too small for a sharp ecommerce card. Refine the edit or upload a real high-resolution SKU photo.`);
      error.code = 'VARIANT_RESOLUTION_LOW';
      throw error;
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
    const y = placement.bottomY
      ? height * placement.bottomY - drawHeight
      : height * placement.centerY - drawHeight / 2;

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

    if (template === 'a-plus-claim-hero') {
      const gradient = context.createLinearGradient(0, 0, width * .72, 0);
      gradient.addColorStop(0, 'rgba(8,18,36,.96)');
      gradient.addColorStop(.63, 'rgba(8,18,36,.8)');
      gradient.addColorStop(1, 'rgba(8,18,36,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width * .78, height);
      context.fillStyle = 'rgba(255,255,255,.12)';
      context.fillRect(0, height * .76, width * .5, 1.5 * scale);
    }

    if (template === 'comparison-chart') {
      const panelX = width * .045;
      const panelY = height * .36;
      const panelWidth = width * .91;
      const panelHeight = height * .58;
      roundRect(context, panelX, panelY, panelWidth, panelHeight, 24 * scale);
      context.fillStyle = 'rgba(255,255,255,.95)';
      context.fill();
      context.strokeStyle = 'rgba(23,24,56,.12)';
      context.lineWidth = 2 * scale;
      context.stroke();
    }

    if (template === 'usage-timeline') {
      const panelX = width * .43;
      const panelY = height * .06;
      const panelWidth = width * .52;
      const panelHeight = height * .88;
      roundRect(context, panelX, panelY, panelWidth, panelHeight, 24 * scale);
      context.fillStyle = 'rgba(255,255,255,.94)';
      context.fill();
      context.strokeStyle = 'rgba(23,24,56,.1)';
      context.lineWidth = 2 * scale;
      context.stroke();
    }

    if (template === 'problem-solution') {
      const panelY = height * .2;
      const panelWidth = width * .31;
      const panelHeight = height * .25;
      [width * .045, width * .645].forEach((panelX, index) => {
        roundRect(context, panelX, panelY, panelWidth, panelHeight, 24 * scale);
        context.fillStyle = index === 0 ? 'rgba(48,25,38,.8)' : 'rgba(17,71,64,.82)';
        context.fill();
        context.strokeStyle = 'rgba(255,255,255,.25)';
        context.lineWidth = 2 * scale;
        context.stroke();
      });
      const surface = context.createLinearGradient(0, height * .68, 0, height);
      surface.addColorStop(0, 'rgba(13,16,35,0)');
      surface.addColorStop(1, 'rgba(13,16,35,.42)');
      context.fillStyle = surface;
      context.fillRect(0, height * .68, width, height * .32);
      context.strokeStyle = 'rgba(255,255,255,.34)';
      context.lineWidth = 2 * scale;
      context.beginPath();
      context.moveTo(width * .5, height * .21);
      context.lineTo(width * .5, height * .43);
      context.stroke();
    }

    if (template === 'detail-callouts') {
      const topWash = context.createLinearGradient(0, 0, 0, height * .28);
      topWash.addColorStop(0, 'rgba(255,255,255,.9)');
      topWash.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = topWash;
      context.fillRect(0, 0, width, height * .32);
      const halo = context.createRadialGradient(width * .5, height * .6, 0, width * .5, height * .6, width * .28);
      halo.addColorStop(0, 'rgba(255,255,255,.3)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = halo;
      context.fillRect(width * .25, height * .22, width * .5, height * .74);
    }

    if (template === 'performance-action') {
      const leftShade = context.createLinearGradient(0, 0, width * .62, 0);
      leftShade.addColorStop(0, 'rgba(9,13,34,.94)');
      leftShade.addColorStop(.66, 'rgba(9,13,34,.7)');
      leftShade.addColorStop(1, 'rgba(9,13,34,0)');
      context.fillStyle = leftShade;
      context.fillRect(0, 0, width * .66, height);
      const lowerShade = context.createLinearGradient(0, height * .72, 0, height);
      lowerShade.addColorStop(0, 'rgba(9,13,34,0)');
      lowerShade.addColorStop(1, 'rgba(9,13,34,.7)');
      context.fillStyle = lowerShade;
      context.fillRect(0, height * .7, width, height * .3);
      context.strokeStyle = 'rgba(255,255,255,.25)';
      context.lineWidth = 2 * scale;
      context.beginPath();
      context.moveTo(width * .57, height * .12);
      context.lineTo(width * .94, height * .12);
      context.stroke();
    }

    if (template === 'feature-collage') {
      const leftWash = context.createLinearGradient(0, 0, width * .54, 0);
      leftWash.addColorStop(0, 'rgba(8,18,36,.86)');
      leftWash.addColorStop(.78, 'rgba(8,18,36,.5)');
      leftWash.addColorStop(1, 'rgba(8,18,36,0)');
      context.fillStyle = leftWash;
      context.fillRect(0, 0, width * .56, height);
      const panelX = width * .56;
      const panelWidth = width * .39;
      const panelHeight = height * .205;
      [height * .13, height * .39, height * .65].forEach((panelY) => {
        roundRect(context, panelX, panelY, panelWidth, panelHeight, 22 * scale);
        context.fillStyle = 'rgba(255,255,255,.91)';
        context.fill();
        context.strokeStyle = 'rgba(23,24,56,.11)';
        context.lineWidth = 2 * scale;
        context.stroke();
      });
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

    if (template === 'a-plus-claim-hero') {
      context.fillStyle = accent;
      context.fillRect(72 * scale, 76 * scale, 72 * scale, 6 * scale);
      context.fillStyle = '#ffffff';
      context.font = `800 ${13 * scale}px Inter, Arial, sans-serif`;
      drawFittedSingleLine(context, payload.category.toUpperCase(), 72 * scale, 118 * scale, width * .4, 800, 13 * scale, 9 * scale);
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: 72 * scale,
        y: 200 * scale,
        maxWidth: width * .45,
        maxLines: 3,
        initialSize: 61 * scale,
        minimumSize: 34 * scale,
        weight: 850,
        lineHeightRatio: 1.04
      });
      context.fillStyle = 'rgba(255,255,255,.82)';
      const supportingEnd = drawFittedWrappedText(context, payload.subheadline, {
        x: 74 * scale,
        y: headlineEnd + 22 * scale,
        maxWidth: width * .41,
        maxLines: 3,
        initialSize: 22 * scale,
        minimumSize: 14 * scale,
        weight: 500,
        lineHeightRatio: 1.35
      });
      drawBenefitPills(
        context,
        payload.benefits,
        72 * scale,
        supportingEnd + 22 * scale,
        width * .4,
        scale,
        true
      );
    }

    if (template === 'comparison-chart') {
      context.fillStyle = '#171838';
      drawFittedWrappedText(context, payload.headline, {
        x: 60 * scale,
        y: 86 * scale,
        maxWidth: width * .34,
        maxLines: 2,
        initialSize: 39 * scale,
        minimumSize: 25 * scale,
        weight: 850
      });
      const panelX = width * .075;
      const panelY = height * .41;
      const panelWidth = width * .85;
      const rowHeight = height * .125;
      const featureWidth = panelWidth * .38;
      const valueWidth = (panelWidth - featureWidth) / 2;
      context.fillStyle = accent;
      roundRect(context, panelX, panelY, panelWidth, rowHeight * .72, 12 * scale);
      context.fill();
      context.fillStyle = '#ffffff';
      drawFittedSingleLine(context, 'VERIFIED FEATURE', panelX + 20 * scale, panelY + rowHeight * .46, featureWidth - 34 * scale, 800, 14 * scale, 9 * scale);
      drawFittedSingleLine(context, 'THIS PRODUCT', panelX + featureWidth + 18 * scale, panelY + rowHeight * .46, valueWidth - 30 * scale, 800, 14 * scale, 9 * scale);
      drawFittedSingleLine(context, payload.comparisonTarget.toUpperCase(), panelX + featureWidth + valueWidth + 18 * scale, panelY + rowHeight * .46, valueWidth - 30 * scale, 800, 14 * scale, 9 * scale);

      payload.comparisonPoints.forEach((point, index) => {
        const y = panelY + rowHeight * (.9 + index);
        context.fillStyle = index % 2 ? 'rgba(23,24,56,.035)' : 'rgba(178,34,52,.035)';
        roundRect(context, panelX, y, panelWidth, rowHeight * .8, 10 * scale);
        context.fill();
        context.fillStyle = '#303247';
        drawFittedSingleLine(context, point.feature, panelX + 20 * scale, y + rowHeight * .5, featureWidth - 34 * scale, 750, 17 * scale, 10 * scale);
        context.fillStyle = accent;
        drawFittedSingleLine(context, point.ours, panelX + featureWidth + 18 * scale, y + rowHeight * .5, valueWidth - 30 * scale, 750, 16 * scale, 9 * scale);
        context.fillStyle = '#656879';
        drawFittedSingleLine(context, point.alternative, panelX + featureWidth + valueWidth + 18 * scale, y + rowHeight * .5, valueWidth - 30 * scale, 650, 15 * scale, 9 * scale);
      });
    }

    if (template === 'usage-timeline') {
      const panelX = width * .46;
      const panelWidth = width * .46;
      context.fillStyle = accent;
      context.font = `800 ${13 * scale}px Inter, Arial, sans-serif`;
      context.fillText('HOW TO USE', panelX, height * .13);
      context.fillStyle = '#171838';
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: panelX,
        y: height * .21,
        maxWidth: panelWidth,
        maxLines: 2,
        initialSize: 42 * scale,
        minimumSize: 27 * scale,
        weight: 850
      });
      const startY = Math.max(height * .36, headlineEnd + 26 * scale);
      const stepGap = height * .18;
      payload.usageSteps.forEach((step, index) => {
        const y = startY + index * stepGap;
        context.fillStyle = accent;
        context.beginPath();
        context.arc(panelX + 22 * scale, y, 22 * scale, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffffff';
        context.font = `800 ${15 * scale}px Inter, Arial, sans-serif`;
        context.textAlign = 'center';
        context.fillText(String(index + 1).padStart(2, '0'), panelX + 22 * scale, y + 5 * scale);
        context.textAlign = 'start';
        context.fillStyle = '#171838';
        drawFittedSingleLine(context, step.title, panelX + 62 * scale, y - 3 * scale, panelWidth - 75 * scale, 800, 20 * scale, 12 * scale);
        context.fillStyle = '#686b7e';
        drawFittedWrappedText(context, step.detail, {
          x: panelX + 62 * scale,
          y: y + 26 * scale,
          maxWidth: panelWidth - 75 * scale,
          maxLines: 2,
          initialSize: 14 * scale,
          minimumSize: 10 * scale,
          weight: 550,
          lineHeightRatio: 1.25
        });
        if (index < payload.usageSteps.length - 1) {
          context.strokeStyle = rgba(accent, .28);
          context.lineWidth = 3 * scale;
          context.beginPath();
          context.moveTo(panelX + 22 * scale, y + 26 * scale);
          context.lineTo(panelX + 22 * scale, y + stepGap - 26 * scale);
          context.stroke();
        }
      });
    }

    if (template === 'problem-solution') {
      context.save();
      context.textAlign = 'center';
      context.fillStyle = 'rgba(255,255,255,.78)';
      drawFittedSingleLine(context, payload.category.toUpperCase(), width * .5, height * .052, width * .38, 800, 12 * scale, 8 * scale);
      context.fillStyle = '#ffffff';
      drawFittedWrappedText(context, payload.headline, {
        x: width * .5,
        y: height * .1,
        maxWidth: width * .52,
        maxLines: 2,
        initialSize: 38 * scale,
        minimumSize: 25 * scale,
        weight: 850,
        lineHeightRatio: 1.05
      });
      context.textAlign = 'start';

      const panels = [
        { x: width * .045, label: '01  PROBLEM', copy: payload.problemCopy, color: '#ffb6c3' },
        { x: width * .645, label: '02  SOLUTION', copy: payload.solutionCopy, color: '#8df0dc' }
      ];
      panels.forEach((panel) => {
        context.fillStyle = panel.color;
        drawFittedSingleLine(context, panel.label, panel.x + 34 * scale, height * .255, width * .25, 850, 14 * scale, 9 * scale);
        context.fillStyle = '#ffffff';
        drawFittedWrappedText(context, panel.copy, {
          x: panel.x + 34 * scale,
          y: height * .325,
          maxWidth: width * .31 - 68 * scale,
          maxLines: 2,
          initialSize: 24 * scale,
          minimumSize: 15 * scale,
          weight: 750,
          lineHeightRatio: 1.18
        });
      });
      context.restore();
    }

    if (template === 'detail-callouts') {
      const isPortrait = height > width;
      context.save();
      context.textAlign = 'center';
      context.fillStyle = accent;
      drawFittedSingleLine(context, payload.category.toUpperCase(), width * .5, height * .06, width * .38, 850, 12 * scale, 8 * scale);
      context.fillStyle = '#171838';
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: width * .5,
        y: height * .115,
        maxWidth: width * .62,
        maxLines: 2,
        initialSize: 38 * scale,
        minimumSize: 24 * scale,
        weight: 850,
        lineHeightRatio: 1.06
      });
      context.fillStyle = '#656879';
      drawFittedSingleLine(context, payload.subheadline, width * .5, headlineEnd + 12 * scale, width * .58, 550, 15 * scale, 10 * scale);
      context.textAlign = 'start';

      const cardWidth = width * .21;
      const cardHeight = height * (isPortrait ? .105 : .13);
      const leftX = width * .015;
      const rightX = width - leftX - cardWidth;
      const positions = [
        { x: leftX, y: height * .3, side: 'left' },
        { x: rightX, y: height * .48, side: 'right' },
        { x: leftX, y: height * .67, side: 'left' }
      ];
      payload.benefits.forEach((benefit, index) => {
        const position = positions[index];
        const anchorY = position.y + cardHeight * .5;
        const lineStartX = position.side === 'left' ? position.x + cardWidth : position.x;
        const lineEndX = position.side === 'left' ? width * .39 : width * .61;
        context.strokeStyle = rgba(accent, .72);
        context.lineWidth = 3 * scale;
        context.beginPath();
        context.moveTo(lineStartX, anchorY);
        context.lineTo(lineEndX, anchorY);
        context.stroke();
        context.fillStyle = accent;
        context.beginPath();
        context.arc(lineEndX, anchorY, 6 * scale, 0, Math.PI * 2);
        context.fill();

        roundRect(context, position.x, position.y, cardWidth, cardHeight, 18 * scale);
        context.fillStyle = 'rgba(255,255,255,.94)';
        context.fill();
        context.strokeStyle = 'rgba(23,24,56,.12)';
        context.lineWidth = 2 * scale;
        context.stroke();
        context.fillStyle = accent;
        context.font = `850 ${13 * scale}px Inter, Arial, sans-serif`;
        context.fillText(String(index + 1).padStart(2, '0'), position.x + 22 * scale, position.y + 31 * scale);
        context.fillStyle = '#20213f';
        drawFittedWrappedText(context, benefit, {
          x: position.x + 22 * scale,
          y: position.y + 66 * scale,
          maxWidth: cardWidth - 44 * scale,
          maxLines: 2,
          initialSize: 17 * scale,
          minimumSize: 11 * scale,
          weight: 750,
          lineHeightRatio: 1.16
        });
      });
      context.restore();
    }

    if (template === 'performance-action') {
      context.save();
      context.fillStyle = accent;
      context.fillRect(width * .055, height * .075, 72 * scale, 6 * scale);
      context.fillStyle = 'rgba(255,255,255,.76)';
      drawFittedSingleLine(context, payload.category.toUpperCase(), width * .055, height * .12, width * .4, 850, 12 * scale, 8 * scale);
      context.fillStyle = '#ffffff';
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: width * .055,
        y: height * .19,
        maxWidth: width * .43,
        maxLines: 2,
        initialSize: 48 * scale,
        minimumSize: 24 * scale,
        weight: 900,
        lineHeightRatio: 1.02
      });
      context.fillStyle = 'rgba(255,255,255,.8)';
      drawFittedWrappedText(context, payload.subheadline, {
        x: width * .057,
        y: headlineEnd + 18 * scale,
        maxWidth: width * .4,
        maxLines: 2,
        initialSize: 18 * scale,
        minimumSize: 12 * scale,
        weight: 550,
        lineHeightRatio: 1.3
      });

      const proofWidth = width * .36;
      const proofHeight = 76 * scale;
      const proofGap = 12 * scale;
      const proofX = width * .59;
      const proofStartY = height - (payload.benefits.length * (proofHeight + proofGap)) - height * .055;
      payload.benefits.forEach((benefit, index) => {
        const y = proofStartY + index * (proofHeight + proofGap);
        roundRect(context, proofX, y, proofWidth, proofHeight, 18 * scale);
        context.fillStyle = 'rgba(9,13,34,.9)';
        context.fill();
        context.strokeStyle = 'rgba(255,255,255,.18)';
        context.lineWidth = 2 * scale;
        context.stroke();
        context.fillStyle = accent;
        context.font = `850 ${13 * scale}px Inter, Arial, sans-serif`;
        context.fillText(String(index + 1).padStart(2, '0'), proofX + 20 * scale, y + 29 * scale);
        context.fillStyle = '#ffffff';
        drawFittedWrappedText(context, benefit, {
          x: proofX + 58 * scale,
          y: y + 30 * scale,
          maxWidth: proofWidth - 80 * scale,
          maxLines: 2,
          initialSize: 16 * scale,
          minimumSize: 10 * scale,
          weight: 750,
          lineHeightRatio: 1.14
        });
      });
      context.restore();
    }

    if (template === 'feature-collage') {
      context.save();
      context.fillStyle = accent;
      context.font = `850 ${12 * scale}px Inter, Arial, sans-serif`;
      context.fillText(payload.category.toUpperCase(), width * .05, height * .065);
      context.fillStyle = '#ffffff';
      const headlineEnd = drawFittedWrappedText(context, payload.headline, {
        x: width * .05,
        y: height * .125,
        maxWidth: width * .43,
        maxLines: 2,
        initialSize: 38 * scale,
        minimumSize: 24 * scale,
        weight: 875,
        lineHeightRatio: 1.04
      });
      context.fillStyle = 'rgba(255,255,255,.76)';
      drawFittedWrappedText(context, payload.subheadline, {
        x: width * .05,
        y: headlineEnd + 12 * scale,
        maxWidth: width * .41,
        maxLines: 2,
        initialSize: 15 * scale,
        minimumSize: 10 * scale,
        weight: 550,
        lineHeightRatio: 1.25
      });

      const panelX = width * .56;
      const panelWidth = width * .39;
      const panelHeight = height * .205;
      const panelYPositions = [height * .13, height * .39, height * .65];
      payload.benefits.forEach((benefit, index) => {
        const panelY = panelYPositions[index];
        context.fillStyle = rgba(accent, .12);
        context.beginPath();
        context.arc(panelX + 48 * scale, panelY + panelHeight * .5, 27 * scale, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = accent;
        context.font = `850 ${14 * scale}px Inter, Arial, sans-serif`;
        context.textAlign = 'center';
        context.fillText(String(index + 1).padStart(2, '0'), panelX + 48 * scale, panelY + panelHeight * .5 + 5 * scale);
        context.textAlign = 'start';
        context.fillStyle = accent;
        context.font = `850 ${11 * scale}px Inter, Arial, sans-serif`;
        context.fillText('VERIFIED BENEFIT', panelX + 92 * scale, panelY + 47 * scale);
        context.fillStyle = '#20213f';
        drawFittedWrappedText(context, benefit, {
          x: panelX + 92 * scale,
          y: panelY + 86 * scale,
          maxWidth: panelWidth - 120 * scale,
          maxLines: 2,
          initialSize: 20 * scale,
          minimumSize: 12 * scale,
          weight: 800,
          lineHeightRatio: 1.12
        });
      });
      context.restore();
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

  async function composeVariantCard(product, payload, job) {
    await document.fonts?.ready;
    const width = 1600;
    const height = 1600;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const accent = payload.variantType === 'color' ? job.color : payload.brandColor;
    const paleAccent = rgba(accent, .12);

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(.62, '#f6f7fa');
    gradient.addColorStop(1, paleAccent);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = accent;
    context.fillRect(0, 0, width, 18);

    context.fillStyle = '#171838';
    drawFittedSingleLine(context, payload.productName, 100, 150, width - 200, 850, 52, 30);
    context.fillStyle = accent;
    context.font = '800 22px Inter, Arial, sans-serif';
    context.fillText(`${VARIANT_TYPE_LABELS[payload.variantType].toUpperCase()} OPTION`, 102, 205);

    const maximumWidth = width * .66;
    const maximumHeight = height * .65;
    const productScale = Math.min(maximumWidth / product.naturalWidth, maximumHeight / product.naturalHeight, 1.22);
    const drawWidth = product.naturalWidth * productScale;
    const drawHeight = product.naturalHeight * productScale;
    const x = (width - drawWidth) / 2;
    const y = 270 + (maximumHeight - drawHeight) / 2;

    context.save();
    context.filter = 'blur(28px)';
    context.fillStyle = 'rgba(23,24,56,.18)';
    context.beginPath();
    context.ellipse(width / 2, y + drawHeight * .97, drawWidth * .32, Math.max(18, drawHeight * .028), 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.shadowColor = 'rgba(23,24,56,.18)';
    context.shadowBlur = 28;
    context.shadowOffsetY = 16;
    context.drawImage(product, x, y, drawWidth, drawHeight);
    context.restore();

    roundRect(context, 100, height - 230, width - 200, 126, 28);
    context.fillStyle = 'rgba(255,255,255,.92)';
    context.fill();
    context.strokeStyle = rgba(accent, .22);
    context.lineWidth = 2;
    context.stroke();
    if (payload.variantType === 'color') {
      context.fillStyle = accent;
      context.beginPath();
      context.arc(154, height - 167, 28, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(23,24,56,.18)';
      context.stroke();
    }
    context.fillStyle = '#171838';
    drawFittedSingleLine(
      context,
      job.label,
      payload.variantType === 'color' ? 210 : 145,
      height - 152,
      payload.variantType === 'color' ? width - 350 : width - 290,
      850,
      39,
      24
    );

    return {
      image: canvas.toDataURL('image/jpeg', .95),
      width,
      height,
      format: 'square'
    };
  }

  function resultRatio(format) {
    if (format === 'square') return '1 / 1';
    if (format === 'portrait') return '2 / 3';
    return '3 / 2';
  }

  function runSignature(payload, primaryFileId) {
    return JSON.stringify({ primaryFileId, payload });
  }

  function resultFilename(result) {
    const base = slugify(result.productName || 'product');
    return `${base}-${slugify(result.filenameLabel || result.template)}.jpg`;
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

  function mergeResults(primary, previous, maximum = 6) {
    const seen = new Set();
    return [...primary, ...previous].filter((result) => {
      const key = result.generatedVariant
        ? `variant:${result.jobId || result.id}`
        : `template:${result.template}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, maximum);
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
      image.alt = `${result.title || TEMPLATE_LABELS[result.template] || result.template} for ${result.productName}`;

      const footer = document.createElement('footer');
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      title.textContent = result.title || TEMPLATE_LABELS[result.template] || result.template;
      meta.textContent = `${result.width}×${result.height} · JPG${result.generatedVariant ? ' · AI-edited variant' : ''}`;
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

    if (payload.mode === 'creative') {
      try {
        await document.fonts?.ready;
        validateCopyLayout(payload);
      } catch (error) {
        elements.briefError.textContent = error.message || 'Shorten the infographic copy for the selected layout.';
        elements.briefError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const primaryFile = state.files[0];
    const signature = runSignature(payload, primaryFile.id);
    const canResume = (
      state.runStatus === 'failed' &&
      state.lastRun?.signature === signature
    );
    const previousResults = canResume ? state.lastRun.previousResults : state.results.slice(0, 6);
    const generated = canResume
      ? state.lastRun.results.filter((result) => (
          payload.mode === 'variant'
            ? payload.variantJobs.some((job) => job.id === result.jobId)
            : payload.templates.includes(result.template)
        ))
      : [];
    state.lastRun = { signature, results: generated, previousResults };
    state.results = mergeResults(generated, previousResults);
    renderResults();
    elements.cutoutReview.hidden = true;
    elements.variantReview.hidden = true;
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
          preparationProof: response.preparationProof,
          width: response.width,
          height: response.height,
          approved: false
        };
        state.preparedProduct = prepared;
      }

      const productImage = await loadDataImage(prepared.cutout);
      if (payload.mode === 'creative') validateProductResolution(productImage, payload);
      if (!prepared.approved) {
        setProgress(
          23,
          'Review the product cutout',
          payload.mode === 'variant'
            ? 'The paid product edit begins only after you approve this original layer.'
            : 'Paid background generation begins only after you approve this product layer.'
        );
        await requestCutoutApproval(prepared.cutout);
        prepared.approved = true;
      }

      if (payload.mode === 'variant') {
        if (!prepared.preparationProof) {
          const error = new Error('The approved product proof is missing. Prepare and review the original photo again.');
          error.code = 'INVALID_PREPARATION_PROOF';
          throw error;
        }
        setProgress(26, 'Original product locked', 'Creating controlled derived variants without replacing your original cutout.');
        for (let index = 0; index < payload.variantJobs.length; index += 1) {
          const job = payload.variantJobs[index];
          if (generated.some((result) => result.jobId === job.id)) continue;
          const start = 29 + (index / payload.variantJobs.length) * 65;
          const cacheKey = JSON.stringify({
            fileId: prepared.fileId,
            type: payload.variantType,
            instruction: job.instruction
          });
          let layer = state.variantLayers.get(cacheKey);

          if (!layer) {
            let response = state.rawVariantEdits.get(cacheKey);
            if (!response) {
              setProgress(
                start,
                `Creating ${job.label}…`,
                `Applying only the requested ${payload.variantType} change. This can take a few minutes.`
              );
              response = await requestVariantGeneration(
                prepared.cutout,
                prepared.preparationProof,
                payload.variantType,
                job.instruction,
                await state.currentUser.getIdToken()
              );
              state.rawVariantEdits.set(cacheKey, response);
              incrementLocalGenerationCount(1);
            }
            setProgress(
              start + 10,
              `Isolating ${job.label}…`,
              'Removing the chroma background and normalizing clean product edges.'
            );
            const optimizedVariant = await compressDataImage(response.variant);
            const variantPreparation = await requestProductPreparation(
              optimizedVariant,
              await state.currentUser.getIdToken()
            );
            setProgress(
              start + 18,
              `Review ${job.label} at 200%`,
              'Approval is required because generative edits can alter labels or small packaging details.'
            );
            try {
              await requestVariantApproval(variantPreparation.cutout, job.label);
            } catch (error) {
              if (error.code === 'VARIANT_REJECTED_BY_USER') state.rawVariantEdits.delete(cacheKey);
              throw error;
            }
            layer = {
              cutout: variantPreparation.cutout,
              requestId: response.requestId,
              approved: true
            };
            state.variantLayers.set(cacheKey, layer);
          }

          setProgress(start + 25, `Composing ${job.label}…`, 'Building a polished ecommerce option card from the approved variant layer.');
          const variantImage = await loadDataImage(layer.cutout);
          validateVariantResolution(variantImage, job.label);
          const composition = await composeVariantCard(variantImage, payload, job);
          const result = {
            id: layer.requestId || `${Date.now()}-${job.id}`,
            image: composition.image,
            template: `variant-${payload.variantType}`,
            title: `${job.label} · ${VARIANT_TYPE_LABELS[payload.variantType]}`,
            filenameLabel: `${payload.variantType}-${job.label}`,
            productName: payload.productName,
            canvasFormat: composition.format,
            width: composition.width,
            height: composition.height,
            generatedVariant: true,
            variantType: payload.variantType,
            jobId: job.id
          };
          generated.push(result);
          state.lastRun.results = [...generated];
          state.results = mergeResults(generated, previousResults);
          renderResults();
        }
      } else {
        setProgress(26, 'Product layer locked', 'The non-generative product cutout is ready for 2K composition.');
        for (let index = 0; index < payload.templates.length; index += 1) {
        const template = payload.templates[index];
        if (generated.some((result) => result.template === template)) continue;
        const fixedFormat = FIXED_TEMPLATE_FORMATS[template];
        const conceptPayload = fixedFormat
          ? { ...payload, canvasFormat: fixedFormat }
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
          const response = await requestGeneration(
            conceptPayload,
            template,
            await state.currentUser.getIdToken()
          );
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
        state.results = mergeResults(generated, previousResults);
        renderResults();
        incrementLocalGenerationCount(1);
        }
      }

      setProgress(
        100,
        payload.mode === 'variant' ? 'Variant set complete' : 'Creative set complete',
        payload.mode === 'variant'
          ? 'Your approved variant option cards are ready. Verify again against the manufactured SKU before publishing.'
          : 'Your finished images are ready to review and download.'
      );
      state.results = [...generated];
      state.lastRun.results = [...generated];
      renderResults();
      setRunStatus('complete');
      const outputLabel = payload.mode === 'variant' ? 'variant' : 'creative';
      showToast(`${generated.length} ${outputLabel}${generated.length === 1 ? '' : 's'} generated successfully.`);
      elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Generation failed:', error.code || error.status || error.message);
      if (error.code === 'CUTOUT_REJECTED_BY_USER') {
        state.preparedProduct = null;
        clearVariantLayers();
      }
      if (error.code === 'INVALID_PREPARATION_PROOF') {
        state.preparedProduct = null;
        clearVariantLayers();
      }
      const friendly = error.code === 'SERVICE_NOT_CONFIGURED'
        ? 'Generation is not configured yet. Add the required environment variables in Vercel and redeploy.'
        : error.code === 'CUTOUT_SERVICE_NOT_CONFIGURED'
          ? 'Product background removal is not configured yet. Add PHOTOROOM_API_KEY in Vercel and redeploy.'
        : error.code === 'DAILY_LIMIT_REACHED'
          ? 'Your daily generation limit has been reached.'
          : error.code === 'DAILY_VARIANT_LIMIT_REACHED'
            ? 'Your daily variant-generation limit has been reached.'
          : error.code === 'VARIANT_RATE_LIMITED'
            ? 'Please wait a few seconds before creating the next variant.'
          : error.code === 'VARIANT_REJECTED'
            ? 'That controlled edit could not be applied. Make the instruction more specific and try again.'
          : error.code === 'INVALID_PREPARATION_PROOF'
            ? 'The approved product proof is missing or expired. Generate again to prepare and review the original photo.'
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
          : error.code === 'VARIANT_RESOLUTION_LOW'
            ? error.message
          : error.message || 'Generation failed. Please try again.';
      const outputLabel = payload.mode === 'variant' ? 'variant' : 'creative';
      const message = generated.length
        ? `${generated.length} ${outputLabel}${generated.length === 1 ? '' : 's'} completed. The next item stopped: ${friendly}`
        : friendly;
      showToast(message, 'error');
      setProgress(4, 'Generation stopped', message);
      setRunStatus('failed');
      if (generated.length) elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setTimeout(() => {
        setBusy(false);
        updateOutputMode();
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
    elements.openVariantPreview.addEventListener('click', () => {
      if (elements.variantPreviewImage.src) openDataImage(elements.variantPreviewImage.src);
    });
    elements.openOriginalPreview.addEventListener('click', () => {
      if (state.preparedProduct?.cutout) openDataImage(state.preparedProduct.cutout);
    });
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
  initializeOutputModes();
  initializeTemplates();
  initializeForm();
})();
