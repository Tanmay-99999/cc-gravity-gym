// Dashboard Management

let attendanceChart = null;
let revenueChart = null;
let classFillChart = null;

// Load dashboard
async function loadDashboard() {
    if (currentUser.role === 'admin') {
        await updateDashboardStats();
        initializeCharts();
    } else if (currentUser.role === 'trainer') {
        await loadTrainerDashboard();
    } else if (currentUser.role === 'member') {
        await loadMemberDashboard();
    }
}

// Update dashboard statistics
async function updateDashboardStats() {
    // Refresh all relevant data from server
    await Storage.refresh(Storage.KEYS.MEMBERS);
    await Storage.refresh(Storage.KEYS.PAYMENTS);
    await Storage.refresh(Storage.KEYS.CHECKINS);
    await Storage.refresh(Storage.KEYS.CLASSES);

    // Total active members
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    const activeMembers = members.filter(m => getMembershipStatus(m.expiryDate) === 'active');
    const totalMembersEl = document.getElementById('totalMembers');
    if (totalMembersEl) totalMembersEl.textContent = activeMembers.length;

    // Revenue this month
    const monthRevenue = getMonthRevenue();
    const monthRevenueEl = document.getElementById('monthRevenue');
    if (monthRevenueEl) monthRevenueEl.textContent = formatCurrency(monthRevenue);

    // Daily check-ins
    const dailyCheckins = getTodayCheckins();
    const dailyCheckinsEl = document.getElementById('dailyCheckins');
    if (dailyCheckinsEl) dailyCheckinsEl.textContent = dailyCheckins;

    // Upcoming classes today
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const todayStr = new Date().toDateString();
    const todayClasses = classes.filter(c => {
        const d = c.date || (c.schedule && c.schedule.date);
        return d && new Date(d).toDateString() === todayStr;
    });
    const upcomingClassesEl = document.getElementById('upcomingClasses');
    if (upcomingClassesEl) upcomingClassesEl.textContent = todayClasses.length;
}

// Initialize charts
function initializeCharts() {
    initAttendanceChart();
    initRevenueChart();
    initClassFillChart();
}

// Attendance Trend Chart
function initAttendanceChart() {
    const ctx = document.getElementById('attendanceChart');
    if (!ctx) return;

    const weeklyData = getWeeklyCheckins();

    if (attendanceChart) {
        attendanceChart.destroy();
    }

    attendanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeklyData.labels,
            datasets: [{
                label: 'Check-ins',
                data: weeklyData.data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                }
            }
        }
    });
}

// Revenue Breakdown Chart
function initRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const revenueData = getRevenueByPlan();
    const labels = Object.keys(revenueData);
    const data = Object.values(revenueData);

    if (revenueChart) {
        revenueChart.destroy();
    }

    revenueChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#3b82f6',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6',
                    '#06b6d4'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        padding: 15
                    }
                }
            }
        }
    });
}

// Class Fill Rate Chart
function initClassFillChart() {
    const ctx = document.getElementById('classFillChart');
    if (!ctx) return;

    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const bookings = Storage.get(Storage.KEYS.BOOKINGS) || [];

    // Get upcoming classes (next 7 days)
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const upcomingClasses = classes.filter(c => {
        const classDate = new Date(c.date);
        return classDate >= today && classDate <= nextWeek;
    }).slice(0, 5); // Limit to 5 classes

    const labels = upcomingClasses.map(c => c.title);
    const fillRates = upcomingClasses.map(c => {
        const classBookings = bookings.filter(b => b.classId === c.id);
        return (classBookings.length / c.capacity) * 100;
    });

    if (classFillChart) {
        classFillChart.destroy();
    }

    classFillChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Fill Rate (%)',
                data: fillRates,
                backgroundColor: '#10b981',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#94a3b8',
                        callback: function (value) {
                            return value + '%';
                        }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#94a3b8'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

async function loadTrainerDashboard() {
    await Storage.refresh(Storage.KEYS.CLASSES);
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const myClasses = classes.filter(c => String(c.trainerId) === String(currentUser.id));

    const today = new Date().toDateString();
    const todayClasses = myClasses.filter(c => new Date(c.date).toDateString() === today);

    const countEl = document.getElementById('trainerClassesToday');
    if (countEl) countEl.textContent = todayClasses.length;

    const listEl = document.getElementById('trainerScheduleList');
    if (listEl) {
        if (todayClasses.length === 0) {
            listEl.innerHTML = '<p class="text-muted">No classes scheduled for today.</p>';
        } else {
            listEl.innerHTML = todayClasses.map(c => `
                <div class="list-item glass-card mb-2" style="padding: 10px; margin-bottom: 10px; border-radius: 8px; background: rgba(255,255,255,0.05);">
                    <strong>${c.title}</strong><br>
                    <small>🕒 ${c.time} (${c.duration} mins) | 👥 ${c.capacity} capacity</small>
                </div>
            `).join('');
        }
    }
}

async function loadMemberDashboard() {
    await Storage.refresh(Storage.KEYS.MEMBERS);
    await Storage.refresh(Storage.KEYS.PAYMENTS);
    await Storage.refresh(Storage.KEYS.CHECKINS);

    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    const member = members.find(m => m.email === currentUser.email);

    if (!member) return;

    const status = getMembershipStatus(member.expiryDate);
    document.getElementById('memberPlanStatus').textContent = status.toUpperCase();
    document.getElementById('memberPlanName').textContent = member.planName;

    const daysLeft = daysBetween(new Date(), new Date(member.expiryDate));
    document.getElementById('memberExpiryDays').textContent = daysLeft;

    // Attendance
    const checkins = Storage.get(Storage.KEYS.CHECKINS) || [];
    const myCheckins = checkins.filter(c => String(c.memberId) === String(member.id)).slice(0, 5);
    const attendanceList = document.getElementById('memberAttendanceList');
    if (attendanceList) {
        attendanceList.innerHTML = myCheckins.map(c => `
            <div class="list-item mb-1" style="padding: 5px; border-bottom: 1px solid var(--glass-border);">
                📅 ${formatDate(c.date)}
            </div>
        `).join('') || '<p class="text-muted">No recent check-ins.</p>';
    }

    // Payments
    const payments = Storage.get(Storage.KEYS.PAYMENTS) || [];
    const myPayments = payments.filter(p => String(p.memberId) === String(member.id)).slice(0, 5);
    const paymentList = document.getElementById('memberPaymentList');
    if (paymentList) {
        paymentList.innerHTML = myPayments.map(p => `
            <div class="list-item mb-1" style="padding: 5px; border-bottom: 1px solid var(--glass-border);">
                💰 ${formatCurrency(p.amount)} - ${formatDate(p.date)}
            </div>
        `).join('') || '<p class="text-muted">No payment history.</p>';
    }
}