// Plans Management

// Flag to prevent duplicate saves
let _savingPlan = false;

// Load plans
async function loadPlans() {
    const key = Storage.KEYS.PLANS;
    let plans = Storage.get(key) || [];
    const plansGrid = document.getElementById('plansGrid');

    if (!plansGrid) return;

    // If we don't have plans in memory yet, attempt to fetch from the backend
    if (!plans || plans.length === 0) {
        plansGrid.innerHTML = `<div class="loading">Loading plans…</div>`;
        try {
            const res = await fetch(`${window.__API_BASE__}/gym_plans`);
            const data = await res.json();
            if (data && Array.isArray(data.items)) {
                Storage.cache = Storage.cache || {};
                Storage.cache[key] = data.items.map(i => Object.assign({}, i));
                plans = Storage.get(key) || [];
            } else {
                plans = [];
            }
        } catch (err) {
            console.error('Failed to load plans from server:', err);
            plans = [];
        }
    }

    if (plans.length === 0) {
        plansGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💳</div>
                <h3>No Plans Available</h3>
                <p>Create your first membership plan</p>
            </div>
        `;
        return;
    }

    plansGrid.innerHTML = plans.map(plan => {
        const features = Array.isArray(plan.features)
            ? plan.features
            : (plan.features || '').toString().split('\n').filter(f => f && f.trim());

        return `
            <div class="plan-card">
                <div class="plan-header">
                    <h3 class="plan-name">${escapeHtml(plan.name)}</h3>
                    <div class="plan-price">
                        ${formatCurrency(plan.price)}
                        <span>/ ${escapeHtml(plan.duration)}</span>
                    </div>
                    <div class="plan-duration">${typeof getDurationLabel === 'function' ? getDurationLabel(plan.duration) : escapeHtml(plan.duration)}</div>
                    ${plan.discount > 0 ? `<span class="plan-discount">${Number(plan.discount)}% OFF</span>` : ''}
                    ${plan.trial > 0 ? `<span class="plan-trial">${Number(plan.trial)} Day Trial</span>` : ''}
                </div>
                <p class="plan-description">${escapeHtml(plan.description || 'No description available')}</p>
                <ul class="plan-features">
                    ${features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}
                </ul>
                ${hasPermission('all') ? `
                    <div class="plan-actions">
                        <button class="btn btn-primary btn-sm" data-plan-id="${escapeHtml(plan.id)}" data-action="editPlan" data-id="${escapeHtml(plan.id)}">Edit</button>
                        <button class="btn btn-danger btn-sm" data-plan-id="${escapeHtml(plan.id)}" data-action="deletePlan" data-id="${escapeHtml(plan.id)}">Delete</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Show add plan modal
function showAddPlanModal() {
    // Reset save guard in case it was stuck
    _savingPlan = false;

    if (!isDefaultAdmin()) {
        showNotification('Only the default admin (Tanmay9999) can create plans', 'error');
        return;
    }
    const titleEl = document.getElementById('planModalTitle');
    if (titleEl) titleEl.textContent = 'Create Membership Plan';

    if (document.getElementById('planName')) document.getElementById('planName').value = '';
    if (document.getElementById('planDuration')) document.getElementById('planDuration').value = 'monthly';
    if (document.getElementById('planPrice')) document.getElementById('planPrice').value = '';
    if (document.getElementById('planDiscount')) document.getElementById('planDiscount').value = '0';
    if (document.getElementById('planTrial')) document.getElementById('planTrial').value = '0';
    if (document.getElementById('planDescription')) document.getElementById('planDescription').value = '';
    if (document.getElementById('planFeatures')) document.getElementById('planFeatures').value = '';

    const addModal = document.getElementById('addPlanModal');
    if (addModal) addModal.removeAttribute('data-edit-id');

    showModal('addPlanModal');
}

// Save plan
function savePlan() {
    const nameEl = document.getElementById('planName');
    const priceEl = document.getElementById('planPrice');
    const durationEl = document.getElementById('planDuration');
    const discountEl = document.getElementById('planDiscount');
    const trialEl = document.getElementById('planTrial');
    const descEl = document.getElementById('planDescription');
    const featuresEl = document.getElementById('planFeatures');

    const name = nameEl ? nameEl.value.trim() : '';
    const duration = durationEl ? durationEl.value : 'monthly';
    const priceRaw = priceEl ? priceEl.value : '';
    const price = priceRaw === '' ? NaN : parseFloat(priceRaw);
    const discount = discountEl ? parseInt(discountEl.value) || 0 : 0;
    const trial = trialEl ? parseInt(trialEl.value) || 0 : 0;
    const description = descEl ? descEl.value.trim() : '';
    const features = featuresEl ? featuresEl.value.split('\n').filter(f => f.trim()).map(f => f.trim()) : [];

    if (!name || isNaN(price)) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Prevent duplicate saves
    if (_savingPlan) {
        console.log('Plan save in progress, ignoring');
        return;
    }
    _savingPlan = true;

    const addModalEl = document.getElementById('addPlanModal');
    const editId = addModalEl ? addModalEl.getAttribute('data-edit-id') : null;

    if (editId) {
        const plan = { name, duration, price, discount, trial, description, features, updatedAt: new Date().toISOString() };
        Storage.update(Storage.KEYS.PLANS, editId, plan).then(() => {
            closeModal('addPlanModal');
            loadPlans();
            showNotification('Plan updated successfully', 'success');
        }).catch(err => {
            console.error('Failed to update plan:', err);
            showNotification('Failed to update plan', 'error');
        });
    } else {
        const plan = { name, duration, price, discount, trial, description, features, createdAt: new Date().toISOString() };
        Storage.create(Storage.KEYS.PLANS, plan).then(created => {
            _savingPlan = false;
            closeModal('addPlanModal');
            loadPlans();
            showNotification('Plan created successfully', 'success');
        }).catch(err => {
            _savingPlan = false;
            console.error('Failed to create plan:', err);
            showNotification('Failed to create plan', 'error');
        });
    }
}

// Edit plan
function editPlan(planId) {
    const plans = Storage.get(Storage.KEYS.PLANS) || [];
    const plan = plans.find(p => String(p.id) === String(planId));

    if (!plan) {
        showNotification('Plan not found', 'error');
        return;
    }

    const titleEl = document.getElementById('planModalTitle');
    if (titleEl) titleEl.textContent = 'Edit Membership Plan';
    if (document.getElementById('planName')) document.getElementById('planName').value = plan.name || '';
    if (document.getElementById('planDuration')) document.getElementById('planDuration').value = plan.duration || 'monthly';
    if (document.getElementById('planPrice')) document.getElementById('planPrice').value = plan.price || '';
    if (document.getElementById('planDiscount')) document.getElementById('planDiscount').value = plan.discount || 0;
    if (document.getElementById('planTrial')) document.getElementById('planTrial').value = plan.trial || 0;
    if (document.getElementById('planDescription')) document.getElementById('planDescription').value = plan.description || '';

    const features = Array.isArray(plan.features) ? plan.features.join('\n') : (plan.features || '');
    if (document.getElementById('planFeatures')) document.getElementById('planFeatures').value = features;

    const addModal = document.getElementById('addPlanModal');
    if (addModal) addModal.setAttribute('data-edit-id', planId);

    showModal('addPlanModal');
}

// Delete plan
function deletePlan(planId) {
    if (!confirm('Are you sure you want to delete this plan?')) {
        return;
    }

    Storage.delete(Storage.KEYS.PLANS, planId).then(ok => {
        if (ok) {
            loadPlans();
            showNotification('Plan deleted successfully', 'success');
        } else {
            showNotification('Failed to delete plan', 'error');
        }
    }).catch(err => {
        console.error('Failed to delete plan:', err);
        showNotification('Failed to delete plan', 'error');
    });
}

/* Small helper to escape HTML when rendering user-supplied strings, reduces XSS risk */
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
