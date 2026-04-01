// --- CONFIGURATION ---
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx_DC60RQqwPQLX87O4FQ_jPjsjTLL4v_1vAp8AdiH0Eu7TA0FlE25WUYGFX8qikGM1QA/exec"; 

const INTERVALS = ["m2", "M2", "m3", "M3", "P4", "Tritone", "P5", "m6", "M6", "m7", "M7", "Octave"];

// The individual chords the user can be tested on
const TARGET_CHORDS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'i', 'ii°', 'III', 'iv', 'VI'];

// --- STATE ---
let isPianoLoaded = false;
let currentQuestion = null; 
let playbackData = null;
let startTime = 0;
let currentMode = 'direct'; 

// Load Preferences or Defaults
let savedSettings = JSON.parse(localStorage.getItem('harmonySettings')) || {};

let activeSettings = {
    intervals: savedSettings.intervals || [...INTERVALS],
    // Change 'progressions' to 'targetChords'
    targetChords: savedSettings.targetChords || ['I', 'ii', 'IV', 'V', 'vi', 'i', 'iv', 'VI'], 
    speed: savedSettings.speed || 1.0
};

function generate88KeyMap(extension = '.mp3') {
    const noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const urls = {};

    // The standard piano starts at A0, Bb0, and B0
    urls['A0'] = `A0${extension}`;
    urls['Bb0'] = `Bb0${extension}`;
    urls['B0'] = `B0${extension}`;

    // Loop through octaves 1 to 7
    for (let octave = 1; octave <= 7; octave++) {
        noteNames.forEach(note => {
            // e.g., "C4" : "C4.mp3"
            urls[`${note}${octave}`] = `${note}${octave}${extension}`;
        });
    }

    // The standard piano ends at C8
    urls['C8'] = `C8${extension}`;

    return urls;
}

// Generate the full mapping object
const pianoUrls = generate88KeyMap('.mp3');

// Map every available note in the Tone.js Salamander repository
const salamanderUrls = {
    "A0": "A0.mp3",
    "C1": "C1.mp3",
    "D#1": "Ds1.mp3",
    "F#1": "Fs1.mp3",
    "A1": "A1.mp3",
    "C2": "C2.mp3",
    "D#2": "Ds2.mp3",
    "F#2": "Fs2.mp3",
    "A2": "A2.mp3",
    "C3": "C3.mp3",
    "D#3": "Ds3.mp3",
    "F#3": "Fs3.mp3",
    "A3": "A3.mp3",
    "C4": "C4.mp3",
    "D#4": "Ds4.mp3",
    "F#4": "Fs4.mp3",
    "A4": "A4.mp3",
    "C5": "C5.mp3",
    "D#5": "Ds5.mp3",
    "F#5": "Fs5.mp3",
    "A5": "A5.mp3",
    "C6": "C6.mp3",
    "D#6": "Ds6.mp3",
    "F#6": "Fs6.mp3",
    "A6": "A6.mp3",
    "C7": "C7.mp3",
    "D#7": "Ds7.mp3",
    "F#7": "Fs7.mp3",
    "A7": "A7.mp3",
    "C8": "C8.mp3"
};

const piano = new Tone.Sampler({
    urls: salamanderUrls,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    onload: () => {
        console.log("Salamander Piano samples loaded successfully!");
        // Your existing UI enabling code inside Tone.loaded() handles the rest
    }
}).toDestination();

piano.volume.value = 5;

Tone.loaded().then(() => {
    isPianoLoaded = true;
    const badge = document.getElementById('loading-status');
    badge.innerText = "Piano Ready";
    badge.classList.add('ready');
    setTimeout(() => badge.style.display = 'none', 3000);
    
    document.querySelectorAll('.primary-btn').forEach(btn => btn.disabled = false);
    document.querySelectorAll('.status-msg').forEach(msg => msg.innerText = "Ready to play.");
});

async function initAudio() {
    if (Tone.context.state !== 'running') {
        await Tone.start();
        console.log("Audio Context Started");
    }
}

function midiToNote(midi) {
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${notes[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// Converts an array of MIDI numbers to Tone.js note strings (e.g., [60, 64, 67] -> ["C4", "E4", "G4"])
function midiToNotes(midiArray) {
    return midiArray.map(midi => Tone.Frequency(midi, "midi").toNote());
}

// Applies a random inversion (Root position, 1st, or 2nd inversion)
function invertChord(midiArray) {
    let chord = [...midiArray];
    const inversion = Math.floor(Math.random() * 3); // 0, 1, or 2
    
    if (inversion === 1) {
        chord[0] += 12; // Move bottom note up an octave (1st Inversion)
    } else if (inversion === 2) {
        chord[0] += 12; 
        chord[1] += 12; // Move bottom two notes up an octave (2nd Inversion)
    }
    
    // Sort from lowest to highest pitch
    return chord.sort((a, b) => a - b);
}

// Define diatonic chord formulas (semi-tone offsets from the root of the key)
// Note: We use Harmonic Minor for the minor key cadence so the V chord is major
const KEY_CHORDS = {
    major: {
        'I': [0, 4, 7],
        'ii': [2, 5, 9],
        'iii': [4, 7, 11],
        'IV': [5, 9, 12],
        'V': [7, 11, 14],
        'vi': [9, 12, 16],
        'vii°': [11, 14, 17]
    },
    minor: {
        'i': [0, 3, 7],
        'ii°': [2, 5, 8],
        'III': [3, 7, 10],
        'iv': [5, 8, 12],
        'V': [7, 11, 14], // Harmonic minor V (Major chord)
        'VI': [8, 12, 15],
        'vii°': [11, 14, 17]
    }
};

// --- UI SETUP ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.main-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');
    currentMode = tabId;
    
    // Clear active question when changing modes
    currentQuestion = null;
    playbackData = null;
    
    if (tabId === 'dashboard') renderChart();
}

function buildGrids() {
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

    // Update the 3rd grid to show individual target chords
    const progGrid = document.getElementById('grid-progressions');
    progGrid.innerHTML = '';
    activeSettings.targetChords.forEach(chord => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = chord;
        // Use the old grid ID to avoid having to change your HTML/CSS
        btn.onclick = () => handleAnswer(chord, 'grid-progressions'); 
        progGrid.appendChild(btn);
    });
}

function buildSettings() {
    const intContainer = document.getElementById('settings-intervals');
    intContainer.innerHTML = ''; // Clear existing
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
    progContainer.innerHTML = ''; // Clear existing
    TARGET_CHORDS.forEach(chord => {
        const lbl = document.createElement('label');
        lbl.className = 'setting-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        // Check our new state variable
        cb.checked = activeSettings.targetChords.includes(chord);
        cb.onchange = (e) => updateSettings('targetChords', chord, e.target.checked);
        lbl.appendChild(cb);
        lbl.append(chord);
        progContainer.appendChild(lbl);
    });

    // Speed Setting setup
    const speedSlider = document.getElementById('settings-speed');
    const speedDisplay = document.getElementById('speed-display');
    speedSlider.value = activeSettings.speed || 1.0;
    speedDisplay.innerText = Number(speedSlider.value).toFixed(1) + 'x';
    
    speedSlider.oninput = (e) => {
        activeSettings.speed = parseFloat(e.target.value);
        speedDisplay.innerText = activeSettings.speed.toFixed(1) + 'x';
        localStorage.setItem('harmonySettings', JSON.stringify(activeSettings));
    };
}

function updateSettings(category, item, isChecked) {
    if (isChecked) activeSettings[category].push(item);
    else activeSettings[category] = activeSettings[category].filter(i => i !== item);
    
    // Changing settings invalidates the current question
    currentQuestion = null;
    playbackData = null;
    
    localStorage.setItem('harmonySettings', JSON.stringify(activeSettings));
    buildGrids(); 
}

// --- PLAYBACK LOGIC ---

// 1. Direct Intervals
document.getElementById('play-direct').onclick = async () => {
    await initAudio();
    if (activeSettings.intervals.length === 0) return alert("Enable intervals in Settings!");
    
    // Only generate new notes if we don't currently have an active question
    if (!currentQuestion || currentQuestion.mode !== 'Direct') {
        const rootMidi = Math.floor(Math.random() * 12) + 60; // C4 to B4
        const intervalStr = activeSettings.intervals[Math.floor(Math.random() * activeSettings.intervals.length)];
        const intervalSemitones = INTERVALS.indexOf(intervalStr) + 1; 
        
        currentQuestion = { answer: intervalStr, mode: 'Direct', context: 'None' };
        playbackData = { note1: midiToNote(rootMidi), note2: midiToNote(rootMidi + intervalSemitones) };
    }
    const now = Tone.now(); // Get the time AFTER initAudio
    const t = 1 / activeSettings.speed; 
    
    // Use the 'now' variable consistently
    piano.triggerAttackRelease(playbackData.note1, 1 * t, now);
    piano.triggerAttackRelease(playbackData.note2, 1 * t, now + (1 * t));
    
    prepAnswer('status-direct', 'grid-direct', 1500 * t);
};

// 2. Context Intervals
const playContext = async (contextType) => {
    await initAudio();
    if (activeSettings.intervals.length === 0) return alert("Enable intervals in Settings!");

    // Generate new notes only if mode or context type has changed, or if previous was answered
    if (!currentQuestion || currentQuestion.mode !== 'Context' || currentQuestion.context !== contextType) {
        const rootMidi = Math.floor(Math.random() * 12) + 60;
        const intervalStr = activeSettings.intervals[Math.floor(Math.random() * activeSettings.intervals.length)];
        const intervalSemitones = INTERVALS.indexOf(intervalStr) + 1;
        
        currentQuestion = { answer: intervalStr, mode: 'Context', context: contextType };
        
        const chords = contextType === 'Major' ? PROGRESSIONS["I - IV - V - I"] : PROGRESSIONS["i - iv - V - i"];
        const chordsNotes = chords.map(chord => chord.map(semi => midiToNote(rootMidi + semi)));
        
        playbackData = { chords: chordsNotes, target: midiToNote(rootMidi + intervalSemitones) };
    }
    
    const now = Tone.now();
    const t = 1 / activeSettings.speed;
    
    playbackData.chords.forEach((chordNotes, index) => {
        const duration = index === 3 ? 1.5 * t : 0.8 * t;
        piano.triggerAttackRelease(chordNotes, duration, now + (index * 0.8 * t));
    });

    piano.triggerAttackRelease(playbackData.target, 1.5 * t, now + (3.5 * t));
    prepAnswer('status-context', 'grid-context', 4000 * t);
};
document.getElementById('play-major').onclick = () => playContext('Major');
document.getElementById('play-minor').onclick = () => playContext('Minor');

// 3. Progressions
// 3. Chords in Context (Formerly Progressions)
document.getElementById('play-progression').onclick = async () => {
    await initAudio(); 
    if (activeSettings.targetChords.length === 0) return alert("Enable chords in Settings!");
    
    const now = Tone.now();
    const t = 1 / activeSettings.speed;
    
    // Filter available chords based on user settings
    const availableMajor = Object.keys(KEY_CHORDS.major).filter(c => activeSettings.targetChords.includes(c));
    const availableMinor = Object.keys(KEY_CHORDS.minor).filter(c => activeSettings.targetChords.includes(c));
    
    if (availableMajor.length === 0 && availableMinor.length === 0) {
        return alert("No valid chords selected for the current mode! Check your settings.");
    }

    // Decide Major or Minor based on what the user has enabled
    let isMajor = true;
    if (availableMajor.length > 0 && availableMinor.length > 0) {
        isMajor = Math.random() > 0.5;
    } else if (availableMinor.length > 0) {
        isMajor = false;
    }
    
    const mode = isMajor ? 'major' : 'minor';
    const chordDict = KEY_CHORDS[mode];
    const availableChords = isMajor ? availableMajor : availableMinor;
    
    const rootMidi = Math.floor(Math.random() * 8) + 48; // C3 to G3
    
    // Build Cadence
    const cadenceNumerals = isMajor ? ['I', 'IV', 'V', 'I'] : ['i', 'iv', 'V', 'i'];
    const cadenceChords = cadenceNumerals.map(numeral => {
        const baseMidi = chordDict[numeral].map(offset => rootMidi + offset);
        return midiToNotes(invertChord(baseMidi));
    });

    // Pick a Target Chord from the user's enabled settings
    const randomTargetNumeral = availableChords[Math.floor(Math.random() * availableChords.length)];
    const targetBaseMidi = chordDict[randomTargetNumeral].map(offset => rootMidi + offset);
    const targetChord = midiToNotes(invertChord(targetBaseMidi.map(note => note + 12)));

    // IMPORTANT: Set the question so the UI handles the score correctly!
    currentQuestion = { answer: randomTargetNumeral, mode: 'ChordInKey', context: mode };

    // --- PLAYBACK ---
    let timeOffset = 0;
    cadenceChords.forEach(chordNotes => {
        piano.triggerAttackRelease(chordNotes, 1 * t, now + timeOffset);
        timeOffset += (1 * t);
    });
    
    timeOffset += (1 * t); // Pause for 1 beat
    piano.triggerAttackRelease(targetChord, 2.5 * t, now + timeOffset);
    
    // Pass 'status-progressions' and 'grid-progressions' to use your existing UI containers
    prepAnswer('status-progressions', 'grid-progressions', (timeOffset + 2.5) * 1000 * t);
};

// --- ANSWER HANDLING ---
function prepAnswer(statusId, gridId, delay) {
    document.getElementById(statusId).innerText = "Listen...";
    document.getElementById(gridId).classList.remove('active');
    
    document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('correct', 'wrong'));

    setTimeout(() => {
        document.getElementById(statusId).innerText = "What was it? (Press Play to hear again)";
        document.getElementById(gridId).classList.add('active');
        startTime = Date.now();
    }, delay);
}

function handleAnswer(selected, gridId) {
    if (!currentQuestion) return;
    
    const isCorrect = (selected === currentQuestion.answer);
    const responseTime = Date.now() - startTime;
    
    const grid = document.getElementById(gridId);
    Array.from(grid.children).forEach(btn => {
        if (btn.innerText === currentQuestion.answer) btn.classList.add('correct');
        else if (btn.innerText === selected && !isCorrect) btn.classList.add('wrong');
    });

    const statusMap = { 'grid-direct': 'status-direct', 'grid-context': 'status-context', 'grid-progressions': 'status-progressions' };
    document.getElementById(statusMap[gridId]).innerText = isCorrect ? "Correct!" : `Incorrect. It was ${currentQuestion.answer}.`;
    
    let stats = JSON.parse(localStorage.getItem('harmonyStats')) || {};
    if (!stats[currentQuestion.answer]) stats[currentQuestion.answer] = { attempts: 0, correct: 0 };
    stats[currentQuestion.answer].attempts++;
    if (isCorrect) stats[currentQuestion.answer].correct++;
    localStorage.setItem('harmonyStats', JSON.stringify(stats));

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
    }).catch(e => console.error(e));

    // Clear the active question so the next Play button press generates a new one!
    currentQuestion = null;
    playbackData = null;
    
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