// Dashboard Management

let attendanceChart = null;
let revenueChart = null;
let classFillChart = null;

// Load dashboard
function loadDashboard() {
    updateDashboardStats();
    initializeCharts();
}

// Update dashboard statistics
function updateDashboardStats() {
    // Total active members
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    const activeMembers = members.filter(m => getMembershipStatus(m.expiryDate) === 'active');
    document.getElementById('totalMembers').textContent = activeMembers.length;

    // Revenue this month
    const monthRevenue = getMonthRevenue();
    document.getElementById('monthRevenue').textContent = formatCurrency(monthRevenue);

    // Daily check-ins
    const dailyCheckins = getTodayCheckins();
    document.getElementById('dailyCheckins').textContent = dailyCheckins;

    // Upcoming classes today
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const today = new Date().toDateString();
    const todayClasses = classes.filter(c => new Date(c.date).toDateString() === today);
    document.getElementById('upcomingClasses').textContent = todayClasses.length;
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
                        callback: function(value) {
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