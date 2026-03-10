// BotAI – Enhanced with multiple file loading, learning, context, sentiment & topics
// No API keys, runs entirely in browser.

const chatWindow = document.getElementById('chatWindow');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// ----- CHANGE THIS ONE LINE TO USE YOUR MASSIVE FILE -----
const DIALOGUE_FILES = ['massive.txt'];   // you can also list multiple files: ['file1.txt', 'file2.txt']
// ---------------------------------------------------------

let knowledgeBase = [];               // will hold { pattern, response, normalized, keywords }
const fallbackMessages = [
    "I'm not sure I understand. Could you rephrase?",
    "Hmm, that's beyond my current logic. Try asking something else.",
    "I don't have data on that yet. Check logic.txt?",
    "Interesting... but I don't have a matching pattern.",
    "My logic.txt doesn't cover that. Want to teach me?"
];

// --- IndexedDB for persistent learning ---
const DB_NAME = 'BotAIDB';
const DB_VERSION = 1;
const STORE_NAME = 'learnedQA';

let db;

// --- Context memory (last 10 messages) ---
let conversationHistory = [];
const MAX_HISTORY = 10;

// --- Sentiment lexicons ---
const positiveWords = new Set(['good', 'great', 'awesome', 'excellent', 'happy', 'love', 'wonderful', 'fantastic', 'nice', 'perfect', 'glad', 'pleased', 'joy', 'amazing', 'brilliant']);
const negativeWords = new Set(['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'annoying', 'stupid', 'horrible', 'worst', 'disappointed', 'upset', 'depressed', 'crap', 'shit']);

// --- Topic categories ---
const topics = {
    tech: ['javascript', 'code', 'programming', 'api', 'github', 'software', 'app', 'computer', 'tech', 'internet', 'web', 'browser', 'ai', 'ml'],
    movies: ['movie', 'film', 'actor', 'actress', 'hollywood', 'cinema', 'star wars', 'marvel', 'dc', 'netflix'],
    music: ['song', 'music', 'band', 'album', 'artist', 'playlist', 'spotify', 'rock', 'pop', 'rap'],
    sports: ['sport', 'game', 'football', 'soccer', 'basketball', 'baseball', 'tennis', 'cricket', 'team', 'player', 'score'],
    life: ['life', 'love', 'meaning', 'purpose', 'death', 'happiness', 'sad', 'relationship', 'family', 'friend']
};

// --- Stopwords (for keyword extraction) ---
const stopwords = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
    'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an',
    'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for',
    'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don',
    'should', 'now'
]);

// --- Open IndexedDB ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// --- Save a learned pair ---
async function saveLearnedPair(question, answer) {
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({ question, answer, timestamp: Date.now() });
    return tx.complete;
}

// --- Load all learned pairs ---
async function loadLearnedPairs() {
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- Text normalization ---
function normalize(text) {
    return text.toLowerCase()
        .replace(/[.,!?;:'"()\[\]{}<>\/\\|–—―-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// --- Extract keywords (excluding stopwords) ---
function extractKeywords(text) {
    const words = text.toLowerCase().split(/\s+/);
    return words.filter(w => w.length > 2 && !stopwords.has(w));
}

// --- Levenshtein distance (for fuzzy matching) ---
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i-1) === a.charAt(j-1)) {
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = Math.min(matrix[i-1][j-1] + 1,
                                        Math.min(matrix[i][j-1] + 1,
                                                 matrix[i-1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

// --- Sentiment detection ---
function detectSentiment(text) {
    const words = text.toLowerCase().split(/\s+/);
    let positive = 0, negative = 0;
    for (let w of words) {
        if (positiveWords.has(w)) positive++;
        if (negativeWords.has(w)) negative++;
    }
    if (positive > negative) return 'positive';
    if (negative > positive) return 'negative';
    return 'neutral';
}

// --- Topic detection ---
function detectTopics(text) {
    const lower = text.toLowerCase();
    const detected = [];
    for (let [topic, keywords] of Object.entries(topics)) {
        for (let kw of keywords) {
            if (lower.includes(kw)) {
                detected.push(topic);
                break;
            }
        }
    }
    return detected;
}

// --- Load and parse multiple .txt files ---
async function loadKnowledge() {
    let allPairs = [];

    for (const file of DIALOGUE_FILES) {
        try {
            const response = await fetch(file);
            if (!response.ok) {
                console.warn(`Could not load ${file}`);
                continue;
            }
            const text = await response.text();
            const lines = text.split('\n');

            lines.forEach(line => {
                line = line.trim();
                if (line === '' || line.startsWith('#')) return;

                const separator = '::';
                const idx = line.indexOf(separator);
                if (idx === -1) return;

                const pattern = line.substring(0, idx).trim().toLowerCase();
                const response = line.substring(idx + 2).trim();

                if (pattern && response) {
                    const normalized = normalize(pattern);
                    const keywords = extractKeywords(normalized);
                    allPairs.push({ pattern, response, normalized, keywords });
                }
            });

            console.log(`Loaded ${lines.length} lines from ${file}`);
        } catch (error) {
            console.error(`Error loading ${file}:`, error);
        }
    }

    // Merge with learned pairs from IndexedDB
    const learned = await loadLearnedPairs();
    learned.forEach(l => {
        const normalized = normalize(l.question);
        const keywords = extractKeywords(normalized);
        allPairs.push({
            pattern: l.question,
            response: l.answer,
            normalized,
            keywords,
            learned: true
        });
    });

    knowledgeBase = allPairs;
    console.log(`Total knowledge: ${knowledgeBase.length} entries`);
}

// --- Advanced matching (context, sentiment, topics) ---
function findBestMatch(userMsg) {
    const normalizedUser = normalize(userMsg);
    const userKeywords = extractKeywords(normalizedUser);
    const sentiment = detectSentiment(userMsg);
    const userTopics = detectTopics(userMsg);

    let bestMatch = null;
    let bestScore = 0;

    for (const item of knowledgeBase) {
        let score = 0;

        // Exact match
        if (item.normalized === normalizedUser) score += 100;
        else if (normalizedUser.includes(item.normalized)) score += 50;
        else if (item.normalized.includes(normalizedUser)) score += 40;

        // Keyword overlap (Jaccard)
        const commonKeywords = userKeywords.filter(k => item.keywords.includes(k)).length;
        const totalUnique = new Set([...userKeywords, ...item.keywords]).size;
        if (totalUnique > 0) {
            const jaccard = (commonKeywords / totalUnique) * 100;
            score += jaccard * 2;
        }

        // Fuzzy match for short messages
        if (userKeywords.length < 3 && item.keywords.length < 3) {
            const dist = levenshtein(normalizedUser, item.normalized);
            const maxLen = Math.max(normalizedUser.length, item.normalized.length);
            if (maxLen > 0) {
                const similarity = (1 - dist / maxLen) * 100;
                score += similarity * 1.5;
            }
        }

        // Sentiment boost
        if (sentiment === 'positive' && item.response.toLowerCase().includes('glad')) score += 10;
        if (sentiment === 'negative' && (item.response.toLowerCase().includes('sorry') || item.response.toLowerCase().includes('sad'))) score += 10;

        // Topic boost
        const itemTopics = detectTopics(item.pattern);
        const commonTopics = userTopics.filter(t => itemTopics.includes(t));
        score += commonTopics.length * 15;

        // Context boost (previous message topics)
        if (conversationHistory.length > 0) {
            const lastMsg = conversationHistory[conversationHistory.length - 1];
            if (lastMsg.role === 'user') {
                const lastTopics = detectTopics(lastMsg.content);
                if (lastTopics.some(t => itemTopics.includes(t))) score += 10;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
        }
    }

    return bestScore > 20 ? bestMatch : null;
}

// --- Get response, possibly asking to learn ---
let pendingQuestion = null;

async function getBotResponse(userMsg) {
    const lowerMsg = userMsg.toLowerCase().trim();
    if (lowerMsg === '') return "You said nothing? I'm listening...";

    if (knowledgeBase.length === 0) {
        return "No knowledge loaded. Please check your .txt files.";
    }

    // If we are waiting for the user to teach us
    if (pendingQuestion) {
        if (lowerMsg === 'skip') {
            pendingQuestion = null;
            return "Okay, I won't learn that this time.";
        }
        // Save the learned pair
        await saveLearnedPair(pendingQuestion, userMsg);
        // Add to current knowledgeBase
        const normalized = normalize(pendingQuestion);
        const keywords = extractKeywords(normalized);
        knowledgeBase.push({
            pattern: pendingQuestion,
            response: userMsg,
            normalized,
            keywords,
            learned: true
        });
        pendingQuestion = null;
        return `Thank you! I've learned that. Next time you ask "${pendingQuestion}", I'll know what to say.`;
    }

    const match = findBestMatch(userMsg);

    if (!match) {
        // No match: ask user to teach
        pendingQuestion = userMsg;
        return "I don't know how to answer that yet. What would be a good response? (Or type 'skip' to ignore)";
    }

    return match.response;
}

// --- UI Helpers (unchanged from original) ---
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

    userInput.disabled = true;
    sendBtn.disabled = true;

    addUserMessage(text);
    userInput.value = '';

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: text });
    if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();

    addBotMessage('', true);

    setTimeout(async () => {
        const reply = await getBotResponse(text);
        addBotMessage(reply);

        // Add bot response to history
        conversationHistory.push({ role: 'bot', content: reply });
        if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();

        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }, 600);
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
    db = await openDB();
    await loadKnowledge();
    addBotMessage("Hello, I'm BotAI. I run completely offline using your .txt files. Ask me anything!");
    userInput.focus();
});