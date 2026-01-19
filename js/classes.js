// Class Management

// Load classes
function loadClasses() {
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const classesGrid = document.getElementById('classesGrid');

    if (classes.length === 0) {
        classesGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h3>No Classes Scheduled</h3>
                <p>Schedule your first class</p>
            </div>
        `;
        return;
    }

    // Sort classes by date and time
    classes.sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));

    classesGrid.innerHTML = classes.map(cls => {
        const bookings = Storage.get(Storage.KEYS.BOOKINGS) || [];
        const classBookings = bookings.filter(b => b.classId === cls.id);
        const bookedCount = classBookings.length;
        const fillPercentage = (bookedCount / cls.capacity) * 100;
        const isFull = bookedCount >= cls.capacity;
        const isPast = new Date(cls.date + ' ' + cls.time) < new Date();

        // Check if current user has booked
        const userBooked = currentUser.role === 'member' && 
            classBookings.some(b => b.memberId === currentUser.username);

        return `
            <div class="class-card">
                <div class="class-header">
                    <div>
                        <h3 class="class-title">${cls.title}</h3>
                        <div class="class-datetime">
                            📅 ${formatDate(cls.date)} at ${formatTime(cls.time)}
                        </div>
                        <div class="class-trainer">👤 ${cls.trainerName} • ${cls.duration} min</div>
                    </div>
                    <span class="class-status ${isFull ? 'full' : 'available'}">
                        ${isFull ? 'Full' : 'Available'}
                    </span>
                </div>
                <p class="class-description">${cls.description || 'No description available'}</p>
                <div class="class-capacity">
                    <div class="capacity-bar">
                        <div class="capacity-fill" style="width: ${fillPercentage}%"></div>
                    </div>
                    <span class="capacity-text">${bookedCount}/${cls.capacity}</span>
                </div>
                <div class="class-actions">
                    ${!isPast && currentUser.role === 'member' ? 
                        (userBooked ? 
                            `<button class="btn btn-danger btn-sm" data-action="cancelBooking" data-id="${cls.id}">Cancel Booking</button>` :
                            `<button class="btn btn-primary btn-sm" data-action="bookClass" data-id="${cls.id}" ${isFull ? 'disabled' : ''}>
                                ${isFull ? 'Join Waitlist' : 'Book Now'}
                            </button>`
                        ) : ''
                    }
                    ${hasPermission('all') || hasPermission('manage_own_classes') ? 
                        `<button class="btn btn-secondary btn-sm" data-action="viewClassDetails" data-id="${cls.id}">View Details</button>
                         <button class="btn btn-danger btn-sm" data-action="deleteClass" data-id="${cls.id}">Delete</button>` : 
                        ''
                    }
                </div>
            </div>
        `;
    }).join('');
}

// Format time
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

// Show add class modal
function showAddClassModal() {
    // Only the default admin can schedule classes
    if (!isDefaultAdmin()) {
        showNotification('Only the default admin (Tanmay9999) can schedule classes', 'error');
        return;
    }
    // Load trainers into select
    const trainers = Storage.get(Storage.KEYS.TRAINERS) || [];
    const trainerSelect = document.getElementById('classTrainer');
    trainerSelect.innerHTML = trainers.map(trainer => 
        `<option value="${trainer.id}">${trainer.name} - ${trainer.specialization}</option>`
    ).join('');

    // Clear form
    document.getElementById('classTitle').value = '';
    document.getElementById('classDate').value = '';
    document.getElementById('classTime').value = '';
    document.getElementById('classDuration').value = '60';
    document.getElementById('classCapacity').value = '20';
    document.getElementById('classDescription').value = '';

    showModal('addClassModal');
}

// Save class
function saveClass() {
    const title = document.getElementById('classTitle').value;
    const date = document.getElementById('classDate').value;
    const time = document.getElementById('classTime').value;
    const duration = parseInt(document.getElementById('classDuration').value);
    const capacity = parseInt(document.getElementById('classCapacity').value);
    const trainerId = document.getElementById('classTrainer').value;
    const description = document.getElementById('classDescription').value;

    if (!title || !date || !time || !trainerId) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const trainers = Storage.get(Storage.KEYS.TRAINERS) || [];
    const trainer = trainers.find(t => t.id === trainerId);

    if (!trainer) {
        showNotification('Invalid trainer selected', 'error');
        return;
    }

    const classObj = {
        id: Storage.generateId('CLASS'),
        title,
        date,
        time,
        duration,
        capacity,
        trainerId,
        trainerName: trainer.name,
        description,
        createdAt: new Date().toISOString()
    };

    // Create CLASSES on server
        Storage.create(Storage.KEYS.CLASSES, classObj).then(created => { if(!created) console.warn('Create failed for CLASSES'); });

    closeModal('addClassModal');
    loadClasses();
    showNotification('Class scheduled successfully', 'success');
}

// Book class
function bookClass(classId) {
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const classObj = classes.find(c => c.id === classId);

    if (!classObj) {
        showNotification('Class not found', 'error');
        return;
    }

    const bookings = Storage.get(Storage.KEYS.BOOKINGS) || [];
    const classBookings = bookings.filter(b => b.classId === classId);

    // Check if already booked
    const alreadyBooked = bookings.some(b => 
        b.classId === classId && b.memberId === currentUser.username
    );

    if (alreadyBooked) {
        showNotification('You have already booked this class', 'warning');
        return;
    }

    // Check capacity
    if (classBookings.length >= classObj.capacity) {
        // Add to waitlist
        const booking = {
            id: Storage.generateId('BOOK'),
            classId,
            className: classObj.title,
            classDate: classObj.date,
            classTime: classObj.time,
            memberId: currentUser.username,
            memberName: currentUser.name,
            status: 'waitlist',
            bookedAt: new Date().toISOString()
        };
        bookings.push(booking);
        Storage.set(Storage.KEYS.BOOKINGS, bookings);
        showNotification('Added to waitlist', 'info');
    } else {
        // Book the class
        const booking = {
            id: Storage.generateId('BOOK'),
            classId,
            className: classObj.title,
            classDate: classObj.date,
            classTime: classObj.time,
            memberId: currentUser.username,
            memberName: currentUser.name,
            status: 'confirmed',
            bookedAt: new Date().toISOString()
        };
        bookings.push(booking);
        Storage.set(Storage.KEYS.BOOKINGS, bookings);
        showNotification('Class booked successfully!', 'success');
    }

    loadClasses();
}

// Cancel booking
function cancelBooking(classId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }

    const bookings = Storage.get(Storage.KEYS.BOOKINGS) || [];
    const filtered = bookings.filter(b => 
        !(b.classId === classId && b.memberId === currentUser.username)
    );

    // Check if there are waitlisted bookings
    const classBookings = filtered.filter(b => b.classId === classId);
    const waitlisted = classBookings.filter(b => b.status === 'waitlist');

    // Promote first waitlisted booking if exists
    if (waitlisted.length > 0) {
        const firstWaitlisted = waitlisted[0];
        const index = filtered.findIndex(b => b.id === firstWaitlisted.id);
        if (index !== -1) {
            filtered[index].status = 'confirmed';
            showNotification('Booking cancelled. Waitlisted member promoted.', 'info');
        }
    } else {
        showNotification('Booking cancelled', 'success');
    }

    Storage.set(Storage.KEYS.BOOKINGS, filtered);
    loadClasses();
}

// View class details
function viewClassDetails(classId) {
    const classes = Storage.get(Storage.KEYS.CLASSES) || [];
    const classObj = classes.find(c => c.id === classId);
    const bookings = Storage.get(Storage.KEYS.BOOKINGS) || [];
    const classBookings = bookings.filter(b => b.classId === classId);

    if (!classObj) {
        showNotification('Class not found', 'error');
        return;
    }

    const confirmedBookings = classBookings.filter(b => b.status === 'confirmed');
    const waitlistBookings = classBookings.filter(b => b.status === 'waitlist');

    alert(`Class: ${classObj.title}
Date: ${formatDate(classObj.date)} at ${formatTime(classObj.time)}
Trainer: ${classObj.trainerName}
Duration: ${classObj.duration} minutes
Capacity: ${classObj.capacity}

Confirmed Bookings: ${confirmedBookings.length}
Waitlist: ${waitlistBookings.length}

Confirmed Members:
${confirmedBookings.map(b => '• ' + b.memberName).join('\n')}

${waitlistBookings.length > 0 ? '\nWaitlist:\n' + waitlistBookings.map(b => '• ' + b.memberName).join('\n') : ''}`);
}

// Delete class
function deleteClass(classId) {
    if (!confirm('Are you sure you want to delete this class? All bookings will be cancelled.')) {
        return;
    }

        // delete on server
    Storage.delete(Storage.KEYS.CLASSES, classId).then(ok => {
        if (ok) {
    if (typeof loadClasses === 'function') { loadClasses(); }
            showNotification('Deleted successfully', 'success');
        } else {
            showNotification('Deletion failed', 'error');
        }
    });// Remove all bookings for this class
    const bookings = Storage.get(Storage.KEYS.BOOKINGS) || [];
    const filteredBookings = bookings.filter(b => b.classId !== classId);
    Storage.set(Storage.KEYS.BOOKINGS, filteredBookings);

    loadClasses();
    showNotification('Class deleted successfully', 'success');
}