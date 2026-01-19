// In-memory Storage Management with direct MySQL persistence via backend API
const API_BASE = window.__API_BASE__ || 'http://localhost:5000/api';

// Keys
const Storage = {
    KEYS: {
        USERS: 'gym_users',
        MEMBERS: 'gym_members',
        PLANS: 'gym_plans',
        CLASSES: 'gym_classes',
        TRAINERS: 'gym_trainers',
        PAYMENTS: 'gym_payments',
        CHECKINS: 'gym_checkins',
        PROSPECTS: 'gym_prospects',
        BOOKINGS: 'gym_bookings'
    },

    // in-memory cache populated by bootstrap.js
    cache: window.__BOOTSTRAP_CACHE__ || {},

    // Initialize default empty arrays for keys if missing
    initializeDefaults() {
        for (const k of Object.values(this.KEYS)) {
            if (!this.cache[k]) this.cache[k] = [];
        }
    },

    // Get items synchronously from in-memory cache
    get(key) {
        return this.cache[key] || [];
    },

    // Replace full collection in-memory and persist to backend (full replace)
    // This function updates DB via POST /api/:key/full
    async persistFullToServer(key) {
        try {
            try {
            const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}/full`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: this.cache[key] || [] })
            });
            const data = await res.json();
            if (data && Array.isArray(data.items)) {
                // update cache with server-assigned ids and normalized items
                this.cache[key] = data.items.map(it => Object.assign({}, it));
                // call common reloaders if available so UI updates after server sync
                try {
                    if (key === 'gym_members' && typeof loadMembers === 'function') loadMembers();
                    if (key === 'gym_plans' && typeof loadPlans === 'function') loadPlans();
                    if (key === 'gym_trainers' && typeof loadTrainers === 'function') loadTrainers();
                    if (key === 'gym_classes' && typeof loadClasses === 'function') loadClasses();
                    if (key === 'gym_users' && typeof loadAdmins === 'function') loadAdmins && loadAdmins();
                    if (typeof refreshDashboard === 'function') refreshDashboard();
                } catch(e) {
                    console.warn('Post-sync UI refresh failed for', key, e);
                }

            }
        } catch (e) {
            console.error('Failed to persist full collection to server for', key, e);
        }
        } catch (e) {
            console.error('Failed to persist full collection to server for', key, e);
        }
    },

    // Set replaces full collection (synchronous for UI), then asynchronously persists.
    set(key, array) {
        this.cache[key] = array || [];
        // Fire-and-forget persist
        this.persistFullToServer(key);
    },

    // Create single item: POST /api/:key -> server returns item with id
    async create(key, item) {
        try {
            const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            const data = await res.json();
            if (data && data.item) {
                // push into cache
                this.cache[key] = this.cache[key] || [];
                this.cache[key].push(data.item);
                return data.item;
            }
        } catch (e) { console.error('create failed', e); }
        return null;
    },

    // Update single item: PUT /api/:key/:id
    async update(key, id, item) {
        try {
            const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            const data = await res.json();
            if (data && data.ok) {
                // update cache
                this.cache[key] = this.cache[key] || [];
                const idx = this.cache[key].findIndex(i => String(i.id) === String(id));
                if (idx !== -1) {
                    this.cache[key][idx] = Object.assign({ id }, item);
                }
                return true;
            }
        } catch (e) { console.error('update failed', e); }
        return false;
    },

    // Delete single item: DELETE /api/:key/:id
    async delete(key, id) {
        try {
            const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data && data.ok) {
                // remove from cache
                this.cache[key] = this.cache[key] || [];
                this.cache[key] = this.cache[key].filter(i => String(i.id) !== String(id));
                return true;
            }
        } catch (e) { console.error('delete failed', e); }
        return false;
    },

    // Convenience: find by id
    findById(key, id) {
        return (this.cache[key] || []).find(i => String(i.id) === String(id));
    },

    // Generate unique ID (not used for server-created items)
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
};

// Initialize cache keys
Storage.initializeDefaults();

