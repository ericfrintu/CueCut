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
            this.finalizeRepFeedback(this.activeRep);
            this.setTrackerState(this.isTracking ? 'camera on' : 'connected');
        }

        if (nextActiveRep && nextActiveRep.repId !== this.activeRep?.repId) {
            this.activeRepSamples = [];
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

        const metrics = this.calculateMetrics(landmarks);
        const runType = this.getEffectiveRunType();
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

    calculateMetrics(landmarks) {
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
            hipHeightPct: hip.y * 100,
            poseScore: this.getPoseScore(landmarks)
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
        const notes = [];
        const good = [];

        if (metrics.poseScore < 0.45) {
            return {
                message: 'Body partly out of frame.',
                good: 'camera connected',
                fix: 'step fully into frame',
                leanLabel: 'low confidence',
                kneeLabel: 'low confidence',
                baseLabel: 'low confidence',
                runType
            };
        }

        let leanLabel = 'good lean';
        if (metrics.trunkLeanDeg < 8) {
            leanLabel = 'too upright';
            notes.push('Lean forward more');
        } else if (metrics.trunkLeanDeg > 32) {
            leanLabel = 'over leaning';
            notes.push('Control the lean');
        } else {
            good.push('lean');
        }

        let kneeLabel = 'athletic bend';
        if (metrics.kneeAngleDeg > 165) {
            kneeLabel = 'knees straight';
            notes.push('Bend knees');
        } else if (metrics.kneeAngleDeg < 120) {
            kneeLabel = 'very deep';
            notes.push('Rise slightly');
        } else {
            good.push('knee bend');
        }

        let baseLabel = 'stable base';
        if (metrics.stanceWidthPct < 6) {
            baseLabel = 'narrow base';
            notes.push('Widen base');
        } else if (metrics.stanceWidthPct > 24) {
            baseLabel = 'wide base';
            notes.push('Narrow base');
        } else {
            good.push('base');
        }

        if (runType === 'TURN' && metrics.trunkLeanDeg < 12) {
            notes.push('Load turn angle');
        }

        if ((runType === 'LEFT' || runType === 'RIGHT') && metrics.stanceWidthPct < 8) {
            notes.push('Push from wider base');
        }

        if (runType === 'LEFT' || runType === 'RIGHT') {
            this.addCuttingFeedback(notes, good, metrics, runType);
        }

        return {
            message: notes.length ? notes.join(' + ') : 'Good athletic position',
            good: good.length ? good.join(', ') : 'effort and camera view',
            fix: notes.length ? notes.join(', ') : 'keep same shape',
            leanLabel,
            kneeLabel,
            baseLabel,
            runType
        };
    }

    addCuttingFeedback(notes, good, metrics, runType) {
        const plantSide = runType === 'LEFT' ? 'right' : 'left';
        const plantKneeStackPct = plantSide === 'right' ? metrics.rightKneeStackPct : metrics.leftKneeStackPct;
        const plantKneeInsidePct = plantSide === 'right' ? metrics.rightKneeInsidePct : metrics.leftKneeInsidePct;
        const plantKneeAngle = plantSide === 'right' ? metrics.rightKneeAngleDeg : metrics.leftKneeAngleDeg;
        const tiltMismatch = Math.abs(metrics.shoulderTiltDeg - metrics.hipTiltDeg);

        if (plantKneeInsidePct > 35) {
            notes.push(`${plantSide} knee collapsing in`);
        } else if (plantKneeStackPct > 55) {
            notes.push(`Stack ${plantSide} knee over foot`);
        } else {
            good.push(`${plantSide} knee stack`);
        }

        if (plantKneeAngle > 160) {
            notes.push(`Load ${plantSide} knee more`);
        } else if (plantKneeAngle < 120) {
            notes.push(`Do not sink so deep on ${plantSide}`);
        } else {
            good.push(`${plantSide} plant bend`);
        }

        if (metrics.shoulderHipOffsetPct > 65) {
            notes.push('Keep chest over hips');
        } else {
            good.push('chest over hips');
        }

        if (tiltMismatch > 12) {
            notes.push('Keep shoulders and hips connected');
        }

        if (metrics.stanceWidthPct < 10) {
            notes.push(`Widen plant for ${runType.toLowerCase()} cut`);
        }
    }

    async saveTrackingSample(metrics, feedback, runType) {
        if (!this.sessionId || !this.activeRep?.repId) return;
        if (metrics.poseScore < 0.45) return;

        const now = performance.now();
        if (now - this.lastSaveMs < 250) return;
        this.lastSaveMs = now;

        const sample = {
            sessionId: this.sessionId,
            sessionCode: this.sessionCode,
            repId: this.activeRep.repId,
            cue: this.activeRep.cue,
            runType,
            metrics,
            feedback,
            source: 'side-tracker',
            createdAt: serverTimestamp()
        };

        this.activeRepSamples.push(sample);
        this.updateCaptureBadge(this.activeRepSamples.length);

        try {
            await addDoc(collection(this.db, 'sessions', this.sessionId, 'reps', this.activeRep.repId, 'trackingSamples'), sample);
        } catch (error) {
            console.warn('Tracking sample save failed:', error);
            this.setStatus('Tracking locally, but Firestore save failed.');
        }
    }

    async finalizeRepFeedback(rep) {
        if (!this.sessionId || !rep?.repId) return;

        if (this.activeRepSamples.length === 0) {
            const summary = {
                runType: rep.cue,
                metrics: null,
                feedback: {
                    good: 'camera connected',
                    fix: 'move the runner fully into frame',
                    message: 'No clear pose samples captured',
                    runType: rep.cue
                }
            };
            this.showFinalCoachFeedback(summary);
            this.updateCaptureBadge(0, 'No clean samples');
            await this.publishFinalFeedback(rep, summary);
            return;
        }

        const summary = this.buildRepFeedbackSummary(rep, this.activeRepSamples);
        const capturedCount = this.activeRepSamples.length;
        this.activeRepSamples = [];
        this.showFinalCoachFeedback(summary);
        this.updateCaptureBadge(capturedCount, `Saved ${capturedCount} samples`);
        await this.publishFinalFeedback(rep, summary);
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

    buildRepFeedbackSummary(rep, samples) {
        const runType = samples[samples.length - 1]?.runType || rep.cue;
        const issueCounts = new Map();
        const goodCounts = new Map();

        samples.forEach(sample => {
            String(sample.feedback.fix || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
                .forEach(item => issueCounts.set(item, (issueCounts.get(item) || 0) + 1));

            String(sample.feedback.good || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
                .forEach(item => goodCounts.set(item, (goodCounts.get(item) || 0) + 1));
        });

        const topIssue = this.topCount(issueCounts) || 'keep same shape';
        const topGood = this.topCount(goodCounts) || 'camera view';
        const metrics = samples[samples.length - 1].metrics;

        return {
            runType,
            metrics,
            feedback: {
                message: topIssue === 'keep same shape' ? 'Good athletic position' : topIssue,
                good: topGood,
                fix: topIssue,
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

    getPoseScore(landmarks) {
        const importantPoints = [11, 12, 23, 24, 25, 26, 27, 28];
        const visiblePoints = importantPoints
            .map(index => landmarks[index]?.visibility || 0)
            .filter(score => score > 0.35);

        return visiblePoints.length / importantPoints.length;
    }

    isVisible(point) {
        return point && (point.visibility === undefined || point.visibility > 0.35);
    }
}

new SideTracker();
