// Prospects Management

// Load prospects
function loadProspects() {
    const prospects = Storage.get(Storage.KEYS.PROSPECTS) || [];
    const tbody = document.getElementById('prospectsTableBody');

    if (prospects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="empty-state">
                        <div class="empty-state-icon">🎯</div>
                        <h3>No Prospects Yet</h3>
                        <p>Add your first prospect enquiry</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = prospects.map(prospect => {
        const statusClass = 
            prospect.status === 'contacted' ? 'status-contacted' :
            prospect.status === 'converted' ? 'status-converted' :
            prospect.status === 'lost' ? 'status-lost' : 'status-pending';

        return `
            <tr>
                <td>${prospect.name}</td>
                <td>${prospect.phone}</td>
                <td>${prospect.email || '-'}</td>
                <td>${prospect.interest}</td>
                <td><span class="status-badge ${statusClass}">${prospect.status}</span></td>
                <td>${formatDate(prospect.followupDate)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-primary" data-action="updateProspectStatus" data-id="${prospect.id}">Update</button>
                        <button class="btn btn-sm btn-secondary" data-action="viewProspectNotes" data-id="${prospect.id}">Notes</button>
                        ${hasPermission('all') ? `<button class="btn btn-sm btn-danger" data-action="deleteProspect" data-id="${prospect.id}">Delete</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Show add prospect modal
function showAddProspectModal() {
    // Clear form
    document.getElementById('prospectName').value = '';
    document.getElementById('prospectPhone').value = '';
    document.getElementById('prospectEmail').value = '';
    document.getElementById('prospectInterest').value = 'General Fitness';
    document.getElementById('prospectFollowup').value = '';
    document.getElementById('prospectNotes').value = '';

    // Remove edit mode data
    document.getElementById('addProspectModal').removeAttribute('data-edit-id');

    showModal('addProspectModal');
}

// Save prospect
function saveProspect() {
    const name = document.getElementById('prospectName').value;
    const phone = document.getElementById('prospectPhone').value;
    const email = document.getElementById('prospectEmail').value;
    const interest = document.getElementById('prospectInterest').value;
    const followupDate = document.getElementById('prospectFollowup').value;
    const notes = document.getElementById('prospectNotes').value;

    if (!name || !phone) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const prospects = Storage.get(Storage.KEYS.PROSPECTS) || [];
    const editId = document.getElementById('addProspectModal').getAttribute('data-edit-id');

    if (editId) {
        // Edit existing prospect
        const index = prospects.findIndex(p => p.id === editId);
        if (index !== -1) {
            prospects[index] = {
                ...prospects[index],
                name,
                phone,
                email,
                interest,
                followupDate,
                notes
            };
        }
    } else {
        // Add new prospect
        const prospect = {
            id: Storage.generateId('PROSPECT'),
            name,
            phone,
            email,
            interest,
            followupDate,
            notes,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        // create prospect on server
        Storage.create(Storage.KEYS.PROSPECTS, prospect).then(created => {
            if (!created) showNotification('Failed to add prospect', 'error');
        });
    }
    closeModal('addProspectModal');
    loadProspects();
    showNotification(editId ? 'Prospect updated successfully' : 'Prospect added successfully', 'success');
}

// Update prospect status
function updateProspectStatus(prospectId) {
    const prospects = Storage.get(Storage.KEYS.PROSPECTS) || [];
    const prospect = prospects.find(p => p.id === prospectId);

    if (!prospect) {
        showNotification('Prospect not found', 'error');
        return;
    }

    const newStatus = prompt(
        `Update status for ${prospect.name}\n\nEnter status:\n- pending\n- contacted\n- converted\n- lost`,
        prospect.status
    );

    if (newStatus && ['pending', 'contacted', 'converted', 'lost'].includes(newStatus.toLowerCase())) {
        prospect.status = newStatus.toLowerCase();
        Storage.set(Storage.KEYS.PROSPECTS, prospects);
        loadProspects();
        showNotification('Status updated successfully', 'success');
    } else if (newStatus !== null) {
        showNotification('Invalid status', 'error');
    }
}

// View prospect notes
function viewProspectNotes(prospectId) {
    const prospects = Storage.get(Storage.KEYS.PROSPECTS) || [];
    const prospect = prospects.find(p => p.id === prospectId);

    if (!prospect) {
        showNotification('Prospect not found', 'error');
        return;
    }

    alert(`Notes for ${prospect.name}\n\n${prospect.notes || 'No notes available'}`);
}

// Delete prospect
function deleteProspect(prospectId) {
    if (!confirm('Are you sure you want to delete this prospect?')) {
        return;
    }

        // delete on server
    Storage.delete(Storage.KEYS.PROSPECTS, prospectId).then(ok => {
        if (ok) {
    if (typeof loadProspects === 'function') { loadProspects(); }
            showNotification('Deleted successfully', 'success');
        } else {
            showNotification('Deletion failed', 'error');
        }
    });loadProspects();
    showNotification('Prospect deleted successfully', 'success');
}