// --- CONFIGURATION ---
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx_DC60RQqwPQLX87O4FQ_jPjsjTLL4v_1vAp8AdiH0Eu7TA0FlE25WUYGFX8qikGM1QA/exec"; 

const INTERVALS = ["m2", "M2", "m3", "M3", "P4", "Tritone", "P5", "m6", "M6", "m7", "M7", "Octave"];

// The individual chords the user can be tested on
const TARGET_CHORDS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'i', 'ii°', 'III', 'iv', 'VI'];

// --- STATE ---
let isPianoLoaded = false;
let currentQuestion = null; 
let playbackData = null;
let lastPlaybackData = null;   
let lastQuestionDetails = null; 
let startTime = 0;
let currentMode = 'direct'; 

// Session Tracker Variables
let sessionCorrect = 0;
let sessionTotal = 0;

// Load Preferences or Defaults
let savedSettings = JSON.parse(localStorage.getItem('harmonySettings')) || {};

let activeSettings = {
    intervals: savedSettings.intervals || [...INTERVALS],
    targetChords: savedSettings.targetChords || ['I', 'ii', 'IV', 'V', 'vi', 'i', 'iv', 'VI'], 
    speed: savedSettings.speed || 1.0,
    direction: savedSettings.direction || 'Ascending'
};

// Map every available note in the Tone.js Salamander repository
const salamanderUrls = {
    "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
    "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
    "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
    "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
    "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
    "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
    "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
    "A7": "A7.mp3", "C8": "C8.mp3"
};

const piano = new Tone.Sampler({
    urls: salamanderUrls,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    onload: () => {
        console.log("Salamander Piano samples loaded successfully!");
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

function midiToNotes(midiArray) {
    return midiArray.map(midi => Tone.Frequency(midi, "midi").toNote());
}

function invertChord(midiArray) {
    let chord = [...midiArray];
    const inversion = Math.floor(Math.random() * 3); 
    
    if (inversion === 1) {
        chord[0] += 12; 
    } else if (inversion === 2) {
        chord[0] += 12; 
        chord[1] += 12; 
    }
    
    return chord.sort((a, b) => a - b);
}

const KEY_CHORDS = {
    major: {
        'I': [0, 4, 7], 'ii': [2, 5, 9], 'iii': [4, 7, 11],
        'IV': [5, 9, 12], 'V': [7, 11, 14], 'vi': [9, 12, 16], 'vii°': [11, 14, 17]
    },
    minor: {
        'i': [0, 3, 7], 'ii°': [2, 5, 8], 'III': [3, 7, 10],
        'iv': [5, 8, 12], 'V': [7, 11, 14], 'VI': [8, 12, 15], 'vii°': [11, 14, 17]
    }
};

// --- UI SETUP ---
function buildSessionTracker() {
    const tracker = document.createElement('div');
    tracker.id = 'session-tracker';
    tracker.style.position = 'fixed';
    tracker.style.top = '15px';
    tracker.style.right = '15px';
    tracker.style.backgroundColor = '#1f2937';
    tracker.style.color = '#ffffff';
    tracker.style.padding = '8px 16px';
    tracker.style.borderRadius = '20px';
    tracker.style.fontWeight = 'bold';
    tracker.style.fontSize = '14px';
    tracker.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    tracker.style.zIndex = '1000';
    tracker.style.display = 'flex';
    tracker.style.gap = '12px';
    tracker.style.transition = 'transform 0.1s ease-in-out';
    
    tracker.innerHTML = `
        <span>Session:</span>
        <span id="session-right" style="color: #4ade80;">0 ✓</span>
        <span id="session-wrong" style="color: #f87171;">0 ✗</span>
    `;
    document.body.appendChild(tracker);
}

function updateSessionTracker(isCorrect) {
    sessionTotal++;
    if (isCorrect) sessionCorrect++;
    
    const wrong = sessionTotal - sessionCorrect;
    document.getElementById('session-right').innerText = `${sessionCorrect} ✓`;
    document.getElementById('session-wrong').innerText = `${wrong} ✗`;
    
    const tracker = document.getElementById('session-tracker');
    tracker.style.transform = 'scale(1.1)';
    setTimeout(() => tracker.style.transform = 'scale(1)', 150);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.main-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.getElementById(`btn-${tabId}`).classList.add('active');
    currentMode = tabId;
    
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

    const progGrid = document.getElementById('grid-progressions');
    progGrid.innerHTML = '';
    activeSettings.targetChords.forEach(chord => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = chord;
        btn.onclick = () => handleAnswer(chord, 'grid-progressions'); 
        progGrid.appendChild(btn);
    });
}

function buildSettings() {
    const intContainer = document.getElementById('settings-intervals');
    intContainer.innerHTML = ''; 
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

    let dirContainer = document.getElementById('settings-direction-container');
    if (!dirContainer) {
        dirContainer = document.createElement('div');
        dirContainer.id = 'settings-direction-container';
        dirContainer.style.marginTop = '20px';
        dirContainer.style.paddingTop = '15px';
        dirContainer.style.borderTop = '1px solid #374151';

        dirContainer.innerHTML = `<h3 style="margin-bottom: 10px; font-size: 1.1em; color: #9ca3af;">Interval Direction</h3>`;

        const dirSelect = document.createElement('select');
        dirSelect.style.padding = '8px';
        dirSelect.style.borderRadius = '5px';
        dirSelect.style.background = '#374151';
        dirSelect.style.color = 'white';
        dirSelect.style.border = 'none';
        dirSelect.style.width = '100%';
        dirSelect.style.maxWidth = '250px';

        ['Ascending', 'Descending', 'Harmonic', 'Random'].forEach(dir => {
            const opt = document.createElement('option');
            opt.value = dir;
            opt.innerText = dir === 'Harmonic' ? 'Harmonic (Played Together)' : dir;
            dirSelect.appendChild(opt);
        });

        dirSelect.value = activeSettings.direction || 'Ascending';
        dirSelect.onchange = (e) => {
            activeSettings.direction = e.target.value;
            localStorage.setItem('harmonySettings', JSON.stringify(activeSettings));
            currentQuestion = null;
        };

        dirContainer.appendChild(dirSelect);
        intContainer.parentNode.insertBefore(dirContainer, intContainer.nextSibling);
    }

    const progContainer = document.getElementById('settings-progressions');
    progContainer.innerHTML = ''; 
    TARGET_CHORDS.forEach(chord => {
        const lbl = document.createElement('label');
        lbl.className = 'setting-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = activeSettings.targetChords.includes(chord);
        cb.onchange = (e) => updateSettings('targetChords', chord, e.target.checked);
        lbl.appendChild(cb);
        lbl.append(chord);
        progContainer.appendChild(lbl);
    });

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
    
    currentQuestion = null;
    playbackData = null;
    
    localStorage.setItem('harmonySettings', JSON.stringify(activeSettings));
    buildGrids(); 
}

// --- PLAYBACK LOGIC ---

document.getElementById('play-direct').onclick = async () => {
    await initAudio();
    if (activeSettings.intervals.length === 0) return alert("Enable intervals in Settings!");
    
    if (!currentQuestion || currentQuestion.mode !== 'Direct') {
        const rootMidi = Math.floor(Math.random() * 12) + 60; // C4 to B4
        const intervalStr = activeSettings.intervals[Math.floor(Math.random() * activeSettings.intervals.length)];
        const intervalSemitones = INTERVALS.indexOf(intervalStr) + 1; 

        let dir = activeSettings.direction || 'Ascending';
        if (dir === 'Random') {
            dir = Math.random() > 0.5 ? 'Ascending' : 'Descending';
        }

        let note2Midi;
        if (dir === 'Descending') {
            note2Midi = rootMidi - intervalSemitones;
        } else {
            note2Midi = rootMidi + intervalSemitones;
        }
        
        currentQuestion = { 
            answer: intervalStr, 
            mode: 'Direct', 
            context: 'None', 
            rootMidi: rootMidi,
            direction: dir 
        };
        
        playbackData = { 
            note1: midiToNote(rootMidi), 
            note2: midiToNote(note2Midi),
            isHarmonic: dir === 'Harmonic'
        };
    }
    
    const now = Tone.now(); 
    const t = 1 / activeSettings.speed; 
    
    if (playbackData.isHarmonic) {
        piano.triggerAttackRelease([playbackData.note1, playbackData.note2], 1.5 * t, now);
    } else {
        piano.triggerAttackRelease(playbackData.note1, 1 * t, now);
        piano.triggerAttackRelease(playbackData.note2, 1 * t, now + (1 * t));
    }
    
    prepAnswer('status-direct', 'grid-direct', playbackData.isHarmonic ? 1500 * t : 2000 * t);
};

// 2. Context Intervals
const playContext = async (contextType) => {
    await initAudio();
    if (activeSettings.intervals.length === 0) return alert("Enable intervals in Settings!");

    if (!currentQuestion || currentQuestion.mode !== 'Context' || currentQuestion.context !== contextType) {
        const rootMidi = Math.floor(Math.random() * 12) + 60; // C4 to B4
        const intervalStr = activeSettings.intervals[Math.floor(Math.random() * activeSettings.intervals.length)];
        const intervalSemitones = INTERVALS.indexOf(intervalStr) + 1;
        
        // --- NEW: Random Octave Offset ---
        // Math.random() * 3 gives 0, 1, or 2. We subtract 1 to get: -1, 0, or +1.
        // Multiply by 12 to shift by -1 octave, 0 octaves, or +1 octave.
        const octaveOffset = (Math.floor(Math.random() * 3) - 1) * 12;
        const targetMidi = rootMidi + intervalSemitones + octaveOffset;
        // ---------------------------------
        
        currentQuestion = { answer: intervalStr, mode: 'Context', context: contextType, rootMidi: rootMidi };
        
        const chords = contextType === 'Major' ? [[0,4,7], [5,9,12], [7,11,14], [0,4,7]] : [[0,3,7], [5,8,12], [7,11,14], [0,3,7]];
        const chordsNotes = chords.map(chord => chord.map(semi => midiToNote(rootMidi + semi)));
        
        // Pass the new randomized targetMidi into the playback data
        playbackData = { chords: chordsNotes, target: midiToNote(targetMidi) };
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

document.getElementById('play-progression').onclick = async () => {
    await initAudio(); 
    if (activeSettings.targetChords.length === 0) return alert("Enable chords in Settings!");
    
    const now = Tone.now();
    const t = 1 / activeSettings.speed;
    
    const availableMajor = Object.keys(KEY_CHORDS.major).filter(c => activeSettings.targetChords.includes(c));
    const availableMinor = Object.keys(KEY_CHORDS.minor).filter(c => activeSettings.targetChords.includes(c));
    
    if (availableMajor.length === 0 && availableMinor.length === 0) {
        return alert("No valid chords selected for the current mode! Check your settings.");
    }

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
    
    const cadenceNumerals = isMajor ? ['I', 'IV', 'V', 'I'] : ['i', 'iv', 'V', 'i'];
    const cadenceChords = cadenceNumerals.map(numeral => {
        const baseMidi = chordDict[numeral].map(offset => rootMidi + offset);
        return midiToNotes(invertChord(baseMidi));
    });

    const randomTargetNumeral = availableChords[Math.floor(Math.random() * availableChords.length)];
    const targetBaseMidi = chordDict[randomTargetNumeral].map(offset => rootMidi + offset);
    const targetChord = midiToNotes(invertChord(targetBaseMidi.map(note => note + 12)));

    currentQuestion = { answer: randomTargetNumeral, mode: 'ChordInKey', context: mode, rootMidi: rootMidi };
    playbackData = { cadenceChords: cadenceChords, targetChord: targetChord };

    let timeOffset = 0;
    cadenceChords.forEach(chordNotes => {
        piano.triggerAttackRelease(chordNotes, 1 * t, now + timeOffset);
        timeOffset += (1 * t);
    });
    
    timeOffset += (1 * t); 
    piano.triggerAttackRelease(targetChord, 2.5 * t, now + timeOffset);
    
    prepAnswer('status-progressions', 'grid-progressions', (timeOffset + 2.5) * 1000 * t);
};

// --- REVIEW & REPLAY ---
async function replayLastQuestion() {
    if (!lastPlaybackData || !lastQuestionDetails) return;
    await initAudio();
    const now = Tone.now();
    const t = 1 / activeSettings.speed;

    if (lastQuestionDetails.mode === 'Direct') {
        if (lastPlaybackData.isHarmonic) {
            piano.triggerAttackRelease([lastPlaybackData.note1, lastPlaybackData.note2], 1.5 * t, now);
        } else {
            piano.triggerAttackRelease(lastPlaybackData.note1, 1 * t, now);
            piano.triggerAttackRelease(lastPlaybackData.note2, 1 * t, now + (1 * t));
        }
    } else if (lastQuestionDetails.mode === 'Context') {
        lastPlaybackData.chords.forEach((chordNotes, index) => {
            const duration = index === 3 ? 1.5 * t : 0.8 * t;
            piano.triggerAttackRelease(chordNotes, duration, now + (index * 0.8 * t));
        });
        piano.triggerAttackRelease(lastPlaybackData.target, 1.5 * t, now + (3.5 * t));
    } else if (lastQuestionDetails.mode === 'ChordInKey') {
        let timeOffset = 0;
        lastPlaybackData.cadenceChords.forEach(chordNotes => {
            piano.triggerAttackRelease(chordNotes, 1 * t, now + timeOffset);
            timeOffset += (1 * t);
        });
        timeOffset += (1 * t);
        piano.triggerAttackRelease(lastPlaybackData.targetChord, 2.5 * t, now + timeOffset);
    }
}

async function playReviewInterval(semitones) {
    if (!lastQuestionDetails || !lastQuestionDetails.rootMidi) return;
    await initAudio();
    
    const now = Tone.now();
    const t = 1 / activeSettings.speed;
    const rootMidi = lastQuestionDetails.rootMidi;
    const dir = lastQuestionDetails.direction || 'Ascending';

    let targetMidi = rootMidi + semitones;
    if (dir === 'Descending') {
        targetMidi = rootMidi - semitones;
    }

    if (dir === 'Harmonic') {
        piano.triggerAttackRelease([midiToNote(rootMidi), midiToNote(targetMidi)], 1.5 * t, now);
    } else {
        piano.triggerAttackRelease(midiToNote(rootMidi), 1 * t, now);
        piano.triggerAttackRelease(midiToNote(targetMidi), 1.5 * t, now + (1 * t));
    }
}

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
    
    updateSessionTracker(isCorrect);
    
    const grid = document.getElementById(gridId);
    Array.from(grid.children).forEach(btn => {
        if (btn.innerText === currentQuestion.answer) btn.classList.add('correct');
        else if (btn.innerText === selected && !isCorrect) btn.classList.add('wrong');
    });

    const statusMap = { 'grid-direct': 'status-direct', 'grid-context': 'status-context', 'grid-progressions': 'status-progressions' };
    const statusContainer = document.getElementById(statusMap[gridId]);
    statusContainer.innerHTML = ''; 
    
    const msgText = document.createElement('div');
    msgText.innerText = isCorrect ? "Correct!" : `Incorrect. It was ${currentQuestion.answer}.`;
    statusContainer.appendChild(msgText);

    lastPlaybackData = playbackData;
    lastQuestionDetails = currentQuestion;

    const reviewContainer = document.createElement('div');
    reviewContainer.style.marginTop = '15px';
    reviewContainer.style.display = 'flex';
    reviewContainer.style.flexDirection = 'column';
    reviewContainer.style.alignItems = 'center';
    reviewContainer.style.gap = '15px';

    const replayBtn = document.createElement('button');
    replayBtn.innerText = "🔊 Hear Question Again";
    replayBtn.style.padding = '8px 16px';
    replayBtn.style.cursor = 'pointer';
    replayBtn.style.backgroundColor = '#4f46e5';
    replayBtn.style.color = 'white';
    replayBtn.style.border = 'none';
    replayBtn.style.borderRadius = '5px';
    replayBtn.onclick = replayLastQuestion;
    reviewContainer.appendChild(replayBtn);

    const intervalsLabel = document.createElement('div');
    
    let dirTxt = 'ascending';
    if (lastQuestionDetails.direction === 'Descending') dirTxt = 'descending';
    else if (lastQuestionDetails.direction === 'Harmonic') dirTxt = 'harmonic';
    
    intervalsLabel.innerText = `Compare specific ${dirTxt} intervals against the Root note:`;
    intervalsLabel.style.fontSize = '0.9em';
    intervalsLabel.style.color = '#9ca3af';
    reviewContainer.appendChild(intervalsLabel);

    const intervalsGrid = document.createElement('div');
    intervalsGrid.style.display = 'flex';
    intervalsGrid.style.flexWrap = 'wrap';
    intervalsGrid.style.gap = '5px';
    intervalsGrid.style.justifyContent = 'center';
    intervalsGrid.style.maxWidth = '500px';

    const reviewIntervals = [
        { name: "Root", semi: 0 }, { name: "m2", semi: 1 }, { name: "M2", semi: 2 },
        { name: "m3", semi: 3 }, { name: "M3", semi: 4 }, { name: "P4", semi: 5 },
        { name: "TT", semi: 6 }, { name: "P5", semi: 7 }, { name: "m6", semi: 8 },
        { name: "M6", semi: 9 }, { name: "m7", semi: 10 }, { name: "M7", semi: 11 },
        { name: "8va", semi: 12 }
    ];

    reviewIntervals.forEach(int => {
        const btn = document.createElement('button');
        btn.innerText = int.name;
        btn.style.padding = '6px 10px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '0.85em';
        btn.style.backgroundColor = '#374151';
        btn.style.color = 'white';
        btn.style.border = '1px solid #4b5563';
        btn.style.borderRadius = '4px';
        
        btn.onmouseover = () => btn.style.backgroundColor = '#4b5563';
        btn.onmouseout = () => btn.style.backgroundColor = '#374151';
        
        btn.onclick = () => playReviewInterval(int.semi);
        intervalsGrid.appendChild(btn);
    });

    reviewContainer.appendChild(intervalsGrid);
    statusContainer.appendChild(reviewContainer);
    
    // =========================================================
    // NEW: Define the stat tracking key based on direction
    let statKey = currentQuestion.answer;
    if (currentQuestion.mode === 'Direct') {
        // e.g. changes "M3" to "Descending M3" for the stats
        statKey = `${currentQuestion.direction} ${currentQuestion.answer}`;
    }
    // =========================================================

    let stats = JSON.parse(localStorage.getItem('harmonyStats')) || {};
    if (!stats[statKey]) stats[statKey] = { attempts: 0, correct: 0 };
    stats[statKey].attempts++;
    if (isCorrect) stats[statKey].correct++;
    localStorage.setItem('harmonyStats', JSON.stringify(stats));

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const mode = currentQuestion.mode; 

    let timeStats = JSON.parse(localStorage.getItem('harmonyTimeStats')) || {
        'Direct': {}, 'Context': {}, 'ChordInKey': {}
    };

    if (!timeStats[mode]) timeStats[mode] = {};
    if (!timeStats[mode][statKey]) timeStats[mode][statKey] = {};
    if (!timeStats[mode][statKey][today]) timeStats[mode][statKey][today] = { attempts: 0, correct: 0 };

    timeStats[mode][statKey][today].attempts++;
    if (isCorrect) timeStats[mode][statKey][today].correct++;

    localStorage.setItem('harmonyTimeStats', JSON.stringify(timeStats));

    fetch(GOOGLE_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: currentQuestion.mode,
            context: currentQuestion.context,
            question: statKey,  // Send the detailed stat key to Google Sheets!
            isCorrect: isCorrect,
            responseTime: responseTime
        })
    }).catch(e => console.error(e));

    currentQuestion = null;
    playbackData = null;
    
    grid.classList.remove('active');
}

// --- DASHBOARD ---
let chartInstance = null;
let currentChartMode = 'Direct';

function renderChart() {
    let chartControls = document.getElementById('chart-controls');
    if (!chartControls) {
        chartControls = document.createElement('div');
        chartControls.id = 'chart-controls';
        chartControls.style.marginBottom = '20px';
        chartControls.style.textAlign = 'center';
        chartControls.innerHTML = `
            <label style="margin-right: 10px; font-weight: bold;">Select Training Mode:</label>
            <select id="chart-mode-select" style="padding: 8px; border-radius: 5px; background: #374151; color: white; border: none;">
                <option value="Direct">Direct Intervals</option>
                <option value="Context">Context Intervals</option>
                <option value="ChordInKey">Chords in Key</option>
            </select>
        `;
        
        const canvas = document.getElementById('accuracyChart');
        canvas.parentNode.insertBefore(chartControls, canvas);

        document.getElementById('chart-mode-select').addEventListener('change', (e) => {
            currentChartMode = e.target.value;
            drawTimeChart();
        });
    }
    
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#e5e7eb';
        drawTimeChart();
    }
}

function drawTimeChart() {
    const timeStats = JSON.parse(localStorage.getItem('harmonyTimeStats')) || {};
    const modeData = timeStats[currentChartMode] || {};

    const allDates = new Set();
    Object.keys(modeData).forEach(item => {
        Object.keys(modeData[item]).forEach(date => allDates.add(date));
    });
    const sortedDates = Array.from(allDates).sort();

    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];

    const datasets = Object.keys(modeData).map((item, index) => {
        const dataPoints = sortedDates.map(date => {
            const dayStat = modeData[item][date];
            if (!dayStat || dayStat.attempts === 0) return null; 
            return Math.round((dayStat.correct / dayStat.attempts) * 100);
        });

        return {
            label: item,
            data: dataPoints,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length],
            borderWidth: 3,
            tension: 0.3, 
            spanGaps: true 
        };
    });

    if (chartInstance) chartInstance.destroy();
    const ctx = document.getElementById('accuracyChart');
    if (!ctx) return;
    
    chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: datasets
        },
        options: {
            responsive: true,
            scales: {
                y: { 
                    beginAtZero: true, 
                    max: 100, 
                    title: { display: true, text: 'Accuracy %' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                x: { 
                    title: { display: true, text: 'Date' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            },
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}

// Initialize UI
buildSettings();
buildGrids();
buildSessionTracker();