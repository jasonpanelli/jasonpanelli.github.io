const GOOGLE_WEB_APP_URL = "YOUR_GOOGLE_SCRIPT_URL_HERE"; 

// --- MASTER DATA ---
const INTERVALS = ["m2", "M2", "m3", "M3", "P4", "Tritone", "P5", "m6", "M6", "m7", "M7", "Octave"];
const PROGRESSIONS = {
    "I - IV - V - I": [[0,4,7], [5,9,12], [7,11,14], [0,4,7]],
    "i - iv - V - i": [[0,3,7], [5,8,12], [7,11,14], [0,3,7]],
    "ii - V - I": [[2,5,9,12], [7,11,14,17], [0,4,7,11]], // 7th chords
    "I - V - vi - IV": [[0,4,7], [7,11,14], [9,12,16], [5,9,12]],
    "vi - IV - I - V": [[9,12,16], [5,9,12], [0,4,7], [7,11,14]]
};

// --- STATE ---
let piano;
let isPianoLoaded = false;
let currentQuestion = null; 
let startTime = 0;
let currentMode = 'direct'; 

// Load Preferences or Defaults
let activeSettings = JSON.parse(localStorage.getItem('harmonySettings')) || {
    intervals: [...INTERVALS],
    progressions: Object.keys(PROGRESSIONS)
};

// --- AUDIO ENGINE (PIANO SAMPLER) ---
async function initAudio() {
    if (piano || isPianoLoaded) return;
    await Tone.start();
    
    // OPTIMIZATION: We only load 5 anchor notes instead of 30. 
    // Tone.js automatically pitch-shifts these to cover the entire keyboard!
    // This drops load time from ~10 seconds down to ~1-2 seconds.
    piano = new Tone.Sampler({
        urls: {
            "A0": "A0.mp3",
            "C2": "C2.mp3",
            "C4": "C4.mp3",
            "C6": "C6.mp3",
            "C8": "C8.mp3"
        },
        release: 1,
        baseUrl: "https://tonejs.github.io/audio/salamander/"
    }).toDestination();

    // Add a slight volume boost to compensate for the sampler
    piano.volume.value = 5;

    Tone.loaded().then(() => {
        isPianoLoaded = true;
        const badge = document.getElementById('loading-status');
        badge.innerText = "Piano Ready";
        badge.classList.add('ready');
        
        // Hide badge after 3 seconds
        setTimeout(() => {
            badge.style.opacity = '0';
            setTimeout(() => badge.style.display = 'none', 300);
        }, 3000);
        
        // Enable buttons
        document.querySelectorAll('.primary-btn').forEach(btn => btn.disabled = false);
        document.querySelectorAll('.status-msg').forEach(msg => msg.innerText = "Ready to play.");
    });
}

function midiToNote(midi) {
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// --- UI SETUP ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.main-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');
    currentMode = tabId;
    
    if (tabId === 'dashboard') renderChart();
}

function buildGrids() {
    // Direct & Context Grids
    ['grid-direct', 'grid-context'].forEach(gridId => {
        const grid = document.getElementById(gridId);
        grid.innerHTML = '';
        activeSettings.intervals.forEach(int => {
            const btn = document.createElement('button');
            btn.className = 'answer-btn';
            btn.innerText = int;
            btn.onclick = () => handleAnswer(int, gridId);
            grid.appendChild(btn);
        });
    });

    // Progressions Grid
    const progGrid = document.getElementById('grid-progressions');
    progGrid.innerHTML = '';
    activeSettings.progressions.forEach(prog => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = prog;
        btn.onclick = () => handleAnswer(prog, 'grid-progressions');
        progGrid.appendChild(btn);
    });
}

function buildSettings() {
    const intContainer = document.getElementById('settings-intervals');
    INTERVALS.forEach(int => {
        const lbl = document.createElement('label');
        lbl.className = 'setting-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = activeSettings.intervals.includes(int);
        cb.onchange = (e) => updateSettings('intervals', int, e.target.checked);
        lbl.appendChild(cb);
        lbl.append(int);
        intContainer.appendChild(lbl);
    });

    const progContainer = document.getElementById('settings-progressions');
    Object.keys(PROGRESSIONS).forEach(prog => {
        const lbl = document.createElement('label');
        lbl.className = 'setting-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = activeSettings.progressions.includes(prog);
        cb.onchange = (e) => updateSettings('progressions', prog, e.target.checked);
        lbl.appendChild(cb);
        lbl.append(prog);
        progContainer.appendChild(lbl);
    });
}

function updateSettings(category, item, isChecked) {
    if (isChecked) activeSettings[category].push(item);
    else activeSettings[category] = activeSettings[category].filter(i => i !== item);
    
    localStorage.setItem('harmonySettings', JSON.stringify(activeSettings));
    buildGrids(); // Rebuild UI based on new settings
}

// --- PLAYBACK LOGIC ---

// 1. Direct Intervals
document.getElementById('play-direct').onclick = async () => {
    await initAudio();
    if (activeSettings.intervals.length === 0) return alert("Enable intervals in Settings!");
    
    const rootMidi = Math.floor(Math.random() * 12) + 60; // C4 to B4
    const intervalStr = activeSettings.intervals[Math.floor(Math.random() * activeSettings.intervals.length)];
    const intervalSemitones = INTERVALS.indexOf(intervalStr) + 1; // +1 because m2 is index 0
    
    currentQuestion = { answer: intervalStr, mode: 'Direct', context: 'None' };
    
    const now = Tone.now();
    piano.triggerAttackRelease(midiToNote(rootMidi), "2n", now);
    piano.triggerAttackRelease(midiToNote(rootMidi + intervalSemitones), "2n", now + 1);
    
    prepAnswer('status-direct', 'grid-direct', 1500);
};

// 2. Context Intervals
const playContext = async (contextType) => {
    await initAudio();
    if (activeSettings.intervals.length === 0) return alert("Enable intervals in Settings!");

    const rootMidi = Math.floor(Math.random() * 12) + 60;
    const intervalStr = activeSettings.intervals[Math.floor(Math.random() * activeSettings.intervals.length)];
    const intervalSemitones = INTERVALS.indexOf(intervalStr) + 1;
    
    currentQuestion = { answer: intervalStr, mode: 'Context', context: contextType };
    
    const now = Tone.now();
    const chords = contextType === 'Major' ? PROGRESSIONS["I - IV - V - I"] : PROGRESSIONS["i - iv - V - i"];
    
    chords.forEach((chord, index) => {
        const notes = chord.map(semi => midiToNote(rootMidi + semi));
        piano.triggerAttackRelease(notes, index === 3 ? "2n" : "4n", now + (index * 0.8));
    });

    piano.triggerAttackRelease(midiToNote(rootMidi + intervalSemitones), "2n", now + 3.5);
    prepAnswer('status-context', 'grid-context', 4000);
};
document.getElementById('play-major').onclick = () => playContext('Major');
document.getElementById('play-minor').onclick = () => playContext('Minor');

// 3. Progressions
document.getElementById('play-progression').onclick = async () => {
    await initAudio();
    if (activeSettings.progressions.length === 0) return alert("Enable progressions in Settings!");

    const rootMidi = Math.floor(Math.random() * 12) + 60;
    const progStr = activeSettings.progressions[Math.floor(Math.random() * activeSettings.progressions.length)];
    
    currentQuestion = { answer: progStr, mode: 'Progression', context: 'None' };
    
    const now = Tone.now();
    PROGRESSIONS[progStr].forEach((chord, index) => {
        const notes = chord.map(semi => midiToNote(rootMidi + semi));
        piano.triggerAttackRelease(notes, "2n", now + (index * 1.2));
    });

    prepAnswer('status-progressions', 'grid-progressions', PROGRESSIONS[progStr].length * 1200);
};

// --- ANSWER HANDLING ---
function prepAnswer(statusId, gridId, delay) {
    document.getElementById(statusId).innerText = "Listen...";
    document.getElementById(gridId).classList.remove('active');
    
    // Clear old colors
    document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('correct', 'wrong'));

    setTimeout(() => {
        document.getElementById(statusId).innerText = "What was it?";
        document.getElementById(gridId).classList.add('active');
        startTime = Date.now();
    }, delay);
}

function handleAnswer(selected, gridId) {
    if (!currentQuestion) return;
    
    const isCorrect = (selected === currentQuestion.answer);
    const responseTime = Date.now() - startTime;
    
    // UI Feedback
    const grid = document.getElementById(gridId);
    Array.from(grid.children).forEach(btn => {
        if (btn.innerText === currentQuestion.answer) btn.classList.add('correct');
        else if (btn.innerText === selected && !isCorrect) btn.classList.add('wrong');
    });

    const statusMap = { 'grid-direct': 'status-direct', 'grid-context': 'status-context', 'grid-progressions': 'status-progressions' };
    document.getElementById(statusMap[gridId]).innerText = isCorrect ? "Correct!" : `Incorrect. It was ${currentQuestion.answer}.`;
    
    // Update Local Storage for Chart
    let stats = JSON.parse(localStorage.getItem('harmonyStats')) || {};
    if (!stats[currentQuestion.answer]) stats[currentQuestion.answer] = { attempts: 0, correct: 0 };
    stats[currentQuestion.answer].attempts++;
    if (isCorrect) stats[currentQuestion.answer].correct++;
    localStorage.setItem('harmonyStats', JSON.stringify(stats));

    // Send to Google Sheets
    fetch(GOOGLE_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: currentQuestion.mode,
            context: currentQuestion.context,
            question: currentQuestion.answer,
            isCorrect: isCorrect,
            responseTime: responseTime
        })
    });

    currentQuestion = null;
    grid.classList.remove('active');
}

// --- DASHBOARD ---
let chartInstance = null;
function renderChart() {
    const stats = JSON.parse(localStorage.getItem('harmonyStats')) || {};
    const labels = Object.keys(stats);
    const data = labels.map(key => stats[key].attempts === 0 ? 0 : Math.round((stats[key].correct / stats[key].attempts) * 100));

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('accuracyChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Accuracy %', data: data, backgroundColor: 'rgba(79, 70, 229, 0.7)' }]
        },
        options: { scales: { y: { beginAtZero: true, max: 100 } } }
    });
}

// Initialize UI
buildSettings();
buildGrids();