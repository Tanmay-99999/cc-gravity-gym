// Trainer Management

// Flag to prevent duplicate saves
let _savingTrainer = false;

// Load trainers (async to fetch fresh data)
async function loadTrainers() {
    await Storage.refresh(Storage.KEYS.TRAINERS);
    const trainers = Storage.get(Storage.KEYS.TRAINERS) || [];
    const trainersGrid = document.getElementById('trainersGrid');

    if (trainers.length === 0) {
        trainersGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💪</div>
                <h3>No Trainers Added</h3>
                <p>Add your first trainer</p>
            </div>
        `;
        return;
    }

    trainersGrid.innerHTML = trainers.map(trainer => {
        const availability = Array.isArray(trainer.availability) ? trainer.availability : [];

        // Get assigned classes
        const classes = Storage.get(Storage.KEYS.CLASSES) || [];
        const assignedClasses = classes.filter(c => c.trainerId === trainer.id);

        return `
            <div class="trainer-card">
                <div class="trainer-avatar">${trainer.name.charAt(0).toUpperCase()}</div>
                <h3 class="trainer-name">${trainer.name}</h3>
                <p class="trainer-specialization">${trainer.specialization}</p>
                <p class="trainer-contact">📧 ${trainer.email}</p>
                <p class="trainer-contact">📞 ${trainer.phone}</p>
                ${trainer.bio ? `<p class="trainer-bio">${trainer.bio}</p>` : ''}
                ${trainer.certifications ? `
                    <div class="trainer-certifications">
                        <strong>Certifications:</strong><br>
                        ${trainer.certifications}
                    </div>
                ` : ''}
                <div class="trainer-availability">
                    <h4>Available Days</h4>
                    <div class="availability-days">
                        ${availability.map(day => `<span class="day-badge">${day}</span>`).join('')}
                    </div>
                </div>
                <p class="text-muted text-sm">Assigned Classes: ${assignedClasses.length}</p>
                ${hasPermission('all') ? `
                    <div class="trainer-actions">
                        <button class="btn btn-primary btn-sm btn-block" data-action="editTrainer" data-id="${trainer.id}">Edit</button>
                        <button class="btn btn-danger btn-sm btn-block" data-action="deleteTrainer" data-id="${trainer.id}">Delete</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Show add trainer modal
function showAddTrainerModal() {
    // Reset save guard in case it was stuck
    _savingTrainer = false;

    // Only the default admin can create trainers
    if (!isDefaultAdmin()) {
        showNotification('Only the default admin (Tanmay9999) can add trainers', 'error');
        return;
    }
    // Clear form
    document.getElementById('trainerName').value = '';
    document.getElementById('trainerEmail').value = '';
    document.getElementById('trainerPhone').value = '';
    document.getElementById('trainerSpecialization').value = '';
    document.getElementById('trainerCertifications').value = '';
    document.getElementById('trainerBio').value = '';

    // Clear all checkboxes
    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });

    // Remove edit mode data
    document.getElementById('addTrainerModal').removeAttribute('data-edit-id');

    showModal('addTrainerModal');
}

// Save trainer
function saveTrainer() {
    const name = document.getElementById('trainerName').value;
    const email = document.getElementById('trainerEmail').value;
    const phone = document.getElementById('trainerPhone').value;
    const specialization = document.getElementById('trainerSpecialization').value;
    const certifications = document.getElementById('trainerCertifications').value;
    const bio = document.getElementById('trainerBio').value;

    // Get selected days
    const availability = Array.from(
        document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    if (!name || !email || !phone) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Prevent duplicate saves
    if (_savingTrainer) {
        console.log('Trainer save in progress, ignoring');
        return;
    }
    _savingTrainer = true;

    const trainers = Storage.get(Storage.KEYS.TRAINERS) || [];
    const editId = document.getElementById('addTrainerModal').getAttribute('data-edit-id');

    if (editId) {
        // Edit existing trainer
        const index = trainers.findIndex(t => t.id === editId);
        if (index !== -1) {
            trainers[index] = {
                ...trainers[index],
                name,
                email,
                phone,
                specialization,
                certifications,
                bio,
                availability
            };
        }
    } else {
        // Add new trainer
        const trainer = {
            id: Storage.generateId('trainer'),
            name,
            email,
            phone,
            specialization,
            certifications,
            bio,
            availability,
            createdAt: new Date().toISOString()
        };
        // create trainer on server
        Storage.create(Storage.KEYS.TRAINERS, trainer).then(created => {
            _savingTrainer = false;
            if (!created) {
                showNotification('Failed to add trainer', 'error');
            } else {
                closeModal('addTrainerModal');
                loadTrainers();
                showNotification('Trainer added successfully', 'success');
            }
        }).catch(err => {
            _savingTrainer = false;
            console.error('Save trainer failed', err);
        });
        return; // Exit early, async handling above
    }
    _savingTrainer = false;
    closeModal('addTrainerModal');
    loadTrainers();
    showNotification(editId ? 'Trainer updated successfully' : 'Trainer added successfully', 'success');
}

// Edit trainer
function editTrainer(trainerId) {
    const trainers = Storage.get(Storage.KEYS.TRAINERS) || [];
    const trainer = trainers.find(t => String(t.id) === String(trainerId));

    if (!trainer) {
        showNotification('Trainer not found', 'error');
        return;
    }

    document.getElementById('trainerName').value = trainer.name;
    document.getElementById('trainerEmail').value = trainer.email;
    document.getElementById('trainerPhone').value = trainer.phone;
    document.getElementById('trainerSpecialization').value = trainer.specialization || '';
    document.getElementById('trainerCertifications').value = trainer.certifications || '';
    document.getElementById('trainerBio').value = trainer.bio || '';

    // Set availability checkboxes
    document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
        cb.checked = trainer.availability && trainer.availability.includes(cb.value);
    });

    // Set edit mode
    document.getElementById('addTrainerModal').setAttribute('data-edit-id', trainerId);

    showModal('addTrainerModal');
}

// Delete trainer
function deleteTrainer(trainerId) {
    // Check if trainer has assigned classes
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const assignedClasses = classes.filter(c => c.trainerId === trainerId);

    if (assignedClasses.length > 0) {
        if (!confirm(`This trainer has ${assignedClasses.length} assigned class(es). Are you sure you want to delete?`)) {
            return;
        }
    }

    if (!confirm('Are you sure you want to delete this trainer?')) {
        return;
    }

    // delete on server
    Storage.delete(Storage.KEYS.TRAINERS, trainerId).then(ok => {
        if (ok) {
            if (typeof loadTrainers === 'function') { loadTrainers(); }
            showNotification('Deleted successfully', 'success');
        } else {
            showNotification('Deletion failed', 'error');
        }
    }); loadTrainers();
    showNotification('Trainer deleted successfully', 'success');
}