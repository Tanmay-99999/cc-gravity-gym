// Check-in Management

let checkinSearchTimeout = null;

// Load check-in view (async to refresh data)
async function loadCheckinView() {
    await Storage.refresh(Storage.KEYS.CHECKINS);
    loadRecentCheckins();
}

// Search member for check-in
function searchMemberForCheckin() {
    clearTimeout(checkinSearchTimeout);

    checkinSearchTimeout = setTimeout(() => {
        const searchTerm = document.getElementById('checkinSearch').value.toLowerCase();

        if (searchTerm.length < 2) {
            document.getElementById('checkinResults').innerHTML = '';
            return;
        }

        const members = Storage.get(Storage.KEYS.MEMBERS) || [];
        const filtered = members.filter(member =>
            member.name.toLowerCase().includes(searchTerm) ||
            String(member.id).toLowerCase().includes(searchTerm) ||
            (member.phone || '').includes(searchTerm)
        );

        displayCheckinResults(filtered);
    }, 300);
}

// Display check-in results
function displayCheckinResults(members) {
    const resultsContainer = document.getElementById('checkinResults');

    if (members.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted text-center">No members found</p>';
        return;
    }

    resultsContainer.innerHTML = members.map(member => {
        const status = getMembershipStatus(member.expiryDate);
        const canCheckin = status === 'active';

        return `
            <div class="checkin-item">
                <div class="checkin-member-info">
                    <div class="checkin-avatar">${member.name.charAt(0).toUpperCase()}</div>
                    <div class="checkin-details">
                        <h4>${member.name}</h4>
                        <p>${member.id} • ${member.planName}</p>
                        <p>Expires: ${formatDate(member.expiryDate)} • Status: <span class="status-badge status-${status}">${status}</span></p>
                    </div>
                </div>
                <button class="btn btn-${canCheckin ? 'success' : 'secondary'}" 
                        data-action="performCheckin" data-id="${member.id}" 
                        ${!canCheckin ? 'disabled' : ''}>
                    ${canCheckin ? 'Check In' : 'Expired'}
                </button>
            </div>
        `;
    }).join('');
}

// Perform check-in
async function performCheckin(memberId) {
    // Refresh members cache first
    await Storage.refresh(Storage.KEYS.MEMBERS);
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    // Use String comparison for ID matching
    const member = members.find(m => String(m.id) === String(memberId));

    if (!member) {
        showNotification('Member not found', 'error');
        return;
    }

    const status = getMembershipStatus(member.expiryDate);
    if (status !== 'active') {
        showNotification('Cannot check in. Membership is expired or pending.', 'error');
        return;
    }

    // Check if already checked in today
    await Storage.refresh(Storage.KEYS.CHECKINS);
    const checkins = Storage.get(Storage.KEYS.CHECKINS) || [];
    const today = new Date().toDateString();
    const alreadyCheckedIn = checkins.some(c =>
        String(c.memberId) === String(memberId) &&
        new Date(c.timestamp).toDateString() === today
    );

    if (alreadyCheckedIn) {
        showNotification('Member already checked in today', 'warning');
        return;
    }

    // Create check-in record
    const checkin = {
        id: Storage.generateId('CHECKIN'),
        memberId,
        memberName: member.name,
        timestamp: new Date().toISOString(),
        checkedInBy: currentUser.name
    };

    // create checkin on server and await before refreshing
    const created = await Storage.create(Storage.KEYS.CHECKINS, checkin);
    if (created) {
        showNotification(`${member.name} checked in successfully!`, 'success');
    } else {
        showNotification('Check-in failed', 'error');
    }

    // Clear search and reload
    document.getElementById('checkinSearch').value = '';
    document.getElementById('checkinResults').innerHTML = '';
    await Storage.refresh(Storage.KEYS.CHECKINS);
    loadRecentCheckins();
}

// Load recent check-ins
function loadRecentCheckins() {
    const checkins = Storage.get(Storage.KEYS.CHECKINS) || [];
    const today = new Date().toDateString();

    // Filter today's check-ins
    const todayCheckins = checkins.filter(c =>
        new Date(c.timestamp).toDateString() === today
    );

    // Sort by time (most recent first)
    todayCheckins.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const container = document.getElementById('recentCheckinsList');

    if (todayCheckins.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No check-ins today</p>';
        return;
    }

    container.innerHTML = todayCheckins.map(checkin => {
        const time = new Date(checkin.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="checkin-log">
                <span class="checkin-log-time">${time}</span>
                <span class="checkin-log-name">${checkin.memberName}</span>
                <span class="checkin-log-badge">✓ Checked In</span>
            </div>
        `;
    }).join('');
}

// Get check-ins for today
function getTodayCheckins() {
    const checkins = Storage.get(Storage.KEYS.CHECKINS) || [];
    const today = new Date().toDateString();

    return checkins.filter(c =>
        new Date(c.timestamp).toDateString() === today
    ).length;
}

// Get check-ins for last 7 days
function getWeeklyCheckins() {
    const checkins = Storage.get(Storage.KEYS.CHECKINS) || [];
    const last7Days = [];
    const counts = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = date.toDateString();

        const count = checkins.filter(c =>
            new Date(c.timestamp).toDateString() === dateString
        ).length;

        last7Days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        counts.push(count);
    }

    return { labels: last7Days, data: counts };
}