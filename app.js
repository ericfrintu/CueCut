/**
 * CueCut - Soccer Reaction HUD
 * Main application logic
 */

// ============================================================================
// DATA MODEL
// ============================================================================

const CUE_BANK = ['LEFT', 'RIGHT', 'DROP', 'TURN', 'GO'];

class RepData {
    constructor(cue, sessionId) {
        this.id = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.sessionId = sessionId;
        this.timestamp = new Date().toISOString();
        this.cue = cue;
        this.cueStartMs = null;
        this.firstMovementMs = null;
        this.finishMs = null;
        this.reactionMs = null;
        this.movementMs = null;
        this.totalMs = null;
        this.timingMode = 'manual';
        this.motionStartMs = null;
        this.coachGood = '';
        this.coachFix = '';
        this.coachRunType = '';
        this.coachCue = '';
        this.coachDrill = '';
        this.coachScore = '';
        this.coachConfidence = '';
        this.coachMoment = '';
        this.coachStrengths = [];
        this.coachFixes = [];
        this.notes = '';
    }

    calculateTimings() {
        if (this.cueStartMs && this.firstMovementMs) {
            this.reactionMs = this.firstMovementMs - this.cueStartMs;
        }
        if (this.firstMovementMs && this.finishMs) {
            this.movementMs = this.finishMs - this.firstMovementMs;
        }
        if (this.cueStartMs && this.finishMs) {
            this.totalMs = this.finishMs - this.cueStartMs;
        }
    }

    toCSV() {
        return [
            this.id,
            this.timestamp,
            this.cue,
            this.cueStartMs || '',
            this.firstMovementMs || '',
            this.finishMs || '',
            this.reactionMs || '',
            this.movementMs || '',
            this.totalMs || '',
            this.timingMode,
            this.motionStartMs || '',
            this.coachRunType || '',
            this.coachGood || '',
            this.coachFix || '',
            this.coachCue || '',
            this.coachDrill || '',
            this.coachScore || '',
            this.coachConfidence || '',
            this.coachMoment || '',
            this.notes
        ].map(RepData.toCSVCell).join(',');
    }

    static toCSVHeader() {
        return 'rep_id,timestamp,cue,cue_start_ms,first_movement_ms,finish_ms,reaction_ms,movement_ms,total_ms,timing_mode,motion_start_ms,coach_run_type,coach_good,coach_fix,coach_cue,coach_drill,coach_score,coach_confidence,coach_moment,notes';
    }

    static toCSVCell(value) {
        const text = String(value ?? '');
        if (!/[",\n]/.test(text)) return text;
        return `"${text.replace(/"/g, '""')}"`;
    }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

class Settings {
    constructor() {
        this.defaults = {
            audioEnabled: true,
            timingMode: 'manual',
            speechRate: 1.0,
            sessionGoalReps: 0,
            delayMin: 1.0,
            delayMax: 3.0,
            enabledCues: [...CUE_BANK],
            motionDetectionEnabled: false
        };
        this.load();
    }

    load() {
        const saved = localStorage.getItem('cuecut_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.data = { ...this.defaults, ...parsed };
            } catch (e) {
                console.error('Failed to parse settings:', e);
                this.data = { ...this.defaults };
            }
        } else {
            this.data = { ...this.defaults };
        }
    }

    save() {
        localStorage.setItem('cuecut_settings', JSON.stringify(this.data));
    }

    get(key) {
        return this.data[key];
    }

    set(key, value) {
        this.data[key] = value;
        this.save();
    }

    reset() {
        this.data = { ...this.defaults };
        this.save();
    }
}

// ============================================================================
// MOTION DETECTION
// ============================================================================

class MotionDetector {
    constructor() {
        this.isAvailable = false;
        this.isListening = false;
        this.accelThreshold = 25; // m/s²
        this.gyroThreshold = 100; // deg/s
        this.startTime = null;
        this.motionDetected = false;
        this.onMotionDetected = null;
        this.checkPermission();
    }

    checkPermission() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            this.isAvailable = 'permission-required';
        } else if (typeof DeviceMotionEvent !== 'undefined') {
            this.isAvailable = 'available';
        } else {
            this.isAvailable = false;
        }
    }

    async requestPermission() {
        if (this.isAvailable === 'permission-required') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') {
                    this.isAvailable = 'available';
                    return true;
                } else {
                    this.isAvailable = false;
                    return false;
                }
            } catch (error) {
                console.error('Motion permission denied:', error);
                this.isAvailable = false;
                return false;
            }
        }
        return this.isAvailable === 'available';
    }

    start() {
        if (this.isAvailable !== 'available') return;
        
        this.startTime = performance.now();
        this.motionDetected = false;
        this.isListening = true;

        window.addEventListener('devicemotion', this.handleMotionEvent.bind(this));
    }

    stop() {
        this.isListening = false;
        window.removeEventListener('devicemotion', this.handleMotionEvent.bind(this));
    }

    handleMotionEvent(event) {
        if (!this.isListening || this.motionDetected) return;

        const accel = event.acceleration || {};
        const ax = accel.x || 0;
        const ay = accel.y || 0;
        const az = accel.z || 0;

        const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);

        if (magnitude > this.accelThreshold) {
            this.motionDetected = true;
            const detectedTime = performance.now();
            if (this.onMotionDetected) {
                this.onMotionDetected(detectedTime);
            }
            this.stop();
        }
    }

    getStatus() {
        if (this.isAvailable === 'available') {
            return 'Motion: available';
        } else if (this.isAvailable === 'permission-required') {
            return 'Motion: needs permission';
        } else {
            return 'Motion: unavailable';
        }
    }
}

// ============================================================================
// AUDIO FEEDBACK
// ============================================================================

class AudioFeedback {
    constructor(settings) {
        this.settings = settings;
        this.synth = window.speechSynthesis;
        this.isSupported = !!this.synth;
        this.audioContext = null;
    }

    playCue(cueText) {
        if (!this.settings.get('audioEnabled')) return;

        const pattern = this.getCuePattern(cueText);
        if (!pattern) return;

        if (this.synth) {
            this.synth.cancel();
        }
        this.playTonePattern(pattern);
    }

    playFeedback(text) {
        if (!this.settings.get('audioEnabled') || !this.isSupported) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        this.synth.cancel();
        this.synth.speak(utterance);
    }

    stop() {
        if (this.synth) {
            this.synth.cancel();
        }
    }

    getAudioContext() {
        if (!this.audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;
            this.audioContext = new AudioContextClass();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        return this.audioContext;
    }

    getCuePattern(cueText) {
        const patterns = {
            GO: [{ frequency: 1320, duration: 0.18, pan: 0 }],
            LEFT: [{ frequency: 720, duration: 0.16, pan: -1 }],
            RIGHT: [{ frequency: 720, duration: 0.16, pan: 1 }],
            TURN: [{ frequency: 220, duration: 0.3, pan: 0 }],
            DROP: [
                { frequency: 560, duration: 0.12, pan: 0 },
                { frequency: 560, duration: 0.12, pan: 0, delay: 0.18 }
            ]
        };

        return patterns[cueText] || null;
    }

    playTonePattern(pattern) {
        const context = this.getAudioContext();
        if (!context) return;

        pattern.forEach(tone => {
            const startTime = context.currentTime + (tone.delay || 0);
            this.playTone(context, tone.frequency, tone.duration, tone.pan, startTime);
        });
    }

    playTone(context, frequency, duration, pan, startTime) {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        const panner = typeof context.createStereoPanner === 'function'
            ? context.createStereoPanner()
            : null;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);

        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.35, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        if (panner) {
            panner.pan.setValueAtTime(pan, startTime);
            oscillator.connect(gainNode);
            gainNode.connect(panner);
            panner.connect(context.destination);
        } else {
            oscillator.connect(gainNode);
            gainNode.connect(context.destination);
        }

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.03);
    }
}

// ============================================================================
// DATA STORAGE
// ============================================================================

class DataStorage {
    constructor() {
        this.storageKey = 'cuecut_reps';
    }

    addRep(repData) {
        const reps = this.getAllReps();
        reps.push(repData);
        localStorage.setItem(this.storageKey, JSON.stringify(reps));
    }

    saveRep(repData) {
        const reps = this.getAllReps();
        const existingIndex = reps.findIndex(rep => rep.id === repData.id);

        if (existingIndex >= 0) {
            reps[existingIndex] = repData;
        } else {
            reps.push(repData);
        }

        localStorage.setItem(this.storageKey, JSON.stringify(reps));
    }

    getAllReps() {
        const data = localStorage.getItem(this.storageKey);
        if (!data) return [];
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('Failed to parse reps:', e);
            return [];
        }
    }

    getRepsBySession(sessionId) {
        return this.getAllReps().filter(rep => rep.sessionId === sessionId);
    }

    deleteAll() {
        localStorage.removeItem(this.storageKey);
    }

    getStats() {
        const reps = this.getAllReps();
        if (reps.length === 0) {
            return {
                totalReps: 0,
                avgReactionMs: 0,
                bestReactionMs: 0,
                avgMovementMs: 0,
            };
        }

        const completedReps = reps.filter(r => r.reactionMs !== null && r.totalMs !== null);

        const reactionTimes = completedReps.map(r => r.reactionMs).filter(t => t !== null);
        const movementTimes = completedReps.map(r => r.movementMs).filter(t => t !== null);

        return {
            totalReps: reps.length,
            avgReactionMs: reactionTimes.length > 0 ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length : 0,
            bestReactionMs: reactionTimes.length > 0 ? Math.min(...reactionTimes) : 0,
            avgMovementMs: movementTimes.length > 0 ? movementTimes.reduce((a, b) => a + b, 0) / movementTimes.length : 0
        };
    }

    exportCSV(reps = this.getAllReps()) {
        if (reps.length === 0) return RepData.toCSVHeader() + '\n';

        let csv = RepData.toCSVHeader() + '\n';
        reps.forEach(repObj => {
            const rep = new RepData(repObj.cue);
            Object.assign(rep, repObj);
            csv += rep.toCSV() + '\n';
        });
        return csv;
    }
}

class CloudStorage {
    constructor() {
        this.firebase = null;
        this.isAvailable = false;
        this.pendingTasks = [];
        this.maxPendingTasks = 25;

        this.connectIfReady();
        window.addEventListener('cuecut:firebase-ready', () => this.connectIfReady());
    }

    connectIfReady() {
        if (this.isAvailable || !window.CueCutFirebase?.db) {
            return;
        }

        this.firebase = window.CueCutFirebase;
        this.isAvailable = true;
        this.flushPendingTasks();
    }

    queueTask(task) {
        if (!this.isAvailable) {
            if (this.pendingTasks.length < this.maxPendingTasks) {
                this.pendingTasks.push(task);
            }
            return;
        }

        task().catch(error => console.warn('Firestore sync failed:', error));
    }

    flushPendingTasks() {
        const tasks = [...this.pendingTasks];
        this.pendingTasks = [];
        tasks.forEach(task => this.queueTask(task));
    }

    saveSession(sessionMeta) {
        this.queueTask(async () => {
            const { db, doc, setDoc, serverTimestamp } = this.firebase;
            const sessionRef = doc(db, 'sessions', sessionMeta.sessionId);

            await setDoc(sessionRef, {
                ...sessionMeta,
                updatedAt: serverTimestamp()
            }, { merge: true });

            if (sessionMeta.sessionCode) {
                const sessionCodeRef = doc(db, 'sessionCodes', sessionMeta.sessionCode);
                await setDoc(sessionCodeRef, {
                    sessionId: sessionMeta.sessionId,
                    sessionCode: sessionMeta.sessionCode,
                    startedAt: sessionMeta.startedAt || null,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
        });
    }

    saveRep(repData, sessionMeta = {}) {
        this.queueTask(async () => {
            const { db, doc, setDoc, serverTimestamp } = this.firebase;
            const sessionId = repData.sessionId;
            const sessionRef = doc(db, 'sessions', sessionId);
            const repRef = doc(db, 'sessions', sessionId, 'reps', repData.id);

            await setDoc(sessionRef, {
                sessionId,
                sessionCode: sessionMeta.sessionCode || repData.sessionCode || null,
                startedAt: sessionMeta.startedAt || null,
                updatedAt: serverTimestamp()
            }, { merge: true });

            if (sessionMeta.sessionCode || repData.sessionCode) {
                const sessionCode = sessionMeta.sessionCode || repData.sessionCode;
                const sessionCodeRef = doc(db, 'sessionCodes', sessionCode);
                await setDoc(sessionCodeRef, {
                    sessionId,
                    sessionCode,
                    startedAt: sessionMeta.startedAt || null,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            await setDoc(repRef, {
                ...repData,
                uploadedAt: serverTimestamp()
            }, { merge: true });
        });
    }

    updateActiveRep(sessionId, activeRep) {
        this.queueTask(async () => {
            const { db, doc, setDoc, serverTimestamp } = this.firebase;
            await setDoc(doc(db, 'sessions', sessionId), {
                activeRep,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });
    }

    saveSessionSettings(sessionId, sessionSettings) {
        this.queueTask(async () => {
            const { db, doc, setDoc, serverTimestamp } = this.firebase;
            await setDoc(doc(db, 'sessions', sessionId), {
                sessionSettings,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });
    }

    subscribeToSession(sessionId, callback) {
        if (!this.isAvailable || !this.firebase.onSnapshot) {
            return null;
        }

        const { db, doc, onSnapshot } = this.firebase;
        return onSnapshot(doc(db, 'sessions', sessionId), snapshot => {
            if (snapshot.exists()) {
                callback(snapshot.data());
            }
        }, error => console.warn('Session realtime sync failed:', error));
    }
}

// ============================================================================
// APP CONTROLLER
// ============================================================================

class CueCutApp {
    constructor() {
        this.settings = new Settings();
        this.storage = new DataStorage();
        this.cloud = new CloudStorage();
        this.audio = new AudioFeedback(this.settings);
        this.motionDetector = new MotionDetector();

        this.currentRepData = null;
        this.currentSessionId = null;
        this.currentSessionCode = null;
        this.currentSummarySessionId = null;
        this.currentDataSessionId = null;
        this.currentFeedbackScoreNote = null;
        this.currentCoachFeedback = null;
        this.lastCoachFeedbackKey = null;
        this.coachFeedbackFallbackTimer = null;
        this.sessionUnsubscribe = null;
        this.currentScreen = 'homeScreen';
        this.focusedButton = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
        this.updateMotionStatus();
        this.goToScreen('homeScreen');
    }

    setupEventListeners() {
        // Home Screen
        document.getElementById('startSessionBtn').addEventListener('click', () => this.startSession());
        document.getElementById('viewDataBtn').addEventListener('click', () => this.viewData());
        document.getElementById('viewScoresBtn').addEventListener('click', () => this.viewScores());
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.goToScreen('settingsScreen'));
        }

        // Ready Screen
        document.getElementById('startRepBtn').addEventListener('click', () => this.startRep());
        document.getElementById('readyBackBtn').addEventListener('click', () => this.goToHome());

        // Movement Screen
        document.getElementById('reactionFinishedBtn').addEventListener('click', () => this.finishReaction());

        // Feedback Screen
        document.getElementById('nextRepBtn').addEventListener('click', () => this.goToReady());
        document.getElementById('endSessionBtn').addEventListener('click', () => this.endSession());

        // Summary Screen
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportCurrentSessionData());
        document.getElementById('summaryHomeBtn').addEventListener('click', () => this.goToHome());

        // Data View Screen
        document.getElementById('dataViewExportBtn').addEventListener('click', () => this.exportCurrentDataView());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        document.getElementById('dataViewHomeBtn').addEventListener('click', () => this.goToHome());

        // Scores Screen
        document.getElementById('resetScoresBtn').addEventListener('click', () => this.resetScores());
        document.getElementById('scoresHomeBtn').addEventListener('click', () => this.goToHome());

        // Settings
        this.loadSettingsUI();

        // Keyboard input
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Update session count
        setInterval(() => this.updateSessionCount(), 1000);
    }

    loadSettingsUI() {
        document.getElementById('audioToggle').value = this.settings.get('audioEnabled') ? 'on' : 'off';
        document.getElementById('audioToggle').addEventListener('change', (e) => {
            this.settings.set('audioEnabled', e.target.value === 'on');
        });

        document.getElementById('timingModeSelect').value = this.settings.get('timingMode');
        document.getElementById('timingModeSelect').addEventListener('change', (e) => {
            this.settings.set('timingMode', e.target.value);
        });

        document.getElementById('speechRateSelect').value = this.settings.get('speechRate');
        document.getElementById('speechRateSelect').addEventListener('change', (e) => {
            this.settings.set('speechRate', parseFloat(e.target.value));
        });

        document.getElementById('sessionGoalSelect').value = String(this.settings.get('sessionGoalReps'));
        document.getElementById('sessionGoalSelect').addEventListener('change', (e) => {
            this.settings.set('sessionGoalReps', parseInt(e.target.value, 10));
        });

        document.getElementById('delayMin').value = this.settings.get('delayMin');
        document.getElementById('delayMin').addEventListener('change', (e) => {
            this.settings.set('delayMin', parseFloat(e.target.value));
        });

        document.getElementById('delayMax').value = this.settings.get('delayMax');
        document.getElementById('delayMax').addEventListener('change', (e) => {
            this.settings.set('delayMax', parseFloat(e.target.value));
        });

        // Cue toggles
        document.querySelectorAll('.cueToggle').forEach(checkbox => {
            const enabledCues = this.settings.get('enabledCues');
            checkbox.checked = enabledCues.includes(checkbox.value);
            checkbox.addEventListener('change', () => {
                const cues = Array.from(document.querySelectorAll('.cueToggle:checked')).map(c => c.value);
                if (cues.length > 0) {
                    this.settings.set('enabledCues', cues);
                }
            });
        });

        document.getElementById('resetDataBtn').addEventListener('click', () => {
            if (confirm('Reset all data? This cannot be undone.')) {
                this.storage.deleteAll();
                this.settings.reset();
                this.loadSettingsUI();
                alert('All data reset.');
                this.goToHome();
            }
        });

        document.getElementById('settingsBackBtn').addEventListener('click', () => this.goToHome());
    }

    loadSettings() {
        const enabledCues = this.settings.get('enabledCues') || [];
        const activeCues = enabledCues.filter(cue => CUE_BANK.includes(cue));

        if (activeCues.length === 0) {
            this.settings.set('enabledCues', [...CUE_BANK]);
        } else if (activeCues.length !== enabledCues.length) {
            this.settings.set('enabledCues', activeCues);
        }
    }

    updateMotionStatus() {
        const status = this.motionDetector.getStatus();
        const statusEl = document.getElementById('motionStatus');
        if (statusEl) {
            statusEl.textContent = status;
        }
    }

    updateSessionCount() {
        const reps = this.storage.getAllReps();
        const countEl = document.getElementById('sessionCount');
        if (countEl) {
            countEl.textContent = `Reps: ${reps.length}`;
        }
    }

    handleKeyboard(event) {
        // Global navigation
        if (event.key === 'Escape' || event.key === 'Backspace') {
            if (this.currentScreen === 'settingsScreen') {
                this.goToHome();
            } else if (this.currentScreen === 'dataViewScreen') {
                this.goToHome();
            } else if (this.currentScreen === 'scoresScreen') {
                this.goToHome();
            }
            return;
        }

        // Arrow key navigation
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            this.navigateWithArrows(event.key);
            return;
        }

        // Enter key for select
        if (event.key === 'Enter') {
            event.preventDefault();
            this.handleEnter();
            return;
        }
    }

    navigateWithArrows(direction) {
        const screen = document.getElementById(this.currentScreen);
        const focusables = Array.from(screen.querySelectorAll('.focusable'));

        if (focusables.length === 0) return;

        let currentFocus = document.activeElement;
        let currentIndex = focusables.indexOf(currentFocus);

        if (currentIndex === -1) {
            focusables[0].focus();
            return;
        }

        let newIndex = currentIndex;

        if (direction === 'ArrowRight' || direction === 'ArrowDown') {
            newIndex = (currentIndex + 1) % focusables.length;
        } else if (direction === 'ArrowLeft' || direction === 'ArrowUp') {
            newIndex = (currentIndex - 1 + focusables.length) % focusables.length;
        }

        focusables[newIndex].focus();
    }

    handleEnter() {
        const focused = document.activeElement;
        if (focused && (focused.classList.contains('focusable') || focused.tagName === 'BUTTON')) {
            focused.click();
        }
    }

    goToScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        const targetScreen = document.getElementById(screenName);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenName;

            // Focus first focusable element
            setTimeout(() => {
                const focusable = targetScreen.querySelector('.focusable');
                if (focusable) focusable.focus();
            }, 100);
        }
    }

    startSession() {
        this.currentSessionId = `session_${Date.now()}`;
        this.currentSessionCode = this.generateSessionCode();
        this.currentSummarySessionId = this.currentSessionId;
        this.currentCoachFeedback = null;
        this.lastCoachFeedbackKey = null;
        this.cloud.saveSession({
            sessionId: this.currentSessionId,
            sessionCode: this.currentSessionCode,
            startedAt: new Date().toISOString(),
            sessionSettings: this.getSessionSettingsSnapshot(),
            source: 'glasses'
        });
        this.subscribeToCurrentSession();
        this.goToReady();
    }

    getSessionSettingsSnapshot() {
        return {
            audioEnabled: this.settings.get('audioEnabled'),
            timingMode: this.settings.get('timingMode'),
            speechRate: this.settings.get('speechRate'),
            sessionGoalReps: this.settings.get('sessionGoalReps'),
            delayMin: this.settings.get('delayMin'),
            delayMax: this.settings.get('delayMax'),
            enabledCues: this.settings.get('enabledCues')
        };
    }

    subscribeToCurrentSession() {
        if (!this.currentSessionId) return;

        if (this.sessionUnsubscribe) {
            this.sessionUnsubscribe();
            this.sessionUnsubscribe = null;
        }

        const unsubscribe = this.cloud.subscribeToSession(this.currentSessionId, sessionData => this.handleSessionUpdate(sessionData));
        if (unsubscribe) {
            this.sessionUnsubscribe = unsubscribe;
            return;
        }

        window.addEventListener('cuecut:firebase-ready', () => {
            if (!this.sessionUnsubscribe && this.currentSessionId) {
                this.sessionUnsubscribe = this.cloud.subscribeToSession(
                    this.currentSessionId,
                    sessionData => this.handleSessionUpdate(sessionData)
                );
            }
        }, { once: true });
    }

    handleSessionUpdate(sessionData) {
        if (sessionData.sessionSettings) {
            this.applySessionSettings(sessionData.sessionSettings);
        }

        const latestFeedback = sessionData.latestTrackingFeedback;
        if (latestFeedback?.repId && latestFeedback.repId === this.currentRepData?.id) {
            this.currentCoachFeedback = latestFeedback;
            this.attachCoachFeedbackToCurrentRep(latestFeedback);
            this.updateCoachFeedbackDisplay();
            this.speakCoachFeedback(latestFeedback);
        }

        if (sessionData.latestTrackerState) {
            this.updateTrackerSyncStatus(sessionData.latestTrackerState);
        }
    }

    applySessionSettings(sessionSettings) {
        const cleaned = {};

        if (typeof sessionSettings.audioEnabled === 'boolean') cleaned.audioEnabled = sessionSettings.audioEnabled;
        if (['manual', 'motion'].includes(sessionSettings.timingMode)) cleaned.timingMode = sessionSettings.timingMode;
        if (Number.isFinite(sessionSettings.speechRate)) cleaned.speechRate = sessionSettings.speechRate;
        if (Number.isFinite(sessionSettings.sessionGoalReps)) cleaned.sessionGoalReps = sessionSettings.sessionGoalReps;
        if (Number.isFinite(sessionSettings.delayMin)) cleaned.delayMin = sessionSettings.delayMin;
        if (Number.isFinite(sessionSettings.delayMax)) cleaned.delayMax = sessionSettings.delayMax;
        if (Array.isArray(sessionSettings.enabledCues)) {
            const validCues = sessionSettings.enabledCues.filter(cue => CUE_BANK.includes(cue));
            if (validCues.length > 0) cleaned.enabledCues = validCues;
        }

        this.settings.data = { ...this.settings.data, ...cleaned };
    }

    generateSessionCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    goToHome() {
        this.goToScreen('homeScreen');
    }

    goToReady() {
        this.currentRepData = null;
        const sessionCodeEl = document.getElementById('readySessionCode');
        if (sessionCodeEl) {
            sessionCodeEl.textContent = this.currentSessionCode || '----';
        }
        this.goToScreen('readyScreen');
    }

    startRep() {
        // Select random cue
        const enabledCues = this.settings.get('enabledCues');
        const cue = enabledCues[Math.floor(Math.random() * enabledCues.length)];

        this.currentRepData = new RepData(cue, this.currentSessionId);
        this.currentRepData.sessionCode = this.currentSessionCode;
        this.currentRepData.timingMode = this.settings.get('timingMode');

        // Show waiting screen
        this.goToScreen('waitingScreen');

        // Random delay
        const delayMin = this.settings.get('delayMin');
        const delayMax = this.settings.get('delayMax');
        const delay = (Math.random() * (delayMax - delayMin) + delayMin) * 1000;

        setTimeout(() => this.showCue(), delay);
    }

    showCue() {
        this.currentRepData.cueStartMs = performance.now();
        this.currentCoachFeedback = null;
        this.lastCoachFeedbackKey = null;
        this.cloud.updateActiveRep(this.currentSessionId, {
            repId: this.currentRepData.id,
            cue: this.currentRepData.cue,
            sessionCode: this.currentSessionCode,
            status: 'active',
            cueStartedAt: new Date().toISOString()
        });
        
        // Update UI
        document.getElementById('cueDisplay').textContent = this.currentRepData.cue;
        document.getElementById('cueSubtext').textContent = 'GO!';
        
        // Play audio
        this.audio.playCue(this.currentRepData.cue);

        // Start motion detection if enabled
        if (this.settings.get('timingMode') === 'motion' && this.motionDetector.isAvailable === 'available') {
            this.motionDetector.onMotionDetected = (detectedTime) => {
                this.currentRepData.motionStartMs = detectedTime - this.currentRepData.cueStartMs;
                this.currentRepData.firstMovementMs = detectedTime;
                this.updateMovementDisplay();
            };
            this.motionDetector.start();
        }

        this.goToScreen('cueScreen');

        // Auto-transition to movement screen after 2 seconds (athlete starts moving)
        setTimeout(() => {
            this.motionDetector.stop();
            this.goToMovementScreen();
        }, 2000);
    }

    goToMovementScreen() {
        document.getElementById('currentCueDisplay').innerHTML = `Cue: <strong>${this.currentRepData.cue}</strong>`;
        const finishButton = document.getElementById('reactionFinishedBtn');
        finishButton.disabled = false;
        finishButton.textContent = 'Reaction Finished';
        this.goToScreen('movementScreen');
    }

    finishReaction() {
        const finishButton = document.getElementById('reactionFinishedBtn');
        if (finishButton.disabled) return;
        finishButton.disabled = true;
        finishButton.textContent = 'Saving...';

        // Record reaction time as now - when cue started
        this.currentRepData.firstMovementMs = performance.now();
        this.currentRepData.calculateTimings();

        this.currentFeedbackScoreNote = this.getScoreNoteForRep(this.currentRepData);
        this.storage.saveRep(this.currentRepData);
        this.cloud.updateActiveRep(this.currentSessionId, {
            repId: this.currentRepData.id,
            cue: this.currentRepData.cue,
            sessionCode: this.currentSessionCode,
            status: 'finished',
            finishedAt: new Date().toISOString(),
            reactionMs: this.currentRepData.reactionMs
        });
        this.cloud.saveRep(this.currentRepData, {
            sessionCode: this.currentSessionCode,
            startedAt: this.getSessionStartedAt(this.currentSessionId)
        });

        const reactionSec = (this.currentRepData.reactionMs / 1000).toFixed(2);
        this.audio.playFeedback(`Reaction ${reactionSec} seconds.`);

        if (this.isSessionGoalReached()) {
            this.endSession();
            return;
        }

        this.showFeedback();
    }

    getSessionStartedAt(sessionId) {
        const timestamp = this.getSessionTimestamp(sessionId);
        return timestamp ? new Date(timestamp).toISOString() : null;
    }

    showFeedback() {
        const rep = this.currentRepData;
        document.getElementById('feedbackCue').textContent = rep.cue;
        document.getElementById('feedbackReaction').textContent = rep.reactionMs !== null ? `${(rep.reactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('feedbackScoreNote').textContent = this.currentFeedbackScoreNote || '—';
        this.updateCoachFeedbackDisplay();
        this.startCoachFeedbackFallback(rep.id);

        this.goToScreen('feedbackScreen');
        if (this.currentCoachFeedback) {
            this.speakCoachFeedback(this.currentCoachFeedback);
        }
    }

    startCoachFeedbackFallback(repId) {
        clearTimeout(this.coachFeedbackFallbackTimer);
        this.coachFeedbackFallbackTimer = setTimeout(() => {
            if (this.currentRepData?.id !== repId || this.currentCoachFeedback?.feedback) {
                return;
            }

            const coachEl = document.getElementById('feedbackCoachNote');
            if (coachEl) {
                coachEl.textContent = 'No phone feedback captured';
            }
        }, 2000);
    }

    attachCoachFeedbackToCurrentRep(latestFeedback) {
        if (!this.currentRepData || !latestFeedback?.feedback) return;

        this.currentRepData.coachRunType = latestFeedback.runType || latestFeedback.cue || '';
        this.currentRepData.coachGood = latestFeedback.feedback.good || '';
        this.currentRepData.coachFix = latestFeedback.feedback.fix || latestFeedback.feedback.message || '';
        this.currentRepData.coachCue = latestFeedback.feedback.cue || '';
        this.currentRepData.coachDrill = latestFeedback.feedback.drill || '';
        this.currentRepData.coachScore = Number.isFinite(latestFeedback.feedback.score) ? latestFeedback.feedback.score : '';
        this.currentRepData.coachConfidence = latestFeedback.feedback.confidence || '';
        this.currentRepData.coachStrengths = latestFeedback.feedback.strengths || [];
        this.currentRepData.coachFixes = latestFeedback.feedback.fixes || [];
        const topIssue = latestFeedback.feedback.issues?.[0];
        this.currentRepData.coachMoment = topIssue?.moment || '';
        this.storage.saveRep(this.currentRepData);
        this.cloud.saveRep(this.currentRepData, {
            sessionCode: this.currentSessionCode,
            startedAt: this.getSessionStartedAt(this.currentSessionId)
        });
    }

    updateTrackerSyncStatus(trackerState) {
        const statusEl = document.getElementById('trackerSyncStatus');
        if (!statusEl) return;

        const status = trackerState.status || 'not connected';
        const label = status === 'recording'
            ? `Tracker: recording ${trackerState.cue || ''}`.trim()
            : `Tracker: ${status}`;

        statusEl.textContent = label;
    }

    updateCoachFeedbackDisplay() {
        const coachEl = document.getElementById('feedbackCoachNote');
        if (!coachEl) return;

        if (!this.currentCoachFeedback?.feedback) {
            coachEl.textContent = 'Waiting for phone data...';
            return;
        }

        const feedback = this.currentCoachFeedback.feedback;
        const runType = this.currentCoachFeedback.runType || this.currentCoachFeedback.cue || 'run';
        const cue = feedback.cue || feedback.fix || feedback.message;
        const score = Number.isFinite(feedback.score) ? ` ${feedback.score}/100.` : '';
        const moment = feedback.issues?.[0]?.moment ? ` ${feedback.issues[0].moment}.` : '';

        coachEl.textContent = `${runType}:${score} ${cue}${moment}`;
    }

    speakCoachFeedback(latestFeedback) {
        if (this.currentScreen !== 'feedbackScreen' || !latestFeedback?.feedback) {
            return;
        }

        const feedback = latestFeedback.feedback;
        const key = `${latestFeedback.repId}_${feedback.fix || feedback.message}`;
        if (key === this.lastCoachFeedbackKey) {
            return;
        }

        this.lastCoachFeedbackKey = key;
        const spokenCue = feedback.cue || feedback.fix || feedback.message;

        this.audio.playFeedback(`Coach cue. ${spokenCue}`);
    }

    getScoreNoteForRep(rep) {
        if (!Number.isFinite(rep.reactionMs)) return '-';

        const previousBest = this.getBestReactionForCue(rep.cue);
        if (!previousBest) {
            return `First ${rep.cue} score`;
        }

        const deltaMs = rep.reactionMs - previousBest.reactionMs;
        if (deltaMs < 0) {
            return `New ${rep.cue} PR by ${(Math.abs(deltaMs) / 1000).toFixed(2)}s`;
        }

        if (deltaMs === 0) {
            return `Tied ${rep.cue} PR`;
        }

        return `+${(deltaMs / 1000).toFixed(2)}s from ${rep.cue} best`;
    }

    getBestReactionForCue(cue) {
        return this.storage.getAllReps()
            .filter(rep => rep.cue === cue && Number.isFinite(rep.reactionMs))
            .sort((a, b) => a.reactionMs - b.reactionMs)[0] || null;
    }

    isSessionGoalReached() {
        const goalReps = this.settings.get('sessionGoalReps');
        if (!goalReps || goalReps <= 0) return false;

        return this.storage.getRepsBySession(this.currentSessionId).length >= goalReps;
    }

    endSession() {
        // Get stats for only this session's reps
        this.currentSummarySessionId = this.currentSessionId;
        if (this.currentSessionId) {
            this.cloud.updateActiveRep(this.currentSessionId, {
                status: 'session-ended',
                endedAt: new Date().toISOString()
            });
        }
        const sessionReps = this.storage.getRepsBySession(this.currentSessionId);
        const stats = this.calculateSessionStats(sessionReps);
        this.showSummary(stats, sessionReps);
    }

    calculateSessionStats(reps) {
        const totalReps = reps.length;

        const reactionTimes = reps.filter(r => r.reactionMs !== null).map(r => r.reactionMs);
        const avgReactionMs = reactionTimes.length > 0 ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length : 0;
        const bestReactionMs = reactionTimes.length > 0 ? Math.min(...reactionTimes) : 0;

        const movementTimes = reps.filter(r => r.movementMs !== null).map(r => r.movementMs);
        const avgMovementMs = movementTimes.length > 0 ? movementTimes.reduce((a, b) => a + b, 0) / movementTimes.length : 0;
        const fatigue = this.calculateFatigue(reps);
        const trackedReps = reps.filter(rep => rep.coachFix).length;
        const coachSummary = this.calculateCoachSummary(reps);

        return { totalReps, trackedReps, avgReactionMs, bestReactionMs, avgMovementMs, fatigue, coachSummary };
    }

    showSummary(stats, sessionReps) {
        document.getElementById('summaryReps').textContent = stats.totalReps;
        document.getElementById('summaryTracked').textContent = `${stats.trackedReps}/${stats.totalReps}`;
        document.getElementById('summaryAvgReaction').textContent = stats.avgReactionMs > 0 ? `${(stats.avgReactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryBestReaction').textContent = stats.bestReactionMs > 0 ? `${(stats.bestReactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryFatigue').textContent = stats.fatigue;
        const focusEl = document.getElementById('summaryCoachFocus');
        if (focusEl) {
            focusEl.textContent = stats.coachSummary?.focus || 'No coach data yet';
        }

        this.drawChart(sessionReps);
        this.goToScreen('summaryScreen');
    }

    calculateCoachSummary(reps) {
        const tracked = reps.filter(rep => rep.coachFix || rep.coachCue);
        if (tracked.length === 0) {
            return { focus: 'No coach data yet' };
        }

        const issueCounts = new Map();
        tracked.forEach(rep => {
            const fixes = Array.isArray(rep.coachFixes) && rep.coachFixes.length
                ? rep.coachFixes
                : [rep.coachFix].filter(Boolean);
            fixes.forEach(fix => {
                const key = String(fix).trim();
                if (!key) return;
                issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
            });
        });

        const mainIssue = [...issueCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        const bestRep = tracked
            .filter(rep => Number.isFinite(Number(rep.coachScore)))
            .sort((a, b) => Number(b.coachScore) - Number(a.coachScore))[0];
        const bestText = bestRep ? ` Best tracked rep: ${bestRep.cue} ${bestRep.coachScore}/100.` : '';

        if (!mainIssue) {
            return { focus: `Main focus: repeat the best body shape.${bestText}` };
        }

        return {
            focus: `Main focus: ${mainIssue[0]} (${mainIssue[1]}/${tracked.length} tracked reps).${bestText}`
        };
    }

    calculateFatigue(reps) {
        const completedReps = reps.filter(rep => Number.isFinite(rep.reactionMs));
        const latestRep = completedReps[completedReps.length - 1];

        if (!latestRep) {
            return 'No fatigue detected';
        }

        const previousSameCueRep = [...completedReps]
            .reverse()
            .find(rep => rep.id !== latestRep.id && rep.cue === latestRep.cue);

        if (!previousSameCueRep) {
            return `No fatigue detected (${latestRep.cue})`;
        }

        const deltaMs = latestRep.reactionMs - previousSameCueRep.reactionMs;

        if (deltaMs <= 10) {
            return `No fatigue detected (${latestRep.cue})`;
        }

        return `${latestRep.cue}: +${(deltaMs / 1000).toFixed(2)}s slower than last ${latestRep.cue}`;
    }

    average(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    drawChart(sessionReps) {
        const chartContainer = document.getElementById('summaryChart');
        chartContainer.innerHTML = '';

        if (sessionReps.length === 0) {
            chartContainer.innerHTML = '<p style="text-align: center; color: #666;">No data to display</p>';
            return;
        }

        // Get reaction times from this session only
        const reactionTimes = sessionReps
            .filter(r => r.reactionMs !== null)
            .map(r => r.reactionMs / 1000);

        if (reactionTimes.length === 0) {
            chartContainer.innerHTML = '<p style="text-align: center; color: #666;">No timing data</p>';
            return;
        }

        const maxTime = Math.max(...reactionTimes);
        const minTime = Math.min(...reactionTimes);
        const range = maxTime - minTime || 0.5;

        chartContainer.innerHTML = '<div class="chart-bar"></div>';
        const barContainer = chartContainer.querySelector('.chart-bar');

        reactionTimes.forEach(time => {
            const height = ((time - minTime) / range) * 100 || 50;
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = `${height}%`;
            bar.title = `${time.toFixed(2)}s`;
            barContainer.appendChild(bar);
        });
    }

    viewData() {
        const allReps = this.storage.getAllReps();
        this.currentDataSessionId = null;

        const sessions = {};
        allReps.forEach(rep => {
            const sessionId = rep.sessionId || 'session_unknown';
            if (!sessions[sessionId]) {
                sessions[sessionId] = [];
            }
            sessions[sessionId].push(rep);
        });

        const container = document.getElementById('dataViewContent');
        const exportButton = document.getElementById('dataViewExportBtn');
        if (exportButton) {
            exportButton.style.display = 'none';
            exportButton.textContent = 'Export';
        }

        if (Object.keys(sessions).length === 0) {
            container.innerHTML = '<p>No sessions yet.</p>';
        } else {
            let html = '<div class="sessions-list">';

            this.getSessionIdsNewestFirst(sessions).forEach(sessionId => {
                const sessionReps = sessions[sessionId];
                const repsCount = sessionReps.length;
                const reactionTimes = sessionReps.filter(rep => rep.reactionMs !== null);
                const avgReaction = reactionTimes.length > 0
                    ? (reactionTimes.reduce((sum, rep) => sum + rep.reactionMs, 0) / reactionTimes.length / 1000).toFixed(2)
                    : '-';
                html += `<button class="session-item focusable" data-session-id="${sessionId}" tabindex="0">
                    <span class="session-title">${this.formatSessionDate(sessionId, sessionReps)}</span>
                    <span>Reps: ${repsCount} | Avg Reaction: ${avgReaction}s</span>
                </button>`;
            });

            html += '</div>';
            container.innerHTML = html;

            container.querySelectorAll('.session-item').forEach(button => {
                button.addEventListener('click', () => this.viewSessionDetails(button.dataset.sessionId));
            });
        }

        this.goToScreen('dataViewScreen');
    }

    viewSessionDetails(sessionId) {
        this.currentDataSessionId = sessionId;
        const sessionReps = this.storage.getRepsBySession(sessionId);
        const stats = this.calculateSessionStats(sessionReps);
        const container = document.getElementById('dataViewContent');
        const exportButton = document.getElementById('dataViewExportBtn');

        if (exportButton) {
            exportButton.style.display = '';
            exportButton.textContent = 'Export Session';
        }

        let html = `<div class="session-detail-header">
            <button id="backToSessionsBtn" class="back-button focusable" tabindex="0">Back to Sessions</button>
            <div>
                <strong>${this.formatSessionDate(sessionId, sessionReps)}</strong><br>
                Reps: ${stats.totalReps} | Tracked: ${stats.trackedReps}/${stats.totalReps}<br>
                    Fatigue: ${stats.fatigue}<br>
                    Focus: ${stats.coachSummary?.focus || 'No coach data yet'}
            </div>
        </div>`;

        html += '<div class="session-details">';
        sessionReps.forEach((rep, index) => {
            const reaction = rep.reactionMs ? (rep.reactionMs / 1000).toFixed(2) + 's' : '-';
            const score = rep.coachScore !== '' && rep.coachScore !== undefined ? ` | Coach: ${rep.coachScore}/100` : '';
            const cue = rep.coachCue ? ` | Cue: ${rep.coachCue}` : '';
            const drill = rep.coachDrill ? ` | Drill: ${rep.coachDrill}` : '';
            const moment = rep.coachMoment ? ` | Moment: ${rep.coachMoment}` : '';
            const coachNote = rep.coachFix ? `${score} | Fix: ${rep.coachFix}${cue}${drill}${moment}` : ' | No coach data';
            html += `<div class="data-item">
                <div><strong>${index + 1}. ${rep.cue}</strong> | ${reaction}${coachNote}</div>
            </div>`;
        });
        html += '</div>';

        container.innerHTML = html;

        const backButton = document.getElementById('backToSessionsBtn');
        if (backButton) {
            backButton.addEventListener('click', () => this.viewData());
            backButton.focus();
        }
    }

    clearHistory() {
        if (!confirm('Clear all stored data sessions? This cannot be undone.')) {
            return;
        }

        this.storage.deleteAll();
        this.currentDataSessionId = null;
        this.currentSummarySessionId = null;
        this.updateSessionCount();
        this.viewData();
    }

    formatSessionDate(sessionId, sessionReps = []) {
        const timestamp = this.getSessionTimestamp(sessionId, sessionReps);

        if (!Number.isFinite(timestamp)) {
            return 'Unknown Session';
        }

        return new Date(timestamp).toLocaleString();
    }

    getSessionIdsNewestFirst(sessions) {
        return Object.keys(sessions).sort((a, b) => {
            return this.getSessionTimestamp(b, sessions[b]) - this.getSessionTimestamp(a, sessions[a]);
        });
    }

    getSessionTimestamp(sessionId, sessionReps = []) {
        const sessionTimestamp = parseInt(String(sessionId).split('_')[1], 10);
        const fallbackTimestamp = sessionReps[0] ? Date.parse(sessionReps[0].timestamp) : NaN;

        if (Number.isFinite(sessionTimestamp)) {
            return sessionTimestamp;
        }

        return Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0;
    }

    viewScores() {
        const scoresByCue = this.getTopScoresByCue();
        const container = document.getElementById('scoresContent');

        if (!scoresByCue.some(group => group.best)) {
            container.innerHTML = '<p>No scores yet.</p>';
            this.goToScreen('scoresScreen');
            return;
        }

        let html = `<table class="scores-table">
            <thead>
                <tr>
                    <th>Drill</th>
                    <th>Best</th>
                    <th>Latest</th>
                    <th>Change</th>
                </tr>
            </thead>
            <tbody>`;

        scoresByCue.forEach(group => {
            html += `<tr>
                <td>${group.cue}</td>
                <td>${group.best ? this.formatSeconds(group.best.reactionMs) : '-'}</td>
                <td>${group.latest ? this.formatSeconds(group.latest.reactionMs) : '-'}</td>
                <td>${this.formatLatestChange(group.best, group.latest)}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
        this.goToScreen('scoresScreen');
    }

    resetScores() {
        if (!confirm('Reset all scores and stored reps? This cannot be undone.')) {
            return;
        }

        this.storage.deleteAll();
        this.currentDataSessionId = null;
        this.currentSummarySessionId = null;
        this.updateSessionCount();
        this.viewScores();
    }

    getTopScoresByCue() {
        const reps = this.storage.getAllReps()
            .filter(rep => Number.isFinite(rep.reactionMs));

        return CUE_BANK
            .map(cue => {
                const cueReps = reps.filter(rep => rep.cue === cue);
                const best = [...cueReps].sort((a, b) => a.reactionMs - b.reactionMs)[0] || null;
                const latest = [...cueReps].sort((a, b) => {
                    return Date.parse(b.timestamp) - Date.parse(a.timestamp);
                })[0] || null;

                return { cue, best, latest };
            });
    }

    formatSeconds(ms) {
        return `${(ms / 1000).toFixed(2)}s`;
    }

    formatLatestChange(best, latest) {
        if (!best || !latest) return '-';

        const deltaMs = latest.reactionMs - best.reactionMs;
        if (Math.abs(deltaMs) < 10) return 'Best';

        const sign = deltaMs > 0 ? '+' : '-';
        return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(2)}s`;
    }

    formatRepDate(timestamp) {
        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return 'Unknown date';
        }

        return date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric'
        });
    }

    exportCurrentSessionData() {
        const sessionId = this.currentSummarySessionId || this.currentSessionId;
        const sessionReps = this.storage.getRepsBySession(sessionId);
        this.exportData(sessionReps, `cuecut_session_${sessionId}`);
    }

    exportCurrentDataView() {
        if (!this.currentDataSessionId) return;

        const sessionReps = this.storage.getRepsBySession(this.currentDataSessionId);
        this.exportData(sessionReps, `cuecut_session_${this.currentDataSessionId}`);
    }

    exportData(reps = this.storage.getAllReps(), filenamePrefix = 'cuecut_data') {
        const csv = this.storage.exportCSV(reps);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new CueCutApp();
    window.app = app;
});
