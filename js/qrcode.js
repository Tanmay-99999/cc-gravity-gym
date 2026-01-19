// QR Code Management

let html5QrCode = null;

// Initialize QR Scanner
function initQRScanner() {
    const qrReader = document.getElementById('qrReader');
    
    if (!qrReader) return;

    // Clear previous instance
    if (html5QrCode) {
        html5QrCode.stop().catch(err => console.error(err));
    }

    // Initialize scanner
    html5QrCode = new Html5Qrcode("qrReader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 }
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
    ).catch(err => {
        console.error('Scanner error:', err);
        document.getElementById('scanResult').innerHTML = `
            <div class="scan-error">
                <p>Unable to access camera</p>
                <p class="text-sm">Please allow camera permissions</p>
            </div>
        `;
    });
}

// On successful scan
function onScanSuccess(decodedText, decodedResult) {
    // Stop scanning
    if (html5QrCode) {
        html5QrCode.stop();
    }

    // Process the scanned member ID
    processMemberQRCode(decodedText);
}

// On scan error (ignore)
function onScanError(errorMessage) {
    // Ignore errors - they happen frequently during scanning
}

// Process scanned QR code
function processMemberQRCode(memberId) {
    const members = Storage.get(Storage.KEYS.MEMBERS) || [];
    const member = members.find(m => m.id === memberId);

    const resultContainer = document.getElementById('scanResult');

    if (!member) {
        resultContainer.innerHTML = `
            <div class="scan-error">
                <h3>❌ Invalid QR Code</h3>
                <p>Member not found</p>
                <button class="btn btn-primary" data-action="restartScanner">Scan Again</button>
            </div>
        `;
        return;
    }

    const status = getMembershipStatus(member.expiryDate);
    const canCheckin = status === 'active';

    if (canCheckin) {
        // Perform automatic check-in
        performCheckin(memberId);
        
        resultContainer.innerHTML = `
            <div class="scan-success">
                <h3>✅ Check-in Successful</h3>
                <h2>${member.name}</h2>
                <p>Member ID: ${member.id}</p>
                <p>Plan: ${member.planName}</p>
                <p>Valid until: ${formatDate(member.expiryDate)}</p>
                <button class="btn btn-primary" data-action="restartScanner">Scan Next</button>
            </div>
        `;
    } else {
        resultContainer.innerHTML = `
            <div class="scan-error">
                <h3>❌ Cannot Check In</h3>
                <h2>${member.name}</h2>
                <p>Membership Status: <span class="status-badge status-${status}">${status}</span></p>
                <p>Expired on: ${formatDate(member.expiryDate)}</p>
                <button class="btn btn-primary" data-action="restartScanner">Scan Again</button>
            </div>
        `;
    }
}

// Restart scanner
function restartScanner() {
    document.getElementById('scanResult').innerHTML = '';
    initQRScanner();
}

// Generate QR code for member (used in member details modal)
function generateMemberQRCode(memberId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    
    new QRCode(container, {
        text: memberId,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}