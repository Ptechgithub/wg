// DOM Elements
const getConfigBtn = document.querySelector('.get-btn');
const downloadBtn = document.querySelector('.download-btn');
const wireGuardConfig = document.querySelector('.wire-guard-config');
const v2rayConfig = document.querySelector('.v2ray-config');
const container = document.querySelector('.container');

// Event: Generate Config
getConfigBtn.addEventListener('click', async () => {
    getConfigBtn.disabled = true;
    getConfigBtn.textContent = 'Generating...';
    try {
        showSpinner();
        const { publicKey, privateKey } = await fetchKeys();
        const installId = generateRandomString(22);
        const fcmToken = `${installId}:APA91b${generateRandomString(134)}`;
        const accountData = await fetchAccount(publicKey, installId, fcmToken);
        if (accountData) await generateConfig(accountData, privateKey);
    } catch (error) {
        console.error('Error processing configuration:', error);
        showPopup('Failed to generate config. Please try again.', 'error');
    } finally {
        hideSpinner();
        getConfigBtn.disabled = false;
        getConfigBtn.textContent = 'Get Free Config';
        setTimeout(() => {
            if (wireGuardConfig.firstChild) {
                wireGuardConfig.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    }
});

// Fetch Key Pair
const fetchKeys = async () => {
    try {
        const response = await fetch('https://www.iranguard.workers.dev/keys');
        if (!response.ok) throw new Error(`Failed to fetch keys: ${response.status}`);
        const data = await response.text();
        return {
            publicKey: extractKey(data, 'PublicKey'),
            privateKey: extractKey(data, 'PrivateKey'),
        };
    } catch (error) {
        console.error('Error fetching keys:', error);
        throw error;
    }
};

// Extract key from text
const extractKey = (data, keyName) =>
    data.match(new RegExp(`${keyName}:\\s(.+)`))?.[1].trim() || null;

// Fetch Account Config
const fetchAccount = async (publicKey, installId, fcmToken) => {
    const apiUrl = 'https://www.iranguard.workers.dev/wg';
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'User-Agent': 'okhttp/3.12.1',
                'CF-Client-Version': 'a-6.10-2158',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                key: publicKey,
                install_id: installId,
                fcm_token: fcmToken,
                tos: new Date().toISOString(),
                model: 'PC',
                serial_number: installId,
                locale: 'de_DE',
            }),
        });
        if (!response.ok) throw new Error(`Failed to fetch account: ${response.status}`);
        return response.json();
    } catch (error) {
        console.error('Error fetching account:', error);
        throw error;
    }
};

// Fetch random IPv4 endpoint
const fetchRandomEndpoint = async () => {
    const fallback = 'engage.cloudflareclient.com:2408';
    try {
        const res = await fetch('https://raw.githubusercontent.com/ircfspace/endpoint/refs/heads/main/ip.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data.ipv4) || data.ipv4.length === 0) throw new Error("No IPv4 available");
        const random = data.ipv4[Math.floor(Math.random() * data.ipv4.length)];
        return random;
    } catch (e) {
        console.warn("Falling back to default endpoint:", e);
        return fallback;
    }
};

// Generate Config and Update UI
const generateConfig = async (data, privateKey) => {
    const reserved = generateReserved(data.config.client_id);
    const endpoint = await fetchRandomEndpoint();

    const wireGuardText = generateWireGuardConfig(data, privateKey, endpoint);
    const v2rayText = generateV2RayURL(
        privateKey,
        data.config.peers[0].public_key,
        data.config.interface.addresses.v4,
        data.config.interface.addresses.v6,
        reserved,
        endpoint
    );

    updateDOM(wireGuardConfig, 'WireGuard Format', 'wireguardBox', wireGuardText, 'message1');
    updateDOM(v2rayConfig, 'V2Ray Format', 'v2rayBox', v2rayText, 'message2');
    downloadBtn.style.display = 'block';

    document.querySelectorAll('.copy-button').forEach(btn => {
        btn.addEventListener('click', handleCopyButtonClick);
    });
};

// WireGuard Config Template
const generateWireGuardConfig = (data, privateKey, endpoint) => `
[Interface]
PrivateKey = ${privateKey}
Address = ${data.config.interface.addresses.v4}/32, ${data.config.interface.addresses.v6}/128
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280

[Peer]
PublicKey = ${data.config.peers[0].public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${endpoint}
`;

// Reserved parameter
const generateReserved = (clientId) =>
    Array.from(atob(clientId))
        .map((char) => char.charCodeAt(0))
        .slice(0, 3)
        .join('%2C');

// Generate V2Ray URL
const generateV2RayURL = (privateKey, publicKey, ipv4, ipv6, reserved, endpoint) =>
    `wireguard://${encodeURIComponent(privateKey)}@${endpoint}?address=${encodeURIComponent(
        ipv4 + '/32'
    )},${encodeURIComponent(ipv6 + '/128')}&reserved=${reserved}&publickey=${encodeURIComponent(
        publicKey
    )}&mtu=1420#V2ray-Config`;

// Update Config Boxes in UI
const updateDOM = (container, title, textareaId, content, messageId) => {
    container.innerHTML = `
        <h2>${title}</h2>
        <textarea id="${textareaId}" class="config-box visible" readonly>${content.trim()}</textarea>
        <button class="copy-button" data-target="${textareaId}" data-message="${messageId}">Copy ${title} Config</button>
        <p id="${messageId}" class="message" aria-live="polite"></p>
    `;
};

// Spinner Show/Hide
const showSpinner = () => {
    const spinner = document.querySelector('.spinner');
    if (spinner) spinner.style.display = 'block';
};
const hideSpinner = () => {
    const spinner = document.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
};

// Handle Copy
const handleCopyButtonClick = async function () {
    const targetId = this.getAttribute('data-target');
    const messageId = this.getAttribute('data-message');
    try {
        const textArea = document.getElementById(targetId);
        await navigator.clipboard.writeText(textArea.value);
        showPopup('Config copied successfully!');
        showCopyMessage(messageId, 'Copied!');
    } catch (error) {
        console.error('Copy failed:', error);
        showPopup('Failed to copy, please try again.', 'error');
        showCopyMessage(messageId, 'Failed to copy');
    }
};

// Show Copy Message
const showCopyMessage = (messageId, message) => {
    const messageElement = document.getElementById(messageId);
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.classList.add('visible');
        setTimeout(() => {
            messageElement.classList.remove('visible');
            messageElement.textContent = '';
        }, 2000);
    }
};

// Show Popup Message
const showPopup = (message, type = 'success') => {
    const popup = document.createElement('div');
    popup.className = 'popup-message';
    popup.textContent = message;
    if (type === 'error') popup.style.backgroundColor = '#d32f2f';
    document.body.appendChild(popup);
    setTimeout(() => {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 2500);
};

// Generate Random String
const generateRandomString = (length) =>
    Array.from({ length }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
            Math.floor(Math.random() * 62)
        )
    ).join('');

// Download Config Button
downloadBtn.addEventListener('click', () => {
    const content = document.querySelector('#wireguardBox')?.value || "No configuration available";
    if (content === "No configuration available") {
        showPopup('No configuration to download', 'error');
        return;
    }
    downloadConfig('wireguard.conf', content);
    showPopup('Configuration file downloaded');
});

// Download Config File
const downloadConfig = (fileName, content) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};

// Responsive UI
function checkViewportSize() {
    if (window.innerWidth <= 480) {
        container.style.padding = '15px';
    } else if (window.innerWidth <= 768) {
        container.style.padding = '20px';
    } else {
        container.style.padding = '32px';
    }
}
window.addEventListener('load', checkViewportSize);
window.addEventListener('resize', checkViewportSize);