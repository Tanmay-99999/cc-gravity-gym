// Member Management

// Flag to prevent multiple simultaneous saves
let _savingMember = false;

// Load members table (now async to fetch fresh data from server)
async function loadMembers() {
    // Refresh cache from server before reading
    await Storage.refresh(Storage.KEYS.MEMBERS);
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    const tbody = document.getElementById('membersTableBody');

    if (members.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <h3>No Members Yet</h3>
                        <p>Start by adding your first member</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = members.map(member => {
        const status = getMembershipStatus(member.expiryDate);
        const statusClass = status === 'active' ? 'status-active' :
            status === 'expired' ? 'status-expired' : 'status-pending';

        return `
            <tr>
                <td>${member.id}</td>
                <td>${member.name}</td>
                <td>${member.email}</td>
                <td>${member.phone}</td>
                <td>${member.planName}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>${formatDate(member.expiryDate)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" data-action="viewMemberDetails" data-id="${member.id}">View</button>
                        ${hasPermission('all') ? `<button class="btn btn-sm btn-danger" data-action="deleteMember" data-id="${member.id}">Delete</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter members
function filterMembers() {
    const searchTerm = document.getElementById('memberSearch').value.toLowerCase();
    const statusFilter = document.getElementById('memberStatusFilter').value;
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];

    const filtered = members.filter(member => {
        const matchesSearch = member.name.toLowerCase().includes(searchTerm) ||
            member.email.toLowerCase().includes(searchTerm) ||
            member.phone.includes(searchTerm);

        const status = getMembershipStatus(member.expiryDate);
        const matchesStatus = !statusFilter || status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    // Render filtered results
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = filtered.map(member => {
        const status = getMembershipStatus(member.expiryDate);
        const statusClass = status === 'active' ? 'status-active' :
            status === 'expired' ? 'status-expired' : 'status-pending';

        return `
            <tr>
                <td>${member.id}</td>
                <td>${member.name}</td>
                <td>${member.email}</td>
                <td>${member.phone}</td>
                <td>${member.planName}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>${formatDate(member.expiryDate)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" data-action="viewMemberDetails" data-id="${member.id}">View</button>
                        ${hasPermission('all') ? `<button class="btn btn-sm btn-danger" data-action="deleteMember" data-id="${member.id}">Delete</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Show add member modal
function showAddMemberModal() {
    // Reset save guard in case it was stuck
    _savingMember = false;

    // Only the default admin can create members
    if (!isDefaultAdmin()) {
        showNotification('Only the default admin (Tanmay9999) can add members', 'error');
        return;
    }
    // Load plans into select
    const plans = Storage.get(Storage.KEYS.PLANS) || [];
    const planSelect = document.getElementById('memberPlan');
    planSelect.innerHTML = plans.map(plan =>
        `<option value="${plan.id}">${plan.name} - ${formatCurrency(plan.price)}</option>`
    ).join('');

    // Clear form
    document.getElementById('memberName').value = '';
    document.getElementById('memberEmail').value = '';
    document.getElementById('memberPhone').value = '';
    document.getElementById('memberDOB').value = '';
    document.getElementById('memberGender').value = 'male';
    document.getElementById('memberEmergency').value = '';
    document.getElementById('memberAddress').value = '';
    document.getElementById('memberPhoto').value = '';
    document.getElementById('photoPreview').innerHTML = '';

    showModal('addMemberModal');
}

// Handle photo preview
document.addEventListener('DOMContentLoaded', () => {
    const photoInput = document.getElementById('memberPhoto');
    if (photoInput) {
        photoInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    document.getElementById('photoPreview').innerHTML =
                        `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// Save member
function saveMember() {
    const name = document.getElementById('memberName').value;
    const email = document.getElementById('memberEmail').value;
    const phone = document.getElementById('memberPhone').value;
    const dob = document.getElementById('memberDOB').value;
    const gender = document.getElementById('memberGender').value;
    const emergency = document.getElementById('memberEmergency').value;
    const address = document.getElementById('memberAddress').value;
    const planId = document.getElementById('memberPlan').value;
    const photoInput = document.getElementById('memberPhoto');

    if (!name || !email || !phone || !planId) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Prevent duplicate submissions
    if (_savingMember) {
        console.log('Save already in progress, ignoring duplicate call');
        return;
    }
    _savingMember = true;

    const plans = Storage.get(Storage.KEYS.PLANS) || [];
    const selectedPlan = plans.find(p => String(p.id) === String(planId));

    if (!selectedPlan) {
        _savingMember = false; // Reset flag before return
        showNotification('Invalid plan selected', 'error');
        return;
    }

    // Disable button to prevent double-submit
    const saveBtn = document.querySelector('[data-action="saveMember"]') || document.getElementById('saveMemberBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    // Calculate dates
    const startDate = new Date();
    let expiryDate = new Date();

    switch (selectedPlan.duration) {
        case 'monthly':
            expiryDate.setMonth(expiryDate.getMonth() + 1);
            break;
        case 'quarterly':
            expiryDate.setMonth(expiryDate.getMonth() + 3);
            break;
        case 'yearly':
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            break;
    }

    // Read photo
    let photoData = null;
    if (photoInput.files && photoInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            photoData = e.target.result;
            completeSaveMember();
        };
        reader.readAsDataURL(photoInput.files[0]);
    } else {
        completeSaveMember();
    }

    function completeSaveMember() {
        const member = {
            id: Storage.generateId('MEM'),
            name,
            email,
            phone,
            dob,
            gender,
            emergency,
            address,
            planId,
            planName: selectedPlan.name,
            photo: photoData,
            startDate: startDate.toISOString(),
            expiryDate: expiryDate.toISOString(),
            createdAt: new Date().toISOString()
        };

        // Create member on server (no local cache). Await created item to get server-assigned id
        Storage.create(Storage.KEYS.MEMBERS, member).then(created => {
            _savingMember = false; // Reset flag
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & Process Payment';
            }
            closeModal('addMemberModal');
            if (created) {
                if (typeof loadMembers === 'function') loadMembers(); // Force refresh
                const msg = `Member added successfully!\nUsername: ${created.email}\nPassword: ${created.generatedPassword || 'Check console'}`;
                showNotification(msg, 'success');
                showPaymentModal(created, selectedPlan);
            } else {
                console.error('Failed to create member on server');
                showNotification('Failed to create member on server. Please check connection and try again.', 'error');
            }
        }).catch(err => {
            _savingMember = false; // Reset flag on error too
            console.error('Save member failed', err);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & Process Payment';
            }
        });
    }
}

// View member details
function viewMemberDetails(memberId) {
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    // Fix: strict comparison failure by converting both to string
    const member = members.find(m => String(m.id) === String(memberId));

    if (!member) {
        showNotification('Member not found', 'error');
        return;
    }

    // Populate member details
    document.getElementById('detailName').textContent = member.name;
    document.getElementById('detailID').textContent = member.id;
    document.getElementById('detailEmail').textContent = member.email;
    document.getElementById('detailPhone').textContent = member.phone;
    document.getElementById('detailDOB').textContent = formatDate(member.dob);
    document.getElementById('detailGender').textContent = member.gender;
    document.getElementById('detailEmergency').textContent = member.emergency || '-';
    document.getElementById('detailAddress').textContent = member.address || '-';
    document.getElementById('detailPlan').textContent = member.planName;
    document.getElementById('detailStartDate').textContent = formatDate(member.startDate);
    document.getElementById('detailExpiry').textContent = formatDate(member.expiryDate);

    const status = getMembershipStatus(member.expiryDate);
    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = status;
    statusBadge.className = 'status-badge ' +
        (status === 'active' ? 'status-active' :
            status === 'expired' ? 'status-expired' : 'status-pending');

    // Set photo
    const photoEl = document.getElementById('detailPhoto');
    if (member.photo) {
        photoEl.src = member.photo;
        photoEl.style.display = 'block';
    } else {
        photoEl.style.display = 'none';
    }

    // Generate QR Code - ensure text is string
    const qrContainer = document.getElementById('detailQRCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: String(member.id),
        width: 150,
        height: 150
    });

    // Load payment history
    loadPaymentHistory(memberId);

    showModal('memberDetailsModal');
}

// Function to add member from prospect
function convertProspectToMember(prospectId) {
    const prospects = Storage.get(Storage.KEYS.PROSPECTS) || [];
    const prospect = prospects.find(p => String(p.id) === String(prospectId));
    if (prospect) {
        showAddMemberModal();
        document.getElementById('memberName').value = prospect.name;
        document.getElementById('memberEmail').value = prospect.email || '';
        document.getElementById('memberPhone').value = prospect.phone;
    }
}

// Load payment history
function loadPaymentHistory(memberId) {
    const payments = Storage.get(Storage.KEYS.PAYMENTS) || [];
    const memberPayments = payments.filter(p => p.memberId === memberId);

    const tbody = document.getElementById('paymentHistoryBody');

    if (memberPayments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No payment history</td></tr>';
        return;
    }

    tbody.innerHTML = memberPayments.map(payment => `
        <tr>
            <td>${formatDate(payment.date)}</td>
            <td>${payment.planName}</td>
            <td>${formatCurrency(payment.amount)}</td>
            <td>${payment.method}</td>
            <td><span class="status-badge status-active">Completed</span></td>
        </tr>
    `).join('');
}

// Delete member
function deleteMember(memberId) {
    if (!confirm('Are you sure you want to delete this member?')) {
        return;
    }

    // delete on server
    Storage.delete(Storage.KEYS.MEMBERS, memberId).then(ok => {
        if (ok) {
            if (typeof loadMembers === 'function') { loadMembers(); }
            showNotification('Deleted successfully', 'success');
        } else {
            showNotification('Deletion failed', 'error');
        }
    }); loadMembers();
    showNotification('Member deleted successfully', 'success');
}

// Edit member (placeholder for future implementation)
function editMember() {
    showNotification('Edit functionality coming soon', 'info');
    closeModal('memberDetailsModal');
}