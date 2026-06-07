/**
 * CueCut - Soccer Reaction HUD
 * Main application logic
 */

// ============================================================================
// DATA MODEL
// ============================================================================

const CUE_BANK = ['FRONT', 'BACK', 'LEFT', 'RIGHT'];
const DRILL_TYPE = '4_direction';
const DEFAULT_FIELD_RADIUS_METERS = 15;
const AUDIO_FEEDBACK_VERSION = 'sound-v1';

class RepData {
    constructor(cue, sessionId) {
        this.id = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.sessionId = sessionId;
        this.timestamp = new Date().toISOString();
        this.cue = cue;
        this.drillType = DRILL_TYPE;
        this.direction = CueCutApp.getDirectionFromCue(cue);
        this.cameraMode = CueCutApp.getCameraModeForCue(cue);
        this.drillFieldRadiusMeters = DEFAULT_FIELD_RADIUS_METERS;
        this.cameraDistanceMeters = '';
        this.cuePlayedAt = '';
        this.cuePlayedAtMs = null;
        this.movementStartedAt = '';
        this.reactionTimeMs = null;
        this.soundId = '';
        this.audioLatencyEstimateMs = '';
        this.audioMode = 'cue_only';
        this.audioFeedbackVersion = AUDIO_FEEDBACK_VERSION;
        this.soundPrint = null;
        this.soundFeedback = null;
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
            this.drillType || '',
            this.direction || '',
            this.cameraMode || '',
            this.drillFieldRadiusMeters || '',
            this.cameraDistanceMeters || '',
            this.cuePlayedAt || '',
            this.movementStartedAt || '',
            this.reactionTimeMs || '',
            this.soundId || '',
            this.audioLatencyEstimateMs || '',
            this.audioMode || '',
            this.audioFeedbackVersion || '',
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
        return 'rep_id,timestamp,cue,drill_type,direction,camera_mode,drill_field_radius_meters,camera_distance_meters,cue_played_at,movement_started_at,reaction_time_ms,sound_id,audio_latency_estimate_ms,audio_mode,audio_feedback_version,cue_start_ms,first_movement_ms,finish_ms,reaction_ms,movement_ms,total_ms,timing_mode,motion_start_ms,coach_run_type,coach_good,coach_fix,coach_cue,coach_drill,coach_score,coach_confidence,coach_moment,notes';
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
            drillType: DRILL_TYPE,
            drillFieldRadiusMeters: DEFAULT_FIELD_RADIUS_METERS,
            cameraDistanceMeters: '',
            cameraMode: 'auto',
            audioMode: 'cue_only',
            masterVolume: 0.8,
            cueVolume: 0.9,
            feedbackVolume: 0.75,
            voiceLabelsEnabled: false,
            soundProfile: 'athlete',
            liveSonificationSensitivity: 1.0,
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
// AUDIO FEEDBACK ENGINE
// ============================================================================

class AudioFeedbackEngine {
    constructor(settings) {
        this.settings = settings;
        this.synth = window.speechSynthesis;
        this.isSupported = !!this.synth;
        this.audioContext = null;
        this.referenceSoundPrint = null;
    }

    playCue(cueText) {
        const audioMode = this.getAudioMode();
        const soundId = `direction_${String(cueText || '').toLowerCase()}_${AUDIO_FEEDBACK_VERSION}`;
        const cuePlayedAtMs = performance.now();
        const cuePlayedAt = new Date().toISOString();

        if (!this.isAudioEnabled() || audioMode === 'coach_review') {
            return this.buildCueMetadata(soundId, cuePlayedAt, cuePlayedAtMs, audioMode, null);
        }

        const pattern = this.getCuePattern(cueText);
        if (!pattern) return this.buildCueMetadata(soundId, cuePlayedAt, cuePlayedAtMs, audioMode, null);

        if (this.synth) {
            this.synth.cancel();
        }
        const audioLatencyEstimateMs = this.playTonePattern(pattern, this.getCueVolume());

        if (this.settings.get('voiceLabelsEnabled') && audioMode !== 'minimal') {
            setTimeout(() => this.playFeedback(String(cueText).toLowerCase(), { allowInCueOnly: true }), 90);
        }

        return this.buildCueMetadata(soundId, cuePlayedAt, cuePlayedAtMs, audioMode, audioLatencyEstimateMs);
    }

    buildCueMetadata(soundId, cuePlayedAt, cuePlayedAtMs, audioMode, audioLatencyEstimateMs) {
        return {
            soundId,
            cuePlayedAt,
            cuePlayedAtMs,
            audioLatencyEstimateMs,
            audioMode,
            audioFeedbackVersion: AUDIO_FEEDBACK_VERSION
        };
    }

    playFeedback(text, options = {}) {
        const audioMode = this.getAudioMode();
        if (!this.isAudioEnabled() || !this.isSupported) return;
        if (!options.allowInCueOnly && ['cue_only', 'minimal'].includes(audioMode)) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.settings.get('speechRate') || 1.0;
        utterance.pitch = 1.0;
        utterance.volume = this.getFeedbackVolume();

        this.synth.cancel();
        this.synth.speak(utterance);
    }

    playResultSound(resultType = 'neutral') {
        if (!this.isAudioEnabled()) return;
        if (['cue_only', 'reference'].includes(this.getAudioMode())) return;

        const patterns = {
            best: [
                { frequency: 880, duration: 0.1, pan: 0 },
                { frequency: 1320, duration: 0.16, pan: 0, delay: 0.11 }
            ],
            good: [{ frequency: 940, duration: 0.14, pan: 0 }],
            neutral: [{ frequency: 620, duration: 0.12, pan: 0 }],
            low_quality: [{ frequency: 260, duration: 0.18, pan: 0 }],
            error: [
                { frequency: 260, duration: 0.1, pan: 0 },
                { frequency: 180, duration: 0.16, pan: 0, delay: 0.12 }
            ]
        };

        this.playTonePattern(patterns[resultType] || patterns.neutral, this.getFeedbackVolume());
    }

    playQualityWarning(reason = 'low_confidence') {
        if (!this.isAudioEnabled()) return;
        if (!['live_sonification', 'coach_review', 'compare'].includes(this.getAudioMode())) return;
        const frequency = reason === 'low_confidence' ? 210 : 300;
        this.playTonePattern([{ frequency, duration: 0.08, pan: 0 }], Math.min(0.25, this.getFeedbackVolume()));
    }

    playSoundPrint(soundPrint) {
        if (!this.isAudioEnabled() || !soundPrint) return;
        if (!['coach_review', 'reference', 'compare'].includes(this.getAudioMode())) return;

        const curve = soundPrint.accelerationPitchCurve || [];
        const confidence = soundPrint.poseConfidenceOverTime || [];
        const pattern = curve.slice(0, 8).map((point, index) => ({
            frequency: Math.max(220, Math.min(1320, point.pitch || 440)),
            duration: 0.07,
            pan: 0,
            delay: index * 0.08,
            gainScale: Math.max(0.15, Math.min(1, confidence[index]?.confidence ?? 0.7))
        }));

        this.playTonePattern(pattern.length ? pattern : [{ frequency: 440, duration: 0.12, pan: 0 }], this.getFeedbackVolume());
    }

    saveReferenceSound(soundPrint) {
        if (!soundPrint) return;
        this.referenceSoundPrint = soundPrint;
        localStorage.setItem('cuecut_reference_sound_print', JSON.stringify(soundPrint));
    }

    loadReferenceSound() {
        if (this.referenceSoundPrint) return this.referenceSoundPrint;
        try {
            this.referenceSoundPrint = JSON.parse(localStorage.getItem('cuecut_reference_sound_print') || 'null');
        } catch (error) {
            this.referenceSoundPrint = null;
        }
        return this.referenceSoundPrint;
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
            FRONT: [{ frequency: 1320, duration: 0.18, pan: 0 }],
            BACK: [
                { frequency: 520, duration: 0.12, pan: 0 },
                { frequency: 420, duration: 0.14, pan: 0, delay: 0.17 }
            ],
            LEFT: [{ frequency: 720, duration: 0.16, pan: -1 }],
            RIGHT: [{ frequency: 720, duration: 0.16, pan: 1 }]
        };

        return patterns[cueText] || null;
    }

    playTonePattern(pattern, volume = 0.8) {
        const context = this.getAudioContext();
        if (!context) return null;

        pattern.forEach(tone => {
            const startTime = context.currentTime + (tone.delay || 0);
            this.playTone(context, tone.frequency, tone.duration, tone.pan, startTime, volume * (tone.gainScale || 1));
        });

        return context.baseLatency ? Math.round(context.baseLatency * 1000) : null;
    }

    playTone(context, frequency, duration, pan, startTime, volume = 0.8) {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        const panner = typeof context.createStereoPanner === 'function'
            ? context.createStereoPanner()
            : null;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);

        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, Math.min(0.45, 0.35 * volume)), startTime + 0.01);
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

    isAudioEnabled() {
        return this.settings.get('audioEnabled') && this.getAudioMode() !== 'off';
    }

    getAudioMode() {
        return this.settings.get('audioMode') || (this.settings.get('audioEnabled') ? 'cue_only' : 'off');
    }

    getMasterVolume() {
        return Number.isFinite(this.settings.get('masterVolume')) ? this.settings.get('masterVolume') : 0.8;
    }

    getCueVolume() {
        const cueVolume = Number.isFinite(this.settings.get('cueVolume')) ? this.settings.get('cueVolume') : 0.9;
        return cueVolume * this.getMasterVolume();
    }

    getFeedbackVolume() {
        const feedbackVolume = Number.isFinite(this.settings.get('feedbackVolume')) ? this.settings.get('feedbackVolume') : 0.75;
        return feedbackVolume * this.getMasterVolume();
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
    static getDirectionFromCue(cue) {
        return String(cue || '').toLowerCase();
    }

    static getCueDisplayName(cue) {
        return {
            FRONT: 'FORWARD',
            BACK: 'BACKWARD',
            LEFT: 'LEFT',
            RIGHT: 'RIGHT'
        }[cue] || cue;
    }

    static getCameraModeForCue(cue, preferredMode = 'auto') {
        if (preferredMode === 'front_view' || preferredMode === 'side_view') return preferredMode;
        return cue === 'LEFT' || cue === 'RIGHT' ? 'front_view' : 'side_view';
    }

    constructor() {
        this.settings = new Settings();
        this.storage = new DataStorage();
        this.cloud = new CloudStorage();
        this.audio = new AudioFeedbackEngine(this.settings);
        this.motionDetector = new MotionDetector();

        this.currentRepData = null;
        this.currentSessionId = null;
        this.currentSessionCode = null;
        this.currentSummarySessionId = null;
        this.currentDataSessionId = null;
        this.currentFeedbackScoreNote = null;
        this.currentCoachFeedback = null;
        this.lastCoachFeedbackKey = null;
        this.processedCoachFeedbackKeys = new Set();
        this.coachFeedbackFallbackTimer = null;
        this.latestTrackerState = null;
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
        document.getElementById('saveReferenceSoundBtn').addEventListener('click', () => this.saveCurrentRepReferenceSound());
        document.getElementById('playRepSoundBtn').addEventListener('click', () => this.playCurrentRepSound());
        document.getElementById('nextRepBtn').addEventListener('click', () => this.goToReady());
        document.getElementById('endSessionBtn').addEventListener('click', () => this.endSession());

        // Summary Screen
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportCurrentSessionData());
        document.getElementById('summaryHomeBtn').addEventListener('click', () => this.goToHome());
        document.getElementById('saveSoundFeedbackBtn').addEventListener('click', () => this.saveSessionSoundFeedback());

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

        document.getElementById('audioModeSelect').value = this.settings.get('audioMode');
        document.getElementById('audioModeSelect').addEventListener('change', (e) => {
            this.settings.set('audioMode', e.target.value);
            this.updateAudioModeInfo(e.target.value);
        });
        this.updateAudioModeInfo(this.settings.get('audioMode'));

        ['masterVolume', 'cueVolume', 'feedbackVolume'].forEach(id => {
            const element = document.getElementById(id);
            element.value = this.settings.get(id);
            element.addEventListener('change', (e) => {
                this.settings.set(id, Math.max(0, Math.min(1, parseFloat(e.target.value))));
            });
        });

        document.getElementById('voiceLabelsToggle').value = this.settings.get('voiceLabelsEnabled') ? 'on' : 'off';
        document.getElementById('voiceLabelsToggle').addEventListener('change', (e) => {
            this.settings.set('voiceLabelsEnabled', e.target.value === 'on');
        });

        document.getElementById('soundProfileSelect').value = this.settings.get('soundProfile');
        document.getElementById('soundProfileSelect').addEventListener('change', (e) => {
            this.settings.set('soundProfile', e.target.value);
        });

        document.getElementById('sonificationSensitivity').value = this.settings.get('liveSonificationSensitivity');
        document.getElementById('sonificationSensitivity').addEventListener('change', (e) => {
            this.settings.set('liveSonificationSensitivity', parseFloat(e.target.value));
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

    updateAudioModeInfo(mode) {
        const infoEl = document.getElementById('audioModeInfo');
        if (!infoEl) return;

        const descriptions = {
            off: 'Off: no cue sounds, result tones, voice, or sound-print playback.',
            cue_only: 'Cue Only: short direction sounds for fast reaction timing. Best default for testing.',
            live_sonification: 'Live Sonification: uses pose samples to shape sound. Advanced mode, use only when tracking is confident.',
            coach_review: 'Coach Review: no live cue clutter; use saved sound prints after reps for review.',
            reference: 'Reference Sound: rehearse or replay a saved good rep sound before trying again.',
            compare: 'Compare Mode: listen for timing differences between current, best, or reference reps.',
            minimal: 'Minimal: keeps sounds short and quiet so the athlete is not distracted.'
        };

        infoEl.textContent = descriptions[mode] || descriptions.cue_only;
    }

    loadSettings() {
        const enabledCues = this.settings.get('enabledCues') || [];
        const migratedCues = enabledCues.map(cue => cue === 'GO' ? 'FRONT' : cue === 'DROP' ? 'BACK' : cue);
        const activeCues = [...new Set(migratedCues.filter(cue => CUE_BANK.includes(cue)))];

        if (activeCues.length === 0) {
            this.settings.set('enabledCues', [...CUE_BANK]);
        } else if (activeCues.length !== enabledCues.length || activeCues.some((cue, index) => cue !== enabledCues[index])) {
            this.settings.set('enabledCues', activeCues);
        }

        if (!Number.isFinite(this.settings.get('drillFieldRadiusMeters'))) {
            this.settings.set('drillFieldRadiusMeters', DEFAULT_FIELD_RADIUS_METERS);
        }
        if (!['auto', 'front_view', 'side_view'].includes(this.settings.get('cameraMode'))) {
            this.settings.set('cameraMode', 'auto');
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
        this.processedCoachFeedbackKeys.clear();
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
            enabledCues: this.settings.get('enabledCues'),
            drillType: DRILL_TYPE,
            drillFieldRadiusMeters: this.settings.get('drillFieldRadiusMeters'),
            cameraDistanceMeters: this.settings.get('cameraDistanceMeters'),
            cameraMode: this.settings.get('cameraMode'),
            audioMode: this.settings.get('audioMode'),
            masterVolume: this.settings.get('masterVolume'),
            cueVolume: this.settings.get('cueVolume'),
            feedbackVolume: this.settings.get('feedbackVolume'),
            voiceLabelsEnabled: this.settings.get('voiceLabelsEnabled'),
            soundProfile: this.settings.get('soundProfile'),
            liveSonificationSensitivity: this.settings.get('liveSonificationSensitivity'),
            audioFeedbackVersion: AUDIO_FEEDBACK_VERSION
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
        if (latestFeedback?.repId) {
            const feedbackKey = this.getCoachFeedbackKey(latestFeedback);
            const alreadyProcessed = this.processedCoachFeedbackKeys.has(feedbackKey);
            const updatedRep = alreadyProcessed ? null : this.attachCoachFeedbackToRep(latestFeedback);
            if (!alreadyProcessed) {
                this.processedCoachFeedbackKeys.add(feedbackKey);
            }

            if (latestFeedback.repId === this.currentRepData?.id) {
                this.currentCoachFeedback = latestFeedback;
            }
            if (latestFeedback.repId === this.currentRepData?.id) {
                this.updateCoachFeedbackDisplay();
                if (updatedRep) {
                    this.speakCoachFeedback(latestFeedback);
                }
            }
        }

        if (sessionData.latestTrackerState) {
            this.latestTrackerState = sessionData.latestTrackerState;
            this.updateTrackerSyncStatus(sessionData.latestTrackerState);
            this.updatePendingCoachFeedbackStatus(sessionData.latestTrackerState);
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
        if (Number.isFinite(sessionSettings.drillFieldRadiusMeters)) cleaned.drillFieldRadiusMeters = sessionSettings.drillFieldRadiusMeters;
        if (sessionSettings.cameraDistanceMeters !== undefined) cleaned.cameraDistanceMeters = sessionSettings.cameraDistanceMeters;
        if (['auto', 'front_view', 'side_view'].includes(sessionSettings.cameraMode)) cleaned.cameraMode = sessionSettings.cameraMode;
        if (['off', 'cue_only', 'live_sonification', 'coach_review', 'reference', 'compare', 'minimal'].includes(sessionSettings.audioMode)) cleaned.audioMode = sessionSettings.audioMode;
        if (Number.isFinite(sessionSettings.masterVolume)) cleaned.masterVolume = sessionSettings.masterVolume;
        if (Number.isFinite(sessionSettings.cueVolume)) cleaned.cueVolume = sessionSettings.cueVolume;
        if (Number.isFinite(sessionSettings.feedbackVolume)) cleaned.feedbackVolume = sessionSettings.feedbackVolume;
        if (typeof sessionSettings.voiceLabelsEnabled === 'boolean') cleaned.voiceLabelsEnabled = sessionSettings.voiceLabelsEnabled;
        if (['athlete', 'coach', 'minimal'].includes(sessionSettings.soundProfile)) cleaned.soundProfile = sessionSettings.soundProfile;
        if (Number.isFinite(sessionSettings.liveSonificationSensitivity)) cleaned.liveSonificationSensitivity = sessionSettings.liveSonificationSensitivity;
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
        this.currentCoachFeedback = null;
        this.lastCoachFeedbackKey = null;
        clearTimeout(this.coachFeedbackFallbackTimer);
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
        this.currentRepData.drillType = DRILL_TYPE;
        this.currentRepData.direction = CueCutApp.getDirectionFromCue(cue);
        this.currentRepData.cameraMode = CueCutApp.getCameraModeForCue(cue, this.settings.get('cameraMode'));
        this.currentRepData.drillFieldRadiusMeters = this.settings.get('drillFieldRadiusMeters') || DEFAULT_FIELD_RADIUS_METERS;
        this.currentRepData.cameraDistanceMeters = this.settings.get('cameraDistanceMeters') || '';

        // Show waiting screen
        this.goToScreen('waitingScreen');

        // Random delay
        const delayMin = this.settings.get('delayMin');
        const delayMax = this.settings.get('delayMax');
        const delay = (Math.random() * (delayMax - delayMin) + delayMin) * 1000;

        setTimeout(() => this.showCue(), delay);
    }

    showCue() {
        this.currentCoachFeedback = null;
        this.lastCoachFeedbackKey = null;
        const cueAudio = this.audio.playCue(this.currentRepData.cue);
        this.currentRepData.cueStartMs = cueAudio?.cuePlayedAtMs || performance.now();
        this.currentRepData.cuePlayedAtMs = this.currentRepData.cueStartMs;
        this.currentRepData.cuePlayedAt = cueAudio?.cuePlayedAt || new Date().toISOString();
        this.currentRepData.soundId = cueAudio?.soundId || '';
        this.currentRepData.audioLatencyEstimateMs = cueAudio?.audioLatencyEstimateMs ?? '';
        this.currentRepData.audioMode = cueAudio?.audioMode || this.settings.get('audioMode');
        this.currentRepData.audioFeedbackVersion = cueAudio?.audioFeedbackVersion || AUDIO_FEEDBACK_VERSION;
        this.cloud.updateActiveRep(this.currentSessionId, {
            repId: this.currentRepData.id,
            cue: this.currentRepData.cue,
            drillType: this.currentRepData.drillType,
            direction: this.currentRepData.direction,
            cameraMode: this.currentRepData.cameraMode,
            drillFieldRadiusMeters: this.currentRepData.drillFieldRadiusMeters,
            cameraDistanceMeters: this.currentRepData.cameraDistanceMeters,
            cuePlayedAt: this.currentRepData.cuePlayedAt,
            soundId: this.currentRepData.soundId,
            audioMode: this.currentRepData.audioMode,
            audioFeedbackVersion: this.currentRepData.audioFeedbackVersion,
            sessionCode: this.currentSessionCode,
            status: 'active',
            cueStartedAt: new Date().toISOString()
        });
        
        // Update UI
        document.getElementById('cueDisplay').textContent = CueCutApp.getCueDisplayName(this.currentRepData.cue);
        document.getElementById('cueSubtext').textContent = 'MOVE!';
        
        // Start motion detection if enabled
        if (this.settings.get('timingMode') === 'motion' && this.motionDetector.isAvailable === 'available') {
            this.motionDetector.onMotionDetected = (detectedTime) => {
                this.currentRepData.motionStartMs = detectedTime - this.currentRepData.cueStartMs;
                this.currentRepData.firstMovementMs = detectedTime;
                this.currentRepData.movementStartedAt = new Date().toISOString();
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
        document.getElementById('currentCueDisplay').innerHTML = `Cue: <strong>${CueCutApp.getCueDisplayName(this.currentRepData.cue)}</strong>`;
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
        this.currentRepData.movementStartedAt = new Date().toISOString();
        this.currentRepData.calculateTimings();
        this.currentRepData.reactionTimeMs = this.currentRepData.reactionMs;

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
        this.audio.playResultSound(this.getResultSoundType(this.currentRepData));

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
        document.getElementById('feedbackCue').textContent = CueCutApp.getCueDisplayName(rep.cue);
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
        const coachEl = document.getElementById('feedbackCoachNote');
        if (coachEl) {
            coachEl.textContent = 'Waiting for phone coach cue...';
        }

        this.coachFeedbackFallbackTimer = setTimeout(() => {
            if (this.currentRepData?.id !== repId || this.currentCoachFeedback?.feedback) {
                return;
            }

            const coachEl = document.getElementById('feedbackCoachNote');
            if (coachEl) {
                const trackerState = this.latestTrackerState || {};
                const trackerWorking = trackerState.repId === repId && ['recording', 'finalizing'].includes(trackerState.status);
                coachEl.textContent = trackerWorking
                    ? 'Phone is still finalizing coach cue...'
                    : 'No phone feedback captured';
            }
        }, 8000);
    }

    updatePendingCoachFeedbackStatus(trackerState) {
        if (this.currentScreen !== 'feedbackScreen' || this.currentCoachFeedback?.feedback || !this.currentRepData) {
            return;
        }

        if (trackerState.repId !== this.currentRepData.id) {
            return;
        }

        const coachEl = document.getElementById('feedbackCoachNote');
        if (!coachEl) return;

        if (trackerState.status === 'finalizing') {
            coachEl.textContent = 'Phone is finalizing coach cue...';
        } else if (trackerState.status === 'recording') {
            coachEl.textContent = 'Phone data synced. Waiting for final cue...';
        }
    }

    attachCoachFeedbackToRep(latestFeedback) {
        if (!latestFeedback?.repId || !latestFeedback?.feedback) return null;

        const targetRep = this.currentRepData?.id === latestFeedback.repId
            ? this.currentRepData
            : this.storage.getAllReps().find(rep => rep.id === latestFeedback.repId);

        if (!targetRep) return null;

        targetRep.coachRunType = latestFeedback.runType || latestFeedback.cue || '';
        targetRep.coachGood = latestFeedback.feedback.good || '';
        targetRep.coachFix = latestFeedback.feedback.fix || latestFeedback.feedback.message || '';
        targetRep.coachCue = latestFeedback.feedback.cue || '';
        targetRep.coachDrill = latestFeedback.feedback.drill || '';
        targetRep.coachScore = Number.isFinite(latestFeedback.feedback.score) ? latestFeedback.feedback.score : '';
        targetRep.coachConfidence = latestFeedback.feedback.confidence || '';
        targetRep.coachStrengths = latestFeedback.feedback.strengths || [];
        targetRep.coachFixes = latestFeedback.feedback.fixes || [];
        targetRep.soundPrint = latestFeedback.soundPrint || targetRep.soundPrint || null;
        const topIssue = latestFeedback.feedback.issues?.[0];
        targetRep.coachMoment = topIssue?.moment || '';
        this.storage.saveRep(targetRep);
        this.cloud.saveRep(targetRep, {
            sessionCode: this.currentSessionCode,
            startedAt: this.getSessionStartedAt(targetRep.sessionId)
        });
        return targetRep;
    }

    getCoachFeedbackKey(latestFeedback) {
        const feedback = latestFeedback.feedback || {};
        return [
            latestFeedback.repId,
            feedback.score ?? '',
            feedback.cue || '',
            feedback.fix || feedback.message || ''
        ].join('|');
    }

    saveCurrentRepReferenceSound() {
        if (!this.currentRepData?.soundPrint) {
            this.audio.playResultSound('low_quality');
            return;
        }

        this.audio.saveReferenceSound(this.currentRepData.soundPrint);
        this.currentRepData.soundPrint.referenceSavedAt = new Date().toISOString();
        this.storage.saveRep(this.currentRepData);
        this.audio.playResultSound('good');
    }

    playCurrentRepSound() {
        const soundPrint = this.currentRepData?.soundPrint || this.audio.loadReferenceSound();
        if (!soundPrint) {
            this.audio.playResultSound('low_quality');
            return;
        }
        this.audio.playSoundPrint(soundPrint);
    }

    saveSessionSoundFeedback() {
        const sessionId = this.currentSummarySessionId || this.currentSessionId;
        const feedback = {
            helpful: document.getElementById('soundHelpfulSelect')?.value || '',
            distracting: document.getElementById('soundDistractingSelect')?.value || '',
            bestUse: document.getElementById('soundUseSelect')?.value || '',
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(`cuecut_sound_feedback_${sessionId}`, JSON.stringify(feedback));
        this.audio.playResultSound('good');
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
            return `First ${CueCutApp.getCueDisplayName(rep.cue)} score`;
        }

        const deltaMs = rep.reactionMs - previousBest.reactionMs;
        if (deltaMs < 0) {
            return `New ${CueCutApp.getCueDisplayName(rep.cue)} PR by ${(Math.abs(deltaMs) / 1000).toFixed(2)}s`;
        }

        if (deltaMs === 0) {
            return `Tied ${CueCutApp.getCueDisplayName(rep.cue)} PR`;
        }

        return `+${(deltaMs / 1000).toFixed(2)}s from ${CueCutApp.getCueDisplayName(rep.cue)} best`;
    }

    getResultSoundType(rep) {
        if (!Number.isFinite(rep.reactionMs)) return 'low_quality';
        const previousBest = this.getBestReactionForCue(rep.cue);
        if (!Number.isFinite(previousBest) || rep.reactionMs <= previousBest) return 'best';
        if (rep.coachConfidence === 'low' || Number(rep.coachScore) === 0) return 'low_quality';
        const deltaMs = rep.reactionMs - previousBest;
        if (deltaMs < 250) return 'good';
        return 'neutral';
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
        const setupRep = [...reps].reverse().find(rep => rep.drillFieldRadiusMeters || rep.cameraDistanceMeters);
        const drillFieldRadiusMeters = setupRep?.drillFieldRadiusMeters || this.settings.get('drillFieldRadiusMeters') || DEFAULT_FIELD_RADIUS_METERS;
        const cameraDistanceMeters = setupRep?.cameraDistanceMeters || this.settings.get('cameraDistanceMeters') || '';

        return { totalReps, trackedReps, avgReactionMs, bestReactionMs, avgMovementMs, fatigue, coachSummary, drillFieldRadiusMeters, cameraDistanceMeters };
    }

    showSummary(stats, sessionReps) {
        document.getElementById('summaryReps').textContent = stats.totalReps;
        document.getElementById('summaryTracked').textContent = `${stats.trackedReps}/${stats.totalReps}`;
        document.getElementById('summaryAvgReaction').textContent = stats.avgReactionMs > 0 ? `${(stats.avgReactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryBestReaction').textContent = stats.bestReactionMs > 0 ? `${(stats.bestReactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryFatigue').textContent = stats.fatigue;
        const fieldRadiusEl = document.getElementById('summaryFieldRadius');
        if (fieldRadiusEl) fieldRadiusEl.textContent = `${stats.drillFieldRadiusMeters || DEFAULT_FIELD_RADIUS_METERS}m`;
        const cameraDistanceEl = document.getElementById('summaryCameraDistance');
        if (cameraDistanceEl) cameraDistanceEl.textContent = stats.cameraDistanceMeters ? `${stats.cameraDistanceMeters}m` : 'not entered';
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
        const bestText = bestRep ? ` Best tracked rep: ${CueCutApp.getCueDisplayName(bestRep.cue)} ${bestRep.coachScore}/100.` : '';

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
                <div><strong>${index + 1}. ${CueCutApp.getCueDisplayName(rep.cue)}</strong> | ${reaction}${coachNote}</div>
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
                <td>${CueCutApp.getCueDisplayName(group.cue)}</td>
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
