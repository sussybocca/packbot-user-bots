// BotAI – pure frontend logic using patterns from logic.txt
// No API keys, runs entirely in browser.

const chatWindow = document.getElementById('chatWindow');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

let knowledgeBase = [];               // will hold { pattern, response }
const fallbackMessages = [
    "I'm not sure I understand. Could you rephrase?",
    "Hmm, that's beyond my current logic. Try asking something else.",
    "I don't have data on that yet. Check logic.txt?",
    "Interesting... but I don't have a matching pattern.",
    "My logic.txt doesn't cover that. Want to teach me?"
];

// --- Load and parse logic.txt ---
async function loadKnowledge() {
    try {
        const response = await fetch('logic.txt');
        if (!response.ok) throw new Error('Could not load logic.txt');
        const text = await response.text();

        const lines = text.split('\n');
        knowledgeBase = [];

        lines.forEach(line => {
            line = line.trim();
            // Skip empty lines and comments (lines starting with #)
            if (line === '' || line.startsWith('#')) return;

            // Expected format: pattern :: response
            const separator = '::';
            const idx = line.indexOf(separator);
            if (idx === -1) return; // ignore malformed lines

            const pattern = line.substring(0, idx).trim().toLowerCase();
            const response = line.substring(idx + 2).trim();

            if (pattern && response) {
                knowledgeBase.push({ pattern, response });
            }
        });

        console.log(`Loaded ${knowledgeBase.length} patterns from logic.txt`);
    } catch (error) {
        console.error('Error loading knowledge:', error);
        // Add a visible error message in chat
        addBotMessage("⚠️ Could not load logic.txt. Make sure the file exists and is accessible.");
    }
}

// --- Find best matching response based on user input ---
function getBotResponse(userMsg) {
    const lowerMsg = userMsg.toLowerCase().trim();
    if (lowerMsg === '') return "You said nothing? I'm listening...";

    // If no patterns loaded, use fallback
    if (knowledgeBase.length === 0) {
        return "No logic loaded. Please check logic.txt file.";
    }

    // Find all patterns that are substrings of the user message
    let matches = knowledgeBase.filter(entry =>
        lowerMsg.includes(entry.pattern)
    );

    if (matches.length === 0) {
        // No match -> random fallback
        return fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
    }

    // Prefer the longest matching pattern (more specific)
    matches.sort((a, b) => b.pattern.length - a.pattern.length);
    return matches[0].response;
}

// --- UI Helpers ---
function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';

    messageDiv.innerHTML = `
        <div class="avatar-small">U</div>
        <div class="bubble">${escapeHTML(text)}</div>
    `;

    chatWindow.appendChild(messageDiv);
    scrollToBottom();
}

function addBotMessage(text, isTyping = false) {
    if (isTyping) {
        // typing indicator (will be replaced)
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.id = 'typingIndicator';
        typingDiv.innerHTML = `
            <div class="avatar-small">AI</div>
            <div class="bubble">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
        `;
        chatWindow.appendChild(typingDiv);
        scrollToBottom();
        return;
    }

    // remove typing indicator if present
    const existingTyping = document.getElementById('typingIndicator');
    if (existingTyping) existingTyping.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';

    messageDiv.innerHTML = `
        <div class="avatar-small">AI</div>
        <div class="bubble">${escapeHTML(text)}</div>
    `;

    chatWindow.appendChild(messageDiv);
    scrollToBottom();
}

// simple XSS prevention
function escapeHTML(str) {
    return str.replace(/[&<>"]/g, function(match) {
        if (match === '&') return '&amp;';
        if (match === '<') return '&lt;';
        if (match === '>') return '&gt;';
        if (match === '"') return '&quot;';
        return match;
    });
}

function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// --- Handle sending message ---
async function sendMessage() {
    const text = userInput.value.trim();
    if (text === '') return;

    // disable input briefly to prevent double-send (re-enabled after response)
    userInput.disabled = true;
    sendBtn.disabled = true;

    // display user message
    addUserMessage(text);
    userInput.value = '';

    // show typing indicator
    addBotMessage('', true);

    // simulate async thinking (even though it's sync, we keep UI smooth)
    setTimeout(() => {
        const reply = getBotResponse(text);
        addBotMessage(reply); // this removes typing indicator
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }, 600); // small delay to feel natural
}

// --- Event Listeners ---
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// --- Initialize ---
window.addEventListener('load', async () => {
    await loadKnowledge();
    // welcome message
    addBotMessage("Hello, I'm BotAI. I run completely offline using logic.txt. Ask me anything!");
    userInput.focus();
});