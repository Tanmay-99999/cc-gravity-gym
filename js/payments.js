// Payment Management

let currentPaymentMember = null;
let currentPaymentPlan = null;

// Show payment modal
function showPaymentModal(member, plan) {
    currentPaymentMember = member;
    currentPaymentPlan = plan;

    // Calculate amount
    const baseAmount = plan.price;
    const discount = plan.discount || 0;
    const discountAmount = (baseAmount * discount) / 100;
    const totalAmount = baseAmount - discountAmount;

    // Populate payment details
    document.getElementById('paymentMemberName').textContent = member.name;
    document.getElementById('paymentPlanName').textContent = plan.name;
    document.getElementById('paymentDuration').textContent = getDurationLabel(plan.duration);
    document.getElementById('paymentBaseAmount').textContent = formatCurrency(baseAmount);
    document.getElementById('paymentDiscount').textContent = discount > 0 ? 
        `${discount}% (${formatCurrency(discountAmount)})` : 'None';
    document.getElementById('paymentTotal').textContent = formatCurrency(totalAmount);

    // Clear form
    document.getElementById('paymentMethod').value = 'cash';
    document.getElementById('paymentNotes').value = '';

    showModal('paymentModal');
}

// Get duration label
function getDurationLabel(duration) {
    const labels = {
        'monthly': '1 Month',
        'quarterly': '3 Months',
        'yearly': '12 Months'
    };
    return labels[duration] || duration;
}

// Confirm payment
function confirmPayment() {
    if (!currentPaymentMember || !currentPaymentPlan) {
        showNotification('Payment information missing', 'error');
        return;
    }

    const method = document.getElementById('paymentMethod').value;
    const notes = document.getElementById('paymentNotes').value;

    // Calculate amount
    const baseAmount = currentPaymentPlan.price;
    const discount = currentPaymentPlan.discount || 0;
    const discountAmount = (baseAmount * discount) / 100;
    const totalAmount = baseAmount - discountAmount;

    // Create payment record
    const payment = {
        id: Storage.generateId('PAY'),
        memberId: currentPaymentMember.id,
        memberName: currentPaymentMember.name,
        planId: currentPaymentPlan.id,
        planName: currentPaymentPlan.name,
        amount: totalAmount,
        baseAmount: baseAmount,
        discount: discount,
        method: method,
        notes: notes,
        date: new Date().toISOString(),
        status: 'completed'
    };

    // Save payment
    // Create PAYMENTS on server
        Storage.create(Storage.KEYS.PAYMENTS, payment).then(created => { if(!created) console.warn('Create failed for PAYMENTS'); });

    closeModal('paymentModal');
    showNotification('Payment processed successfully!', 'success');

    // Reload members table
    loadMembers();

    // Reset current payment data
    currentPaymentMember = null;
    currentPaymentPlan = null;
}

// Get total revenue
function getTotalRevenue() {
    const payments = Storage.get(Storage.KEYS.PAYMENTS) || [];
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

// Get revenue for current month
function getMonthRevenue() {
    const payments = Storage.get(Storage.KEYS.PAYMENTS) || [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return payments
        .filter(payment => {
            const paymentDate = new Date(payment.date);
            return paymentDate.getMonth() === currentMonth && 
                   paymentDate.getFullYear() === currentYear;
        })
        .reduce((sum, payment) => sum + payment.amount, 0);
}

// Get revenue breakdown by plan
function getRevenueByPlan() {
    const payments = Storage.get(Storage.KEYS.PAYMENTS) || [];
    const breakdown = {};

    payments.forEach(payment => {
        if (breakdown[payment.planName]) {
            breakdown[payment.planName] += payment.amount;
        } else {
            breakdown[payment.planName] = payment.amount;
        }
    });

    return breakdown;
}