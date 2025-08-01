// DOM Elements
const getConfigBtn = document.querySelector('.get-btn');
const wireGuardConfig = document.querySelector('.wire-guard-config');
const amneziaWgConfig = document.querySelector('.amnezia-wg-config');
const v2rayConfig = document.querySelector('.v2ray-config');
const spinnerElement = document.querySelector('.spinner');

// Constants
const RANDOM_STRING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Tab elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

// State for active tab
let activeTab = 'wireguard';

// --- Tab Switching Logic ---
const updateActiveTabStyles = () => {
    // Deactivate all tab buttons
    tabButtons.forEach(button => {
        button.classList.remove('active-tab', 'border-blue-600', 'text-blue-300'); // Removed light/dark prefixes
        button.classList.add('border-transparent', 'text-gray-400'); // Removed light/dark prefixes
    });

    // Activate current active tab button
    const currentActiveButton = document.querySelector(`.tab-button[data-tab="${activeTab}"]`);
    if (currentActiveButton) {
        currentActiveButton.classList.remove('border-transparent', 'text-gray-400'); // Removed light/dark prefixes
        currentActiveButton.classList.add('active-tab', 'border-blue-600', 'text-blue-300'); // Removed light/dark prefixes
    }
};

// Initialize active tab button style on load
updateActiveTabStyles();

// Initial setup of tab display
document.getElementById(`${activeTab}-panel`).classList.remove('hidden');
document.getElementById(`${activeTab}-panel`).classList.add('active');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Hide all panels
        tabPanels.forEach(panel => {
            panel.classList.remove('active');
            panel.classList.add('hidden');
        });

        // Show target panel
        const targetPanel = document.getElementById(`${targetTab}-panel`);
        if (targetPanel) {
            targetPanel.classList.remove('hidden');
            targetPanel.classList.add('active');
        }

        activeTab = targetTab;
        updateActiveTabStyles();
    });
});

// --- Main Config Generation Logic ---
getConfigBtn.addEventListener('click', async () => {
    getConfigBtn.disabled = true;
    getConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Generating...';
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
        getConfigBtn.innerHTML = '<i class="fas fa-wrench mr-2"></i> Get Free Config';

        const wireguardTabButton = document.querySelector('.tab-button[data-tab="wireguard"]');
        if (wireguardTabButton) {
            wireguardTabButton.click();
            setTimeout(() => {
                const configSection = document.querySelector('.tab-content-container');
                if (configSection) {
                    configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
        }
    }
});

const fetchKeys = async () => {
    try {
        const response = await fetch('https://www.iranguard.workers.dev/keys');
        if (!response.ok) {
            throw new Error(`Failed to fetch keys: ${response.status} ${response.statusText}`);
        }
        return response.text().then(data => ({
            publicKey: extractKey(data, 'PublicKey'),
            privateKey: extractKey(data, 'PrivateKey'),
        }));
    } catch (error) {
        console.error('Error fetching keys:', error);
        throw error;
    }
};

const extractKey = (data, keyName) =>
    data.match(new RegExp(`${keyName}:\\s(.+)`))?.[1].trim() || null;

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
        if (!response.ok) {
            throw new Error(`Failed to fetch account: ${response.status} ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        console.error('Error fetching account:', error);
        throw error;
    }
};

const fetchRandomEndpoint = async () => {
    const fallbackEndpoint = 'engage.cloudflareclient.com:2408';
    try {
        const res = await fetch('https://raw.githubusercontent.com/ircfspace/endpoint/refs/heads/main/ip.json');
        if (!res.ok) {
            throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        if (!Array.isArray(data.ipv4) || data.ipv4.length === 0) {
            throw new Error("No IPv4 addresses available");
        }
        return data.ipv4[Math.floor(Math.random() * data.ipv4.length)];
    } catch (e) {
        console.warn("Falling back to default endpoint due to error:", e);
        return fallbackEndpoint;
    }
};

const generateConfig = async (data, privateKey) => {
    const reserved = generateReserved(data.config.client_id);
    const endpoint = await fetchRandomEndpoint();

    const wireGuardText = generateWireGuardConfig(data, privateKey, endpoint);
    const amneziaWgText = generateAmneziaWgConfig(data, privateKey, endpoint);
    const v2rayText = generateV2RayURL(
        privateKey,
        data.config.peers[0].public_key,
        data.config.interface.addresses.v4,
        data.config.interface.addresses.v6,
        reserved,
        endpoint
    );

    updateDOM(wireGuardConfig, 'WireGuard Format', 'wireguardBox', wireGuardText, 'message1');
    updateDOM(amneziaWgConfig, 'Amnezia-Wg Format', 'AmneziaWgBox', amneziaWgText, 'message2');
    updateDOM(v2rayConfig, 'V2Ray Format', 'v2rayBox', v2rayText, 'message3');

    document.querySelectorAll('.copy-button').forEach(btn => {
        btn.addEventListener('click', handleCopyButtonClick);
    });

    document.querySelectorAll('.download-config-button').forEach(btn => {
        btn.addEventListener('click', handleDownloadButtonClick);
    });
};

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

const generateAmneziaWgConfig = (data, privateKey, endpoint) => `
[Interface]
Address = ${data.config.interface.addresses.v4}/32, ${data.config.interface.addresses.v6}/128
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280
Jc = 4
Jmin = 16
Jmax = 256
PrivateKey = ${privateKey}

[Peer]
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${endpoint}
PublicKey = ${data.config.peers[0].public_key}
`;

const generateReserved = (clientId) =>
    Array.from(atob(clientId))
        .map((char) => char.charCodeAt(0))
        .slice(0, 3)
        .join('%2C');

const generateV2RayURL = (privateKey, publicKey, ipv4, ipv6, reserved, endpoint) =>
    `wireguard://${encodeURIComponent(privateKey)}@${endpoint}?address=${encodeURIComponent(
        ipv4 + '/32'
    )},${encodeURIComponent(ipv6 + '/128')}&reserved=${reserved}&publickey=${encodeURIComponent(
        publicKey
    )}&mtu=1420#V2ray-Config`;

const updateDOM = (container, title, textareaId, content, messageId) => {
    const fileName = title.replace(/\s/g, '') + '.conf';


    const buttonBaseClasses = "w-full sm:w-auto py-2 px-4 font-semibold rounded-lg cursor-pointer text-base my-2 mx-1 shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-all duration-200 flex items-center justify-center";

    let buttonsHtml = `
        <button class="copy-button ${buttonBaseClasses} bg-green-600 text-white hover:bg-green-700 focus:ring-green-400" data-target="${textareaId}" data-message="${messageId}">
            <i class="fas fa-copy mr-2"></i> Copy Config
        </button>
    `;

    if (title !== 'V2Ray Format') {
        buttonsHtml += `
            <button class="download-config-button ${buttonBaseClasses} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400" data-target="${textareaId}" data-filename="${fileName}">
                <i class="fas fa-download mr-2"></i> Download Config
            </button>
        `;
    }

    container.innerHTML = `
        <textarea id="${textareaId}" class="config-box w-full h-48 md:h-40 sm:h-32 border border-gray-700 rounded-lg p-3 resize-none mb-4 font-mono text-sm leading-6 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-opacity duration-500 box-border bg-gray-900 text-green-300" readonly>${content.trim()}</textarea>
        <div class="flex flex-wrap justify-center sm:flex-col items-center -mx-1 mb-4">
            ${buttonsHtml}
        </div>
        <p id="${messageId}" class="message h-5 my-1 text-green-500 font-bold text-sm invisible" aria-live="polite"></p>
    `;

    setTimeout(() => {
        const textAreaElement = document.getElementById(textareaId);
        if (textAreaElement) {
            textAreaElement.classList.add('opacity-100');
        }
    }, 100);

    if (textareaId === 'v2rayBox') {
        const v2rayTextArea = document.getElementById('v2rayBox');
        if (v2rayTextArea) {
            v2rayTextArea.classList.remove('h-48', 'md:h-40', 'sm:h-32');
            v2rayTextArea.classList.add('h-24', 'md:h-32', 'sm:h-16');
        }
    }
};

const showSpinner = () => {
    if (spinnerElement) spinnerElement.style.display = 'block';
};

const hideSpinner = () => {
    if (spinnerElement) spinnerElement.style.display = 'none';
};

const handleCopyButtonClick = async function () {
    const targetId = this.getAttribute('data-target');
    const messageId = this.getAttribute('data-message');
    try {
        const textArea = document.getElementById(targetId);
        if (textArea) {
            await navigator.clipboard.writeText(textArea.value);
            showPopup('Config copied successfully!', 'success');
            showCopyMessage(messageId, 'Copied!');
        } else {
            throw new Error('Textarea element not found for copying.');
        }
    } catch (error) {
        console.error('Copy failed:', error);
        showPopup('Failed to copy, please try again.', 'error');
        showCopyMessage(messageId, 'Failed to copy');
    }
};

const handleDownloadButtonClick = function() {
    const targetId = this.getAttribute('data-target');
    const fileName = this.getAttribute('data-filename');
    const textArea = document.getElementById(targetId);
    if (textArea && textArea.value) {
        downloadConfig(fileName, textArea.value);
        showPopup('Configuration file downloaded!', 'success');
    } else {
        showPopup('No configuration available to download.', 'error');
    }
};

const showCopyMessage = (messageId, message) => {
    const messageElement = document.getElementById(messageId);
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.classList.remove('invisible');
        messageElement.classList.add('visible');
        setTimeout(() => {
            messageElement.classList.remove('visible');
            messageElement.classList.add('invisible');
            messageElement.textContent = '';
        }, 2000);
    }
};

const showPopup = (message, type = 'success') => {
    const popup = document.createElement('div');
    popup.className = `popup-message fixed top-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-xl z-50 font-bold ${type === 'error' ? 'bg-red-700' : 'bg-green-600'} text-white`; // Removed dark: prefixes
    popup.textContent = message;
    document.body.appendChild(popup);
    setTimeout(() => {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 2500);
};

const generateRandomString = (length) =>
    Array.from({ length }, () =>
        RANDOM_STRING_CHARS.charAt(
            Math.floor(Math.random() * RANDOM_STRING_CHARS.length)
        )
    ).join('');

const downloadConfig = (fileName, content) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'application/octet-stream' });
    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
};
