// Authentication Management
let currentUser = null;

// Role-based navigation items
const navigationByRole = {
    admin: [
        { id: 'dashboard', icon: '📊', label: 'Dashboard' },
        { id: 'members', icon: '👥', label: 'Members' },
        { id: 'plans', icon: '💳', label: 'Plans' },
        { id: 'classes', icon: '📅', label: 'Classes' },
        { id: 'checkin', icon: '✅', label: 'Check-in' },
        { id: 'qrScanner', icon: '📱', label: 'QR Scanner' },
        { id: 'trainers', icon: '💪', label: 'Trainers' },
        { id: 'prospects', icon: '🎯', label: 'Prospects' }
    ],
    frontdesk: [
        { id: 'dashboard', icon: '📊', label: 'Dashboard' },
        { id: 'members', icon: '👥', label: 'Members' },
        { id: 'checkin', icon: '✅', label: 'Check-in' },
        { id: 'qrScanner', icon: '📱', label: 'QR Scanner' },
        { id: 'classes', icon: '📅', label: 'Classes' },
        { id: 'prospects', icon: '🎯', label: 'Prospects' }
    ],
    trainer: [
        { id: 'dashboard', icon: '📊', label: 'Dashboard' },
        { id: 'classes', icon: '📅', label: 'My Classes' },
        { id: 'members', icon: '👥', label: 'Members' },
        { id: 'checkin', icon: '✅', label: 'Check-in' }
    ],
    member: [
        { id: 'dashboard', icon: '📊', label: 'Dashboard' },
        { id: 'classes', icon: '📅', label: 'Classes' },
        { id: 'trainers', icon: '💪', label: 'Trainers' }
    ]
};

// Login function
function login() {
    const roleSelect = document.getElementById('roleSelect').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showNotification('Please enter username and password', 'error');
        return;
    }

    const users = Storage.get(Storage.KEYS.USERS) || [];
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
        showNotification('Invalid username or password', 'error');
        return;
    }

    if (user.role !== roleSelect) {
        showNotification('Selected role does not match user role', 'error');
        return;
    }

    // set current user (omit password)
    currentUser = Object.assign({}, user);
    delete currentUser.password;

    // store current user in-memory for this session
    window.__CURRENT_USER__ = currentUser;

    // Hide login screen, show main app
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');

    // Initialize app
    initializeApp();

    showNotification(`Welcome back, ${currentUser.name || currentUser.username}!`, 'success');
}

// Logout function
function logout() {
    currentUser = null;
    window.__CURRENT_USER__ = null;

    // Show login screen, hide main app
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');

    // Clear form
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';

    showNotification('Logged out successfully', 'info');
}

// Check if user is logged in
function _safeHasUsername(obj) {
    return obj && typeof obj.username === 'string' && obj.username.length > 0;
}

function checkAuth() {
    // Prefer ephemeral in-memory current user set by login during this session
    const savedUser = window.__CURRENT_USER__ || null;
    // As a fallback (when backend was used to bootstrap), look for a single user object
    // Ensure we only treat a valid object as authenticated (avoid truthy empty arrays)
    if (_safeHasUsername(savedUser)) {
        currentUser = savedUser;
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('mainApp').classList.add('active');
        initializeApp();
        return;
    }

    // If Storage has a users array and contains a single default admin, auto-login is optional
    try {
        const users = Storage.get && Storage.get(Storage.KEYS.USERS);
        if (Array.isArray(users) && users.length===1 && _safeHasUsername(users[0])) {
            currentUser = Object.assign({}, users[0]);
            delete currentUser.password;
            window.__CURRENT_USER__ = currentUser;
            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('mainApp').classList.add('active');
            initializeApp();
            return;
        }
    } catch(e) { /* ignore */ }

    // Otherwise remain on login screen (no-op)
}

// Build navigation based on role
function buildNavigation() {
    if (!currentUser) return;
    const navContainer = document.getElementById('sidebarNav');
    const navItems = navigationByRole[currentUser.role] || [];

    navContainer.innerHTML = navItems.map(item => `
        <div class="nav-item" data-action="navigateTo" data-id="${item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
        </div>
    `).join('');

    // Update user info
    document.getElementById('userAvatar').textContent = (currentUser.avatar || currentUser.name || currentUser.username).charAt(0).toUpperCase();
    document.getElementById('userName').textContent = currentUser.name || currentUser.username;
    document.getElementById('userRole').textContent = getRoleLabel(currentUser.role);
}

// Get role label
function getRoleLabel(role) {
    const labels = {
        admin: 'Administrator',
        frontdesk: 'Front Desk',
        trainer: 'Trainer',
        member: 'Member'
    };
    return labels[role] || role;
}

// Check if current user has permission
function hasPermission(permission) {
    const permissions = {
        admin: ['all'],
        frontdesk: ['view_members', 'add_members', 'checkin', 'view_classes', 'add_prospects'],
        trainer: ['view_members', 'view_classes', 'manage_own_classes', 'checkin'],
        member: ['view_classes', 'book_classes', 'view_profile']
    };

    const userPermissions = permissions[currentUser.role] || [];
    return userPermissions.includes('all') || userPermissions.includes(permission);
}

// Helper: is default (super) admin
function isDefaultAdmin() {
    return currentUser && currentUser.username === 'Tanmay9999';
}

// Check auth on page load
document.addEventListener('DOMContentLoaded', checkAuth);
