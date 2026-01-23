// QR Code Management

let html5QrCode = null;
let _scannerInitializing = false;

// Initialize QR Scanner
async function initQRScanner() {
    const qrReader = document.getElementById('qrReader');

    if (!qrReader) return;

    // Prevent multiple simultaneous initializations
    if (_scannerInitializing) {
        console.log('Scanner initialization already in progress');
        return;
    }
    _scannerInitializing = true;

    // Stop and clear previous instance if exists
    if (html5QrCode) {
        if (html5QrCode.isScanning) {
            try {
                await html5QrCode.stop();
            } catch (err) {
                console.warn('Stop error (ignored):', err);
            }
        }
        try {
            html5QrCode.clear();
        } catch (e) { /* ignore */ }
        html5QrCode = null;
    }

    // Clear the container to remove any orphaned video elements
    qrReader.innerHTML = '';

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
    ).then(() => {
        _scannerInitializing = false;
    }).catch(err => {
        _scannerInitializing = false;
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
    // Stop scanning (check if actually running first)
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.warn('Stop error:', err));
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
    // Use String comparison since QR code stores string and DB has number
    const member = members.find(m => String(m.id) === String(memberId));

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
        text: String(memberId),
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}