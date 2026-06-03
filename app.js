/**
 * CueCut - Soccer Reaction HUD
 * Main application logic
 */

// ============================================================================
// DATA MODEL
// ============================================================================

const CUE_BANK = ['LEFT', 'RIGHT', 'PRESS', 'DROP', 'TURN', 'MAN ON', 'GO'];

class RepData {
    constructor(cue) {
        this.id = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = new Date().toISOString();
        this.cue = cue;
        this.cueStartMs = null;
        this.firstMovementMs = null;
        this.finishMs = null;
        this.reactionMs = null;
        this.movementMs = null;
        this.totalMs = null;
        this.correct = null;
        this.timingMode = 'manual';
        this.motionStartMs = null;
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
            this.correct !== null ? (this.correct ? 'true' : 'false') : '',
            this.timingMode,
            this.motionStartMs || '',
            this.notes
        ].join(',');
    }

    static toCSVHeader() {
        return 'rep_id,timestamp,cue,cue_start_ms,first_movement_ms,finish_ms,reaction_ms,movement_ms,total_ms,correct,timing_mode,motion_start_ms,notes';
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
    }

    playCue(cueText) {
        if (!this.settings.get('audioEnabled') || !this.isSupported) return;

        const utterance = new SpeechSynthesisUtterance(cueText);
        utterance.rate = this.settings.get('speechRate');
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        this.synth.cancel();
        this.synth.speak(utterance);
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
        this.synth.cancel();
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
                totalAccuracy: 0
            };
        }

        const completedReps = reps.filter(r => r.reactionMs !== null && r.totalMs !== null);
        const correctReps = reps.filter(r => r.correct === true);

        const reactionTimes = completedReps.map(r => r.reactionMs).filter(t => t !== null);
        const movementTimes = completedReps.map(r => r.movementMs).filter(t => t !== null);

        return {
            totalReps: reps.length,
            avgReactionMs: reactionTimes.length > 0 ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length : 0,
            bestReactionMs: reactionTimes.length > 0 ? Math.min(...reactionTimes) : 0,
            avgMovementMs: movementTimes.length > 0 ? movementTimes.reduce((a, b) => a + b, 0) / movementTimes.length : 0,
            totalAccuracy: reps.length > 0 ? (correctReps.length / reps.length) * 100 : 0
        };
    }

    exportCSV() {
        const reps = this.getAllReps();
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

// ============================================================================
// APP CONTROLLER
// ============================================================================

class CueCutApp {
    constructor() {
        this.settings = new Settings();
        this.storage = new DataStorage();
        this.audio = new AudioFeedback(this.settings);
        this.motionDetector = new MotionDetector();

        this.currentRepData = null;
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
        document.getElementById('settingsBtn').addEventListener('click', () => this.goToScreen('settingsScreen'));

        // Ready Screen
        document.getElementById('startRepBtn').addEventListener('click', () => this.startRep());
        document.getElementById('readyBackBtn').addEventListener('click', () => this.goToHome());

        // Movement Screen
        document.getElementById('reactionFinishedBtn').addEventListener('click', () => this.finishReaction());

        // Feedback Screen
        document.getElementById('feedbackCorrectBtn').addEventListener('click', () => this.markCorrect(true));
        document.getElementById('feedbackIncorrectBtn').addEventListener('click', () => this.markCorrect(false));
        document.getElementById('nextRepBtn').addEventListener('click', () => this.goToReady());
        document.getElementById('endSessionBtn').addEventListener('click', () => this.endSession());

        // Summary Screen
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportData());
        document.getElementById('summaryHomeBtn').addEventListener('click', () => this.goToHome());

        // Data View Screen
        document.getElementById('dataViewExportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('dataViewHomeBtn').addEventListener('click', () => this.goToHome());

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
        // Ensure at least one cue is enabled
        const enabledCues = this.settings.get('enabledCues');
        if (!enabledCues || enabledCues.length === 0) {
            this.settings.set('enabledCues', [...CUE_BANK]);
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
        this.goToReady();
    }

    goToHome() {
        this.goToScreen('homeScreen');
    }

    goToReady() {
        this.currentRepData = null;
        this.goToScreen('readyScreen');
    }

    startRep() {
        // Select random cue
        const enabledCues = this.settings.get('enabledCues');
        const cue = enabledCues[Math.floor(Math.random() * enabledCues.length)];

        this.currentRepData = new RepData(cue);
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
        this.goToScreen('movementScreen');
    }

    finishReaction() {
        // Record reaction time as now - when cue started
        this.currentRepData.firstMovementMs = performance.now();
        this.currentRepData.calculateTimings();
        
        // Jump straight to feedback
        this.showFeedback();
    }

    markCorrect(isCorrect) {
        this.currentRepData.correct = isCorrect;

        // Save rep
        this.storage.addRep(this.currentRepData);

        // Play feedback
        if (isCorrect) {
            const reactionSec = (this.currentRepData.reactionMs / 1000).toFixed(2);
            this.audio.playFeedback(`Good rep. Reaction ${reactionSec} seconds.`);
        } else {
            this.audio.playFeedback('Incorrect action. Reset.');
        }

        // Show feedback screen
        this.showFeedback();
    }

    showFeedback() {
        const rep = this.currentRepData;
        document.getElementById('feedbackCue').textContent = rep.cue;
        document.getElementById('feedbackReaction').textContent = rep.reactionMs !== null ? `${(rep.reactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('feedbackCorrect').textContent = rep.correct !== null ? (rep.correct ? 'Yes' : 'No') : '—';

        this.goToScreen('feedbackScreen');
    }

    endSession() {
        const stats = this.storage.getStats();
        this.showSummary(stats);
    }

    showSummary(stats) {
        document.getElementById('summaryReps').textContent = stats.totalReps;
        document.getElementById('summaryAvgReaction').textContent = stats.avgReactionMs > 0 ? `${(stats.avgReactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryBestReaction').textContent = stats.bestReactionMs > 0 ? `${(stats.bestReactionMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryAvgMove').textContent = stats.avgMovementMs > 0 ? `${(stats.avgMovementMs / 1000).toFixed(2)}s` : '—';
        document.getElementById('summaryAccuracy').textContent = stats.totalReps > 0 ? `${stats.totalAccuracy.toFixed(1)}%` : '—';

        this.drawChart(stats);
        this.goToScreen('summaryScreen');
    }

    drawChart(stats) {
        const reps = this.storage.getAllReps();
        const chartContainer = document.getElementById('summaryChart');
        chartContainer.innerHTML = '';

        if (reps.length === 0) {
            chartContainer.innerHTML = '<p style="text-align: center; color: #666;">No data to display</p>';
            return;
        }

        // Get reaction times
        const reactionTimes = reps
            .filter(r => r.reactionMs !== null)
            .map(r => r.reactionMs / 1000)
            .slice(-20); // Last 20 reps

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
        const reps = this.storage.getAllReps();
        const container = document.getElementById('dataViewContent');

        if (reps.length === 0) {
            container.innerHTML = '<p>No data stored yet.</p>';
        } else {
            let html = '';
            reps.slice(-10).reverse().forEach(rep => {
                html += `<div class="data-item">
                    ${rep.cue} | Reaction: ${rep.reactionMs ? (rep.reactionMs / 1000).toFixed(2) + 's' : '—'} | Correct: ${rep.correct !== null ? (rep.correct ? 'Yes' : 'No') : '—'}
                </div>`;
            });
            container.innerHTML = html;
        }

        this.goToScreen('dataViewScreen');
    }

    exportData() {
        const csv = this.storage.exportCSV();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cuecut_data_${new Date().toISOString().slice(0, 10)}.csv`;
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
});
