import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
const firebaseConfig = {
    apiKey: "AIzaSyA6EnXXEkawDg7y8yLW52UYp0uheD1JLQQ",
    authDomain: "cuecut-e7491.firebaseapp.com",
    projectId: "cuecut-e7491",
    storageBucket: "cuecut-e7491.firebasestorage.app",
    messagingSenderId: "544158962434",
    appId: "1:544158962434:web:6fe8cb81013baf16d9e81b",
    measurementId: "G-8FJBK3HXPH"
};

const POSE_CONNECTIONS = [
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [24, 26],
    [25, 27],
    [26, 28],
    [11, 13],
    [12, 14],
    [13, 15],
    [14, 16]
];

const POSE_LOADER_OPTIONS = [
    {
        scriptUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs",
        wasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
        modelUrl: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    },
    {
        scriptUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs",
        wasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
        modelUrl: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    },
    {
        scriptUrl: "https://unpkg.com/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs",
        wasmUrl: "https://unpkg.com/@mediapipe/tasks-vision@0.10.3/wasm",
        modelUrl: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    }
];

const RUN_GUIDANCE = {
    AUTO: {
        placement: 'Auto follows the active glasses cue.',
        reads: 'Pick a manual view only when you move the phone to that angle.'
    },
    LEFT: {
        placement: 'Front view: face the athlete as they cut left.',
        reads: 'Reads right plant knee stack, plant bend, base width, and chest-over-hips.'
    },
    RIGHT: {
        placement: 'Front view: face the athlete as they cut right.',
        reads: 'Reads left plant knee stack, plant bend, base width, and chest-over-hips.'
    },
    DROP: {
        placement: 'Side view: place phone beside the athlete.',
        reads: 'Reads hip drop, knee bend, and trunk lean.'
    },
    TURN: {
        placement: 'Side or 45-degree view: capture the turn setup.',
        reads: 'Reads turn load, trunk angle, knee bend, and base.'
    },
    GO: {
        placement: 'Side view: place phone beside the acceleration lane.',
        reads: 'Reads launch lean, knee bend, and base width.'
    }
};

const MIN_TRACKING_POSE_SCORE = 0.25;
const LANDMARK_VISIBLE_THRESHOLD = 0.2;

class SideTracker {
    constructor() {
        this.db = getFirestore(initializeApp(firebaseConfig));
        this.sessionId = null;
        this.sessionCode = null;
        this.stream = null;
        this.poseLandmarker = null;
        this.PoseLandmarker = null;
        this.sessionUnsubscribe = null;
        this.activeRep = null;
        this.activeRepSamples = [];
        this.samplesByRepId = new Map();
        this.lastSaveMsByRepId = new Map();
        this.lastTrackerStateKey = null;
        this.selectedRunType = 'AUTO';
        this.isTracking = false;
        this.isPoseReady = false;
        this.poseErrorShown = false;
        this.lastVideoTime = -1;
        this.lastSaveMs = 0;

        this.elements = {
            sessionCodeInput: document.getElementById('sessionCodeInput'),
            connectSessionBtn: document.getElementById('connectSessionBtn'),
            testSyncBtn: document.getElementById('testSyncBtn'),
            trackerStatus: document.getElementById('trackerStatus'),
            trackerVideo: document.getElementById('trackerVideo'),
            trackerCanvas: document.getElementById('trackerCanvas'),
            trackerPlaceholder: document.getElementById('trackerPlaceholder'),
            startTrackingBtn: document.getElementById('startTrackingBtn'),
            stopTrackingBtn: document.getElementById('stopTrackingBtn'),
            bodyFeedback: document.getElementById('bodyFeedback'),
            captureBadge: document.getElementById('captureBadge'),
            leanMetric: document.getElementById('leanMetric'),
            kneeMetric: document.getElementById('kneeMetric'),
            baseMetric: document.getElementById('baseMetric'),
            leanMetricLabel: document.getElementById('leanMetricLabel'),
            kneeMetricLabel: document.getElementById('kneeMetricLabel'),
            baseMetricLabel: document.getElementById('baseMetricLabel'),
            cameraPlacement: document.getElementById('cameraPlacement'),
            cameraReads: document.getElementById('cameraReads'),
            angleWarning: document.getElementById('angleWarning'),
            activeRepStatus: document.getElementById('activeRepStatus'),
            connectStep: document.getElementById('connectStep'),
            cameraStep: document.getElementById('cameraStep'),
            cueStep: document.getElementById('cueStep'),
            settingsSaveStatus: document.getElementById('settingsSaveStatus'),
            trackerGoalSelect: document.getElementById('trackerGoalSelect'),
            trackerDelayMin: document.getElementById('trackerDelayMin'),
            trackerDelayMax: document.getElementById('trackerDelayMax'),
            trackerAudioSelect: document.getElementById('trackerAudioSelect'),
            trackerCueToggles: document.querySelectorAll('.trackerCueToggle'),
            runTabs: document.querySelectorAll('.run-tab')
        };

        this.canvasContext = this.elements.trackerCanvas.getContext('2d');
        this.bindEvents();
        this.updateCameraGuide();
        this.setStatus('Start camera or enter the 4-digit code from the glasses.');
    }

    bindEvents() {
        this.elements.connectSessionBtn.addEventListener('click', () => this.connectSession());
        this.elements.testSyncBtn.addEventListener('click', () => this.testSync());
        this.elements.startTrackingBtn.addEventListener('click', () => this.startTracking());
        this.elements.stopTrackingBtn.addEventListener('click', () => this.stopTracking());
        this.elements.sessionCodeInput.addEventListener('input', () => {
            this.elements.sessionCodeInput.value = this.elements.sessionCodeInput.value.replace(/\D/g, '').slice(0, 4);
        });
        this.elements.sessionCodeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.connectSession();
        });
        this.elements.runTabs.forEach(button => {
            button.addEventListener('click', () => this.selectRunType(button.dataset.runType));
        });
        [
            this.elements.trackerGoalSelect,
            this.elements.trackerDelayMin,
            this.elements.trackerDelayMax,
            this.elements.trackerAudioSelect,
            ...this.elements.trackerCueToggles
        ].forEach(element => {
            element.addEventListener('change', () => this.saveSessionSettings());
        });
    }

    setStatus(message) {
        this.elements.trackerStatus.textContent = message;
    }

    async connectSession() {
        const code = this.elements.sessionCodeInput.value.trim();
        if (code.length !== 4) {
            this.setStatus('Enter the 4-digit session code from the glasses.');
            return;
        }

        this.setStatus('Looking for session...');
        this.elements.connectSessionBtn.disabled = true;

        try {
            const sessionId = await this.findSessionIdByCode(code);

            if (!sessionId) {
                this.setStatus('No matching session yet. Start Session on the glasses, then try again.');
                return;
            }

            this.sessionId = sessionId;
            this.sessionCode = code;
            this.elements.testSyncBtn.disabled = false;
            this.subscribeToSession();
            this.updateStepStatus({ connected: true });
            this.setTrackerState(this.isTracking ? 'camera on' : 'connected');
            this.setStatus(`Connected to session ${code}. ${this.isTracking ? 'Camera is ready.' : 'Start camera when ready.'}`);
        } catch (error) {
            console.error(error);
            this.setStatus(`Connect failed: ${error.code || error.message || 'check Firebase rules'}.`);
        } finally {
            this.elements.connectSessionBtn.disabled = false;
        }
    }

    async findSessionIdByCode(code) {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            this.setStatus(`Looking for session ${code}...`);
            const sessionCodeDoc = await getDoc(doc(this.db, 'sessionCodes', code));

            if (sessionCodeDoc.exists()) {
                return sessionCodeDoc.data().sessionId;
            }

            const sessionsQuery = query(
                collection(this.db, 'sessions'),
                where('sessionCode', '==', code),
                limit(1)
            );
            const snapshot = await getDocs(sessionsQuery);

            if (!snapshot.empty) {
                return snapshot.docs[0].id;
            }

            if (attempt < 5) {
                await this.wait(700);
            }
        }

        return null;
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    testSync() {
        if (!this.sessionId) {
            this.setStatus('Connect to a session before testing sync.');
            return;
        }

        this.setTrackerState('test received', { testAt: Date.now() });
        this.setStatus('Test sent. Check glasses for tracker status.');
    }

    subscribeToSession() {
        if (this.sessionUnsubscribe) {
            this.sessionUnsubscribe();
        }

        this.sessionUnsubscribe = onSnapshot(doc(this.db, 'sessions', this.sessionId), snapshot => {
            if (!snapshot.exists()) return;
            const sessionData = snapshot.data();
            this.handleSessionUpdate(sessionData);
        }, error => {
            console.warn('Tracker session listener failed:', error);
            this.setStatus(`Live session sync failed: ${error.code || 'check rules'}.`);
        });
    }

    handleSessionUpdate(sessionData) {
        const nextActiveRep = sessionData.activeRep?.status === 'active' ? sessionData.activeRep : null;
        if (this.activeRep && (!nextActiveRep || nextActiveRep.repId !== this.activeRep.repId)) {
            const repToFinalize = this.activeRep;
            this.setTrackerState('finalizing', { cue: repToFinalize.cue, repId: repToFinalize.repId });
            this.finalizeRepFeedback(repToFinalize).finally(() => {
                if (this.activeRep) {
                    this.setTrackerState('recording', { cue: this.activeRep.cue, repId: this.activeRep.repId });
                } else {
                    this.setTrackerState(this.isTracking ? 'camera on' : 'connected');
                }
            });
        }

        if (nextActiveRep && nextActiveRep.repId !== this.activeRep?.repId) {
            const samples = [];
            this.samplesByRepId.set(nextActiveRep.repId, samples);
            this.activeRepSamples = samples;
            this.lastSaveMsByRepId.set(nextActiveRep.repId, 0);
            this.lastSaveMs = 0;
            this.updateCaptureBadge(0);
        }

        this.activeRep = nextActiveRep;
        this.updateActiveRepStatus();
        this.updateCameraGuide();
        this.updateStepStatus({ cueActive: Boolean(this.activeRep) });

        if (sessionData.sessionSettings) {
            this.loadSessionSettings(sessionData.sessionSettings);
        }
    }

    updateActiveRepStatus() {
        if (!this.activeRep) {
            this.elements.activeRepStatus.textContent = 'Armed, not recording';
            return;
        }

        if (this.isTracking) {
            this.elements.activeRepStatus.textContent = `Recording ${this.activeRep.cue} rep`;
            this.setTrackerState('recording', { cue: this.activeRep.cue, repId: this.activeRep.repId });
        } else {
            this.elements.activeRepStatus.textContent = `${this.activeRep.cue} cue active`;
        }
    }

    selectRunType(runType) {
        this.selectedRunType = runType;
        this.elements.runTabs.forEach(button => {
            button.classList.toggle('active', button.dataset.runType === runType);
        });
        this.updateCameraGuide();
    }

    getEffectiveRunType() {
        if (this.selectedRunType === 'AUTO') {
            return this.activeRep?.cue || 'AUTO';
        }
        return this.selectedRunType;
    }

    updateCameraGuide() {
        const effectiveType = this.getEffectiveRunType();
        const guidance = RUN_GUIDANCE[effectiveType] || RUN_GUIDANCE.AUTO;
        const recordingText = this.activeRep
            ? `Recording only this ${this.activeRep.cue} rep window.`
            : 'Armed only. Recording starts when the glasses cue appears.';

        this.elements.cameraPlacement.textContent = guidance.placement;
        this.elements.cameraReads.textContent = `${guidance.reads} ${recordingText}`;
        this.updateAngleWarning(null, effectiveType);
    }

    updateStepStatus({ connected, cameraOn, cueActive } = {}) {
        if (typeof connected === 'boolean') {
            this.elements.connectStep.classList.toggle('active', connected);
        }
        if (typeof cameraOn === 'boolean') {
            this.elements.cameraStep.classList.toggle('active', cameraOn);
        }
        if (typeof cueActive === 'boolean') {
            this.elements.cueStep.classList.toggle('active', cueActive);
        }
    }

    setTrackerState(status, extra = {}) {
        if (!this.sessionId) return;
        const stateKey = `${status}_${extra.repId || ''}_${extra.cue || ''}_${extra.testAt || ''}`;
        if (stateKey === this.lastTrackerStateKey) return;

        this.lastTrackerStateKey = stateKey;

        setDoc(doc(this.db, 'sessions', this.sessionId), {
            latestTrackerState: {
                status,
                ...extra,
                updatedAt: serverTimestamp()
            },
            updatedAt: serverTimestamp()
        }, { merge: true }).catch(error => {
            console.warn('Tracker state save failed:', error);
        });
    }

    updateAngleWarning(metrics, runType = this.getEffectiveRunType()) {
        if (!this.elements.angleWarning) return;

        if (!metrics) {
            this.elements.angleWarning.textContent = runType === 'LEFT' || runType === 'RIGHT'
                ? 'Angle: use front view for cut form.'
                : 'Angle: use side or 45-degree view for this run.';
            return;
        }

        if ((runType === 'LEFT' || runType === 'RIGHT') && metrics.shoulderHipOffsetPct > 90) {
            this.elements.angleWarning.textContent = 'Angle warning: athlete may be too side-on for front cut reading.';
            return;
        }

        if ((runType === 'GO' || runType === 'DROP') && metrics.shoulderHipOffsetPct < 8) {
            this.elements.angleWarning.textContent = 'Angle warning: side view works better for this run.';
            return;
        }

        this.elements.angleWarning.textContent = 'Angle looks usable.';
    }

    loadSessionSettings(sessionSettings) {
        this.elements.trackerGoalSelect.value = String(sessionSettings.sessionGoalReps ?? 0);
        this.elements.trackerDelayMin.value = sessionSettings.delayMin ?? 1.0;
        this.elements.trackerDelayMax.value = sessionSettings.delayMax ?? 3.0;
        this.elements.trackerAudioSelect.value = sessionSettings.audioEnabled === false ? 'off' : 'on';

        const enabledCues = Array.isArray(sessionSettings.enabledCues) ? sessionSettings.enabledCues : ['LEFT', 'RIGHT', 'DROP', 'TURN', 'GO'];
        this.elements.trackerCueToggles.forEach(toggle => {
            toggle.checked = enabledCues.includes(toggle.value);
        });
    }

    saveSessionSettings() {
        if (!this.sessionId) {
            this.elements.settingsSaveStatus.textContent = 'Connect first';
            return;
        }

        const enabledCues = [...this.elements.trackerCueToggles]
            .filter(toggle => toggle.checked)
            .map(toggle => toggle.value);
        const safeCues = enabledCues.length ? enabledCues : ['GO'];
        const delayMin = parseFloat(this.elements.trackerDelayMin.value);
        const delayMax = parseFloat(this.elements.trackerDelayMax.value);
        const sessionSettings = {
            audioEnabled: this.elements.trackerAudioSelect.value === 'on',
            timingMode: 'manual',
            speechRate: 1.0,
            sessionGoalReps: parseInt(this.elements.trackerGoalSelect.value, 10),
            delayMin: Number.isFinite(delayMin) ? delayMin : 1.0,
            delayMax: Number.isFinite(delayMax) ? Math.max(delayMax, delayMin || 1.0) : 3.0,
            enabledCues: safeCues
        };

        this.elements.settingsSaveStatus.textContent = 'Saving...';
        setDoc(doc(this.db, 'sessions', this.sessionId), {
            sessionSettings,
            updatedAt: serverTimestamp()
        }, { merge: true })
            .then(() => {
                this.elements.settingsSaveStatus.textContent = 'Saved for session';
            })
            .catch(error => {
                console.warn('Session settings save failed:', error);
                this.elements.settingsSaveStatus.textContent = 'Save failed';
            });
    }

    async startTracking() {
        this.elements.startTrackingBtn.disabled = true;
        this.setStatus('Opening camera...');

        try {
            await this.startCamera();
            this.elements.trackerPlaceholder.style.display = 'none';
            this.isTracking = true;
            this.elements.stopTrackingBtn.disabled = false;
            this.updateStepStatus({ cameraOn: true });
            this.setTrackerState('camera on');
            this.setStatus(this.sessionId ? 'Camera on. Loading pose tracker...' : 'Camera on. Connect session code to record reps.');
            requestAnimationFrame(() => this.trackFrame());
        } catch (error) {
            console.error(error);
            this.setStatus(this.getCameraErrorMessage(error));
            this.elements.startTrackingBtn.disabled = false;
            return;
        }

        try {
            await this.initializePoseLandmarker();
            this.isPoseReady = true;
            this.poseErrorShown = false;
            this.setStatus('Tracking body position and saving samples.');
        } catch (error) {
            console.error(error);
            this.setStatus(this.getPoseErrorMessage(error));
            this.elements.bodyFeedback.textContent = 'Camera preview is on. Pose overlay did not load.';
        }
    }

    async initializePoseLandmarker() {
        if (this.poseLandmarker) return;

        const failures = [];

        for (const [index, loaderOption] of POSE_LOADER_OPTIONS.entries()) {
            this.setStatus(`Loading pose tracker ${index + 1}/${POSE_LOADER_OPTIONS.length}...`);

            try {
                await this.loadPoseLandmarker(loaderOption);
                return;
            } catch (error) {
                failures.push(`${index + 1}: ${error?.message || error?.name || 'unknown'}`);
                console.warn('Pose loader failed:', loaderOption.scriptUrl, error);
            }
        }

        throw new Error(`all pose loaders failed (${failures.join('; ')})`);
    }

    async loadPoseLandmarker(loaderOption) {
        const { FilesetResolver, PoseLandmarker } = await import(loaderOption.scriptUrl);
        this.PoseLandmarker = PoseLandmarker;

        const vision = await FilesetResolver.forVisionTasks(loaderOption.wasmUrl);
        this.currentPoseModelUrl = loaderOption.modelUrl;

        try {
            this.poseLandmarker = await this.createPoseLandmarker(vision, "GPU");
        } catch (error) {
            console.warn('GPU pose tracking unavailable, falling back to CPU:', error);
            this.poseLandmarker = await this.createPoseLandmarker(vision, "CPU");
        }
    }

    async createPoseLandmarker(vision, delegate) {
        return this.PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: this.currentPoseModelUrl,
                delegate
            },
            runningMode: "VIDEO",
            numPoses: 1
        });
    }

    async startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('camera-api-unavailable');
        }

        this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        this.elements.trackerVideo.srcObject = this.stream;
        await this.elements.trackerVideo.play();
        this.resizeCanvas();
    }

    getCameraErrorMessage(error) {
        const name = error?.name || '';
        const message = error?.message || '';

        if (!window.isSecureContext) {
            return 'Camera blocked: open the Vercel HTTPS link, not plain HTTP.';
        }

        if (name === 'NotAllowedError' || name === 'SecurityError') {
            return 'Camera blocked: allow camera access in browser settings.';
        }

        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            return 'Camera not found: try another device or browser.';
        }

        if (message === 'camera-api-unavailable') {
            return 'Camera API unavailable in this browser.';
        }

        return `Camera failed: ${name || message || 'unknown error'}.`;
    }

    getPoseErrorMessage(error) {
        const name = error?.name || '';
        const message = error?.message || '';

        if (!navigator.onLine) {
            return 'Pose tracking failed: device is offline.';
        }

        if (message.includes('all pose loaders failed')) {
            return 'Pose tracking failed: model could not load. Try Wi-Fi or another browser.';
        }

        return `Pose tracking failed: ${name || message || 'could not load model'}.`;
    }

    resizeCanvas() {
        const video = this.elements.trackerVideo;
        const canvas = this.elements.trackerCanvas;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    }

    trackFrame() {
        if (!this.isTracking) return;

        const video = this.elements.trackerVideo;
        if (this.isPoseReady && video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = video.currentTime;
            try {
                const results = this.poseLandmarker.detectForVideo(video, performance.now());
                this.renderResults(results);
            } catch (error) {
                console.warn('Pose frame failed:', error);
                this.isPoseReady = false;
                if (!this.poseErrorShown) {
                    this.poseErrorShown = true;
                    this.setStatus('Camera is still on. Pose overlay paused after a tracking error.');
                }
            }
        }

        requestAnimationFrame(() => this.trackFrame());
    }

    renderResults(results) {
        const landmarks = results.landmarks?.[0] || null;
        this.drawPose(landmarks);

        if (!landmarks) {
            this.elements.bodyFeedback.textContent = 'Step into the camera view.';
            return;
        }

        const runType = this.getEffectiveRunType();
        const metrics = this.calculateMetrics(landmarks, runType);
        const feedback = this.buildFeedback(metrics, runType);

        this.elements.bodyFeedback.textContent = feedback.message;
        this.updateMetricDisplay(metrics, runType);
        this.updateAngleWarning(metrics, runType);

        this.saveTrackingSample(metrics, feedback, runType);
    }

    drawPose(landmarks) {
        const canvas = this.elements.trackerCanvas;
        const context = this.canvasContext;
        context.clearRect(0, 0, canvas.width, canvas.height);

        if (!landmarks) return;

        context.lineWidth = 5;
        context.strokeStyle = '#00ff00';
        context.fillStyle = '#ffffff';

        POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
            const start = landmarks[startIndex];
            const end = landmarks[endIndex];
            if (!this.isVisible(start) || !this.isVisible(end)) return;

            context.beginPath();
            context.moveTo(start.x * canvas.width, start.y * canvas.height);
            context.lineTo(end.x * canvas.width, end.y * canvas.height);
            context.stroke();
        });

        landmarks.forEach(point => {
            if (!this.isVisible(point)) return;
            context.beginPath();
            context.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2);
            context.fill();
        });
    }

    calculateMetrics(landmarks, runType = 'AUTO') {
        const shoulder = this.midpoint(landmarks[11], landmarks[12]);
        const hip = this.midpoint(landmarks[23], landmarks[24]);
        const leftKneeAngle = this.angleBetween(landmarks[23], landmarks[25], landmarks[27]);
        const rightKneeAngle = this.angleBetween(landmarks[24], landmarks[26], landmarks[28]);
        const kneeAngles = [leftKneeAngle, rightKneeAngle].filter(Number.isFinite);
        const kneeAngleDeg = kneeAngles.length
            ? kneeAngles.reduce((total, angle) => total + angle, 0) / kneeAngles.length
            : 0;
        const stanceWidthPct = Math.abs(landmarks[27].x - landmarks[28].x) * 100;
        const trunkLeanDeg = Math.abs(Math.atan2(shoulder.x - hip.x, hip.y - shoulder.y) * 180 / Math.PI);
        const hipWidth = Math.max(Math.abs(landmarks[23].x - landmarks[24].x), 0.01);
        const leftKneeStackPct = Math.abs(landmarks[25].x - landmarks[27].x) / hipWidth * 100;
        const rightKneeStackPct = Math.abs(landmarks[26].x - landmarks[28].x) / hipWidth * 100;
        const leftKneeInsidePct = Math.max(0, landmarks[25].x - landmarks[27].x) / hipWidth * 100;
        const rightKneeInsidePct = Math.max(0, landmarks[28].x - landmarks[26].x) / hipWidth * 100;
        const shoulderTiltDeg = this.segmentTiltDeg(landmarks[11], landmarks[12]);
        const hipTiltDeg = this.segmentTiltDeg(landmarks[23], landmarks[24]);
        const shoulderHipOffsetPct = Math.abs(shoulder.x - hip.x) / hipWidth * 100;
        const torsoHeight = Math.max(Math.abs(shoulder.y - hip.y), 0.05);
        const leftFootReachPct = Math.abs(landmarks[27].x - hip.x) / torsoHeight * 100;
        const rightFootReachPct = Math.abs(landmarks[28].x - hip.x) / torsoHeight * 100;
        const footReachPct = Math.max(leftFootReachPct, rightFootReachPct);
        const leftShinAngleDeg = this.segmentVerticalTiltDeg(landmarks[25], landmarks[27]);
        const rightShinAngleDeg = this.segmentVerticalTiltDeg(landmarks[26], landmarks[28]);
        const shinAngles = [leftShinAngleDeg, rightShinAngleDeg].filter(Number.isFinite);
        const shinAngleDeg = shinAngles.length
            ? shinAngles.reduce((total, angle) => total + angle, 0) / shinAngles.length
            : 0;

        return {
            trunkLeanDeg,
            kneeAngleDeg,
            leftKneeAngleDeg: leftKneeAngle,
            rightKneeAngleDeg: rightKneeAngle,
            stanceWidthPct,
            leftKneeStackPct,
            rightKneeStackPct,
            leftKneeInsidePct,
            rightKneeInsidePct,
            shoulderTiltDeg,
            hipTiltDeg,
            shoulderHipOffsetPct,
            footReachPct,
            shinAngleDeg,
            hipHeightPct: hip.y * 100,
            poseScore: this.getPoseScore(landmarks, runType)
        };
    }

    updateMetricDisplay(metrics, runType) {
        if (runType === 'LEFT' || runType === 'RIGHT') {
            const plantSide = runType === 'LEFT' ? 'right' : 'left';
            const plantKneeStackPct = plantSide === 'right' ? metrics.rightKneeStackPct : metrics.leftKneeStackPct;
            const plantKneeAngle = plantSide === 'right' ? metrics.rightKneeAngleDeg : metrics.leftKneeAngleDeg;

            this.elements.leanMetricLabel.textContent = 'Chest';
            this.elements.kneeMetricLabel.textContent = 'Plant Knee';
            this.elements.baseMetricLabel.textContent = 'Base';
            this.elements.leanMetric.textContent = `chest ${metrics.shoulderHipOffsetPct.toFixed(0)}%`;
            this.elements.kneeMetric.textContent = `${plantSide} ${plantKneeAngle.toFixed(0)}deg / ${plantKneeStackPct.toFixed(0)}%`;
            this.elements.baseMetric.textContent = `${metrics.stanceWidthPct.toFixed(1)}%`;
            return;
        }

        this.elements.leanMetricLabel.textContent = 'Lean';
        this.elements.kneeMetricLabel.textContent = 'Knee';
        this.elements.baseMetricLabel.textContent = 'Base';
        this.elements.leanMetric.textContent = `${metrics.trunkLeanDeg.toFixed(1)} deg`;
        this.elements.kneeMetric.textContent = `${metrics.kneeAngleDeg.toFixed(0)} deg`;
        this.elements.baseMetric.textContent = `${metrics.stanceWidthPct.toFixed(1)}%`;
    }

    buildFeedback(metrics, runType = 'AUTO') {
        const issues = [];
        const strengths = [];

        if (metrics.poseScore < MIN_TRACKING_POSE_SCORE) {
            return {
                message: 'Low-confidence tracking. Keep torso and one full leg visible.',
                good: 'camera connected',
                fix: 'camera angle needs cleanup',
                cue: 'Move the camera so hips, shoulders, knee, and foot stay visible.',
                drill: 'Camera setup rep before testing',
                score: 35,
                confidence: 'low',
                strengths: ['camera connected'],
                fixes: ['tracking confidence is low'],
                issues: [{
                    key: 'low-confidence',
                    label: 'Tracking confidence is low',
                    fix: 'Keep the athlete bigger in frame with hips, shoulders, knee, and foot visible.',
                    cue: 'Fill the frame before the next rep.',
                    drill: 'Camera setup rep before testing',
                    severity: 4,
                    confidence: metrics.poseScore,
                    moment: 'whole rep'
                }],
                leanLabel: 'low confidence',
                kneeLabel: 'low confidence',
                baseLabel: 'low confidence',
                runType
            };
        }

        let leanLabel = 'good lean';
        let kneeLabel = 'athletic bend';
        let baseLabel = 'stable base';

        if (runType === 'GO') {
            ({ leanLabel, kneeLabel, baseLabel } = this.addAccelerationFeedback(issues, strengths, metrics));
        } else if (runType === 'LEFT' || runType === 'RIGHT') {
            ({ leanLabel, kneeLabel, baseLabel } = this.addCuttingFeedback(issues, strengths, metrics, runType));
        } else {
            ({ leanLabel, kneeLabel, baseLabel } = this.addGeneralMovementFeedback(issues, strengths, metrics, runType));
        }

        const rankedIssues = this.rankIssues(issues);
        const rankedStrengths = strengths.slice(0, 3);
        const topIssue = rankedIssues[0] || null;
        const score = this.scoreFeedback(metrics, rankedIssues);

        return {
            message: topIssue ? topIssue.fix : 'Good athletic position for this view.',
            good: rankedStrengths.length ? rankedStrengths.join(', ') : 'effort and camera view',
            fix: topIssue ? topIssue.fix : 'keep same shape',
            cue: topIssue ? topIssue.cue : 'Repeat that shape next rep.',
            drill: topIssue ? topIssue.drill : this.defaultDrill(runType),
            score,
            confidence: metrics.poseScore < 0.45 ? 'medium' : 'high',
            strengths: rankedStrengths,
            fixes: rankedIssues.slice(0, 3).map(issue => issue.fix),
            issues: rankedIssues.slice(0, 4),
            leanLabel,
            kneeLabel,
            baseLabel,
            runType
        };
    }

    addAccelerationFeedback(issues, strengths, metrics) {
        let leanLabel = 'good projection';
        let kneeLabel = 'loaded first step';
        let baseLabel = 'compact strike';

        if (metrics.trunkLeanDeg < 10) {
            leanLabel = 'too upright';
            this.addIssue(issues, 'upright-accel', 'Start posture is too upright', 'Start with more forward body angle so the first steps push back instead of popping up.', 'Push the ground back for the first three steps.', 'Wall-drive marches', 5, metrics.poseScore, 'first steps');
        } else if (metrics.trunkLeanDeg > 34) {
            leanLabel = 'falling forward';
            this.addIssue(issues, 'overlean-accel', 'Body angle is too folded', 'Control the forward lean so the hips can keep driving through the sprint.', 'Lean from the ankles, not by folding at the waist.', 'Falling starts', 3, metrics.poseScore, 'first steps');
        } else {
            strengths.push('good forward projection');
        }

        if (metrics.kneeAngleDeg > 165) {
            kneeLabel = 'too tall';
            this.addIssue(issues, 'tall-first-step', 'First steps look too tall', 'Stay loaded through the hips and knees before pushing out.', 'Push low, then rise gradually.', 'Three-step wall drive', 4, metrics.poseScore, 'first steps');
        } else if (metrics.kneeAngleDeg < 112) {
            kneeLabel = 'sitting low';
            this.addIssue(issues, 'sitting-accel', 'Start position looks too low', 'Rise slightly so the first step can attack backward through the ground.', 'Hips up before you push.', 'Two-point start holds', 3, metrics.poseScore, 'setup');
        } else {
            strengths.push('loaded knee position');
        }

        if (metrics.footReachPct > 115) {
            baseLabel = 'reaching stride';
            this.addIssue(issues, 'overstride', 'Foot appears to reach too far ahead of the hips', 'Bring the foot strike closer under the hip so the next step can push backward faster.', 'Step down and back under the hip.', 'A-march to acceleration', 5, metrics.poseScore, 'foot strike');
        } else {
            strengths.push('foot strike stays close to hips');
        }

        if (metrics.shinAngleDeg < 10 && metrics.trunkLeanDeg < 16) {
            this.addIssue(issues, 'shin-angle', 'Shin angle looks too vertical for acceleration', 'Create a lower push angle on the first steps so projection goes forward.', 'Shin and chest point where you want to go.', 'Wall-drive switches', 4, metrics.poseScore, 'first steps');
        } else {
            strengths.push('shin angle supports forward push');
        }

        return { leanLabel, kneeLabel, baseLabel };
    }

    addGeneralMovementFeedback(issues, strengths, metrics, runType) {
        let leanLabel = 'good lean';
        let kneeLabel = 'athletic bend';
        let baseLabel = 'stable setup';

        if (metrics.trunkLeanDeg < 8) {
            leanLabel = 'too upright';
            this.addIssue(issues, 'upright', 'Body position is too upright', 'Use a little more forward angle before the movement.', 'Chest leads the first step.', this.defaultDrill(runType), 3, metrics.poseScore, 'setup');
        } else if (metrics.trunkLeanDeg > 32) {
            leanLabel = 'over leaning';
            this.addIssue(issues, 'overlean', 'Body position is folded too far forward', 'Control the lean so the hips stay under you.', 'Tall hips, strong chest.', this.defaultDrill(runType), 3, metrics.poseScore, 'setup');
        } else {
            strengths.push('controlled body angle');
        }

        if (metrics.kneeAngleDeg > 165) {
            kneeLabel = 'knees straight';
            this.addIssue(issues, 'straight-knees', 'Legs are too straight', 'Load the hips and knees before pushing.', 'Load, then go.', this.defaultDrill(runType), 3, metrics.poseScore, 'setup');
        } else if (metrics.kneeAngleDeg < 120) {
            kneeLabel = 'very deep';
            this.addIssue(issues, 'too-deep', 'Setup is too deep', 'Rise slightly so you can push out cleanly.', 'Hips up before the push.', this.defaultDrill(runType), 2, metrics.poseScore, 'setup');
        } else {
            strengths.push('athletic knee bend');
        }

        if (metrics.stanceWidthPct < 6) {
            baseLabel = 'feet close';
            this.addIssue(issues, 'narrow-setup', 'Feet are too close for a strong push', 'Create enough space between the feet to push without crossing over.', 'Split the feet before you go.', this.defaultDrill(runType), 2, metrics.poseScore, 'setup');
        } else {
            strengths.push('balanced setup');
        }

        return { leanLabel, kneeLabel, baseLabel };
    }

    addCuttingFeedback(issues, strengths, metrics, runType) {
        const plantSide = runType === 'LEFT' ? 'right' : 'left';
        const plantKneeStackPct = plantSide === 'right' ? metrics.rightKneeStackPct : metrics.leftKneeStackPct;
        const plantKneeInsidePct = plantSide === 'right' ? metrics.rightKneeInsidePct : metrics.leftKneeInsidePct;
        const plantKneeAngle = plantSide === 'right' ? metrics.rightKneeAngleDeg : metrics.leftKneeAngleDeg;
        const tiltMismatch = Math.abs(metrics.shoulderTiltDeg - metrics.hipTiltDeg);
        let leanLabel = 'chest controlled';
        let kneeLabel = `${plantSide} plant loaded`;
        let baseLabel = 'plant width ok';

        if (plantKneeInsidePct > 35) {
            kneeLabel = `${plantSide} knee inside`;
            this.addIssue(issues, 'knee-collapse', `${plantSide} knee moves inside the foot`, `On the ${runType.toLowerCase()} cut, keep the ${plantSide} knee stacked closer over the foot so the plant is more stable.`, `Show the ${plantSide} knee to the toes, then exit.`, 'Slow plant-and-exit cuts', 5, metrics.poseScore, 'plant frame');
        } else if (plantKneeStackPct > 55) {
            kneeLabel = `${plantSide} knee offset`;
            this.addIssue(issues, 'knee-stack', `${plantSide} knee is not stacked over the plant`, `Clean up the plant so the ${plantSide} knee and foot point the same direction before exiting.`, `Knee over laces on the plant.`, 'Cone plant holds', 4, metrics.poseScore, 'plant frame');
        } else {
            strengths.push(`${plantSide} knee stacks over plant`);
        }

        if (plantKneeAngle > 160) {
            kneeLabel = `${plantSide} plant tall`;
            this.addIssue(issues, 'tall-plant', `${plantSide} plant is too tall`, `Load the ${plantSide} hip and knee earlier so the cut is not a stiff step.`, `Lower into the plant before you leave.`, 'Decel-to-plant reps', 4, metrics.poseScore, 'plant frame');
        } else if (plantKneeAngle < 120) {
            kneeLabel = `${plantSide} plant deep`;
            this.addIssue(issues, 'deep-plant', `${plantSide} plant is too deep`, `Do not sink so deep on the ${plantSide} plant; stay springy enough to re-accelerate.`, `Touch down, then get out.`, 'Snap-down cut exits', 3, metrics.poseScore, 'plant frame');
        } else {
            strengths.push(`${plantSide} plant has useful bend`);
        }

        if (metrics.shoulderHipOffsetPct > 65) {
            leanLabel = 'chest drifting';
            this.addIssue(issues, 'chest-drift', 'Chest drifts away from the hips', 'Keep chest and hips connected through the plant so the exit step is cleaner.', 'Chest over hips through the cut.', 'Mirror shuffle cuts', 4, metrics.poseScore, 'plant frame');
        } else {
            strengths.push('chest stays connected to hips');
        }

        if (tiltMismatch > 12) {
            this.addIssue(issues, 'tilt-mismatch', 'Shoulders and hips tilt differently', 'Keep the shoulders and hips turning together so the cut does not leak sideways.', 'Turn the whole body together.', 'Walk-through angle cuts', 3, metrics.poseScore, 'plant frame');
        }

        if (metrics.stanceWidthPct < 10) {
            baseLabel = 'plant too close';
            this.addIssue(issues, 'narrow-plant', 'Plant foot is too close to the body', `Place the ${plantSide} plant a little wider so the athlete can redirect without crossing over.`, 'Plant outside the hip, then punch out.', 'Lateral bound to stick', 3, metrics.poseScore, 'plant frame');
        } else {
            strengths.push('plant gives room to redirect');
        }

        return { leanLabel, kneeLabel, baseLabel };
    }

    addIssue(issues, key, label, fix, cue, drill, severity, confidence, moment) {
        issues.push({ key, label, fix, cue, drill, severity, confidence, moment });
    }

    rankIssues(issues) {
        return [...issues].sort((a, b) => {
            const aScore = a.severity * (a.confidence || 0.5);
            const bScore = b.severity * (b.confidence || 0.5);
            return bScore - aScore;
        });
    }

    scoreFeedback(metrics, issues) {
        const penalty = issues.reduce((total, issue) => total + (issue.severity * 7), 0);
        const confidencePenalty = metrics.poseScore < 0.45 ? 8 : 0;
        return Math.max(40, Math.min(100, Math.round(94 - penalty - confidencePenalty)));
    }

    defaultDrill(runType) {
        if (runType === 'GO') return 'Wall-drive marches';
        if (runType === 'LEFT' || runType === 'RIGHT') return 'Slow plant-and-exit cuts';
        if (runType === 'DROP') return 'Snap-down to sprint';
        if (runType === 'TURN') return 'Walk-through turn exits';
        return 'Controlled technique rep';
    }

    async saveTrackingSample(metrics, feedback, runType) {
        if (!this.sessionId || !this.activeRep?.repId) return;
        if (metrics.poseScore < MIN_TRACKING_POSE_SCORE) return;

        const rep = this.activeRep;
        const now = performance.now();
        const lastSaveMs = this.lastSaveMsByRepId.get(rep.repId) || 0;
        if (now - lastSaveMs < 250) return;
        this.lastSaveMsByRepId.set(rep.repId, now);
        this.lastSaveMs = now;

        const sample = {
            sessionId: this.sessionId,
            sessionCode: this.sessionCode,
            repId: rep.repId,
            cue: rep.cue,
            runType,
            sampleMs: this.getActiveRepSampleMs(),
            metrics,
            feedback,
            source: 'side-tracker',
            createdAt: serverTimestamp()
        };

        const samples = this.getRepSamples(rep.repId);
        samples.push(sample);
        this.activeRepSamples = samples;
        this.updateCaptureBadge(samples.length);

        try {
            await addDoc(collection(this.db, 'sessions', this.sessionId, 'reps', rep.repId, 'trackingSamples'), sample);
        } catch (error) {
            console.warn('Tracking sample save failed:', error);
            this.setStatus('Tracking locally, but Firestore save failed.');
        }
    }

    async finalizeRepFeedback(rep) {
        if (!this.sessionId || !rep?.repId) return;
        const samples = this.getRepSamples(rep.repId).slice();

        if (samples.length === 0) {
            const summary = {
                runType: rep.cue,
                metrics: null,
                feedback: {
                    good: 'camera connected',
                    fix: 'keep torso and one full leg visible',
                    cue: 'Fill the frame before the next rep.',
                    drill: 'Camera setup rep before testing',
                    score: 0,
                    confidence: 'low',
                    strengths: ['camera connected'],
                    fixes: ['tracking confidence was too low'],
                    issues: [{
                        key: 'no-clean-samples',
                        label: 'No clean pose samples captured',
                        fix: 'Keep torso, hips, knee, and foot visible during the whole rep.',
                        cue: 'Fill the frame before the next rep.',
                        drill: 'Camera setup rep before testing',
                        severity: 5,
                        confidence: 0,
                        moment: 'whole rep'
                    }],
                    message: 'No clear pose samples captured',
                    runType: rep.cue
                }
            };
            this.showFinalCoachFeedback(summary);
            this.updateCaptureBadge(0, 'No clean samples');
            await this.publishFinalFeedback(rep, summary);
            this.clearRepSamples(rep.repId);
            return;
        }

        const summary = this.buildRepFeedbackSummary(rep, samples);
        const capturedCount = samples.length;
        this.showFinalCoachFeedback(summary);
        this.updateCaptureBadge(capturedCount, `Saved ${capturedCount} samples`);
        await this.publishFinalFeedback(rep, summary);
        this.clearRepSamples(rep.repId);
    }

    async publishFinalFeedback(rep, summary) {
        try {
            await setDoc(doc(this.db, 'sessions', this.sessionId), {
                latestTrackingFeedback: {
                    repId: rep.repId,
                    cue: rep.cue,
                    runType: summary.runType,
                    metrics: summary.metrics,
                    feedback: summary.feedback,
                    source: 'side-tracker',
                    updatedAt: serverTimestamp()
                }
            }, { merge: true });
            this.setStatus('Final coach feedback sent to glasses.');
        } catch (error) {
            console.warn('Final feedback save failed:', error);
            this.setStatus('Final coach feedback save failed.');
        }
    }

    showFinalCoachFeedback(summary) {
        const feedback = summary.feedback;
        const good = feedback.good || 'effort';
        const fix = feedback.fix || feedback.message || 'keep same shape';
        this.elements.bodyFeedback.textContent = `Final ${summary.runType}: Good ${good}. Fix ${fix}.`;
    }

    updateCaptureBadge(count, label = null) {
        if (!this.elements.captureBadge) return;
        this.elements.captureBadge.textContent = label || `Captured: ${count} samples`;
    }

    getRepSamples(repId) {
        if (!this.samplesByRepId.has(repId)) {
            this.samplesByRepId.set(repId, []);
        }
        return this.samplesByRepId.get(repId);
    }

    clearRepSamples(repId) {
        this.samplesByRepId.delete(repId);
        this.lastSaveMsByRepId.delete(repId);
        if (this.activeRep?.repId === repId) {
            const samples = [];
            this.samplesByRepId.set(repId, samples);
            this.activeRepSamples = samples;
            return;
        }
        this.activeRepSamples = this.activeRep?.repId ? this.getRepSamples(this.activeRep.repId) : [];
    }

    buildRepFeedbackSummary(rep, samples) {
        const runType = samples[samples.length - 1]?.runType || rep.cue;
        const issueMap = new Map();
        const goodCounts = new Map();

        samples.forEach(sample => {
            (sample.feedback.issues || []).forEach(issue => {
                const key = issue.key || issue.fix;
                const existing = issueMap.get(key) || {
                    ...issue,
                    count: 0,
                    score: 0,
                    bestMoment: issue.moment || this.formatSampleMoment(sample.sampleMs),
                    momentMs: sample.sampleMs
                };
                const weightedSeverity = (issue.severity || 1) * (issue.confidence || sample.metrics.poseScore || 0.5);
                existing.count += 1;
                existing.score += weightedSeverity;
                if (weightedSeverity >= (existing.bestWeightedSeverity || 0)) {
                    existing.bestWeightedSeverity = weightedSeverity;
                    existing.bestMoment = issue.moment || this.formatSampleMoment(sample.sampleMs);
                    existing.momentMs = sample.sampleMs;
                }
                issueMap.set(key, existing);
            });

            (sample.feedback.strengths || String(sample.feedback.good || '').split(','))
                .map(item => String(item).trim())
                .filter(Boolean)
                .forEach(item => goodCounts.set(item, (goodCounts.get(item) || 0) + 1));
        });

        const rankedIssues = [...issueMap.values()]
            .map(issue => ({ ...issue, rankScore: issue.score + issue.count * 0.5 }))
            .sort((a, b) => b.rankScore - a.rankScore)
            .slice(0, 3);
        const topIssue = rankedIssues[0] || null;
        const strengths = this.topCounts(goodCounts, 3);
        const metrics = samples[samples.length - 1].metrics;
        const averageScore = Math.round(this.average(samples.map(sample => sample.feedback.score || 70)));
        const averageConfidence = this.average(samples.map(sample => sample.metrics.poseScore || 0));
        const confidence = averageConfidence < 0.35 ? 'low' : averageConfidence < 0.55 ? 'medium' : 'high';
        const defaultCue = runType === 'GO'
            ? 'Push back through the ground for the first three steps.'
            : 'Clean up the plant before you exit.';
        const defaultDrill = this.defaultDrill(runType);

        return {
            runType,
            metrics,
            feedback: {
                message: topIssue ? `${topIssue.fix} (${topIssue.bestMoment}).` : 'Good athletic position for this camera view.',
                good: strengths.length ? strengths.join(', ') : 'camera view',
                fix: topIssue ? topIssue.fix : 'keep same shape',
                cue: topIssue ? topIssue.cue : defaultCue,
                drill: topIssue ? topIssue.drill : defaultDrill,
                score: averageScore,
                confidence,
                strengths,
                fixes: rankedIssues.map(issue => issue.fix),
                issues: rankedIssues.map(issue => ({
                    key: issue.key,
                    label: issue.label,
                    fix: issue.fix,
                    cue: issue.cue,
                    drill: issue.drill,
                    severity: issue.severity,
                    count: issue.count,
                    moment: issue.bestMoment,
                    momentMs: issue.momentMs
                })),
                runType
            }
        };
    }

    topCount(counts) {
        let best = null;
        let bestCount = 0;
        counts.forEach((count, label) => {
            if (count > bestCount) {
                best = label;
                bestCount = count;
            }
        });
        return best;
    }

    topCounts(counts, limit = 3) {
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([label]) => label);
    }

    average(values) {
        const cleanValues = values.filter(Number.isFinite);
        if (cleanValues.length === 0) return 0;
        return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
    }

    getActiveRepSampleMs() {
        const startedAt = Date.parse(this.activeRep?.cueStartedAt || '');
        if (!Number.isFinite(startedAt)) return null;
        return Math.max(0, Date.now() - startedAt);
    }

    formatSampleMoment(sampleMs) {
        if (!Number.isFinite(sampleMs)) return 'tracked moment';
        return `${(sampleMs / 1000).toFixed(1)}s`;
    }

    stopTracking() {
        if (this.activeRep) {
            this.finalizeRepFeedback(this.activeRep);
        }

        this.isTracking = false;
        this.isPoseReady = false;
        this.poseErrorShown = false;
        this.elements.stopTrackingBtn.disabled = true;
        this.elements.startTrackingBtn.disabled = !this.sessionId;
        this.elements.trackerPlaceholder.style.display = 'flex';
        this.updateStepStatus({ cameraOn: false, cueActive: false });
        this.setTrackerState('connected');

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.elements.trackerVideo.srcObject = null;
        this.canvasContext.clearRect(0, 0, this.elements.trackerCanvas.width, this.elements.trackerCanvas.height);
        this.setStatus(this.sessionId ? `Connected to session ${this.sessionCode}.` : 'Waiting for session code.');
    }

    midpoint(a, b) {
        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            visibility: Math.min(a.visibility || 0, b.visibility || 0)
        };
    }

    angleBetween(a, b, c) {
        const ab = { x: a.x - b.x, y: a.y - b.y };
        const cb = { x: c.x - b.x, y: c.y - b.y };
        const dot = ab.x * cb.x + ab.y * cb.y;
        const abMag = Math.hypot(ab.x, ab.y);
        const cbMag = Math.hypot(cb.x, cb.y);
        const cosine = dot / (abMag * cbMag);

        return Math.acos(Math.min(1, Math.max(-1, cosine))) * 180 / Math.PI;
    }

    segmentTiltDeg(a, b) {
        return Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
    }

    segmentVerticalTiltDeg(a, b) {
        return Math.abs(Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI);
    }

    getPoseScore(landmarks, runType = 'AUTO') {
        const visibility = index => landmarks[index] ? (landmarks[index].visibility ?? 1) : 0;
        const isVisible = index => visibility(index) > LANDMARK_VISIBLE_THRESHOLD;
        const torsoPoints = [11, 12, 23, 24];
        const legPoints = [25, 26, 27, 28];
        const importantPoints = [...torsoPoints, ...legPoints];
        const visibleCount = importantPoints.filter(isVisible).length;
        const averageVisibility = importantPoints.reduce((total, index) => total + visibility(index), 0) / importantPoints.length;
        const leftLegVisible = [23, 25, 27].filter(isVisible).length >= 2;
        const rightLegVisible = [24, 26, 28].filter(isVisible).length >= 2;
        const torsoVisible = torsoPoints.filter(isVisible).length >= 2;
        const sideViewRun = ['GO', 'DROP', 'TURN', 'AUTO'].includes(runType);

        if (sideViewRun && torsoVisible && (leftLegVisible || rightLegVisible)) {
            return Math.max(0.5, averageVisibility);
        }

        return Math.max(visibleCount / importantPoints.length, averageVisibility);
    }

    isVisible(point) {
        return point && (point.visibility === undefined || point.visibility > LANDMARK_VISIBLE_THRESHOLD);
    }
}

new SideTracker();
