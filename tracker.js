import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    addDoc,
    collection,
    doc,
    getDocs,
    getFirestore,
    limit,
    query,
    serverTimestamp,
    setDoc,
    where
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import {
    FilesetResolver,
    PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";

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

class SideTracker {
    constructor() {
        this.db = getFirestore(initializeApp(firebaseConfig));
        this.sessionId = null;
        this.sessionCode = null;
        this.stream = null;
        this.poseLandmarker = null;
        this.isTracking = false;
        this.lastVideoTime = -1;
        this.lastSaveMs = 0;

        this.elements = {
            sessionCodeInput: document.getElementById('sessionCodeInput'),
            connectSessionBtn: document.getElementById('connectSessionBtn'),
            trackerStatus: document.getElementById('trackerStatus'),
            trackerVideo: document.getElementById('trackerVideo'),
            trackerCanvas: document.getElementById('trackerCanvas'),
            trackerPlaceholder: document.getElementById('trackerPlaceholder'),
            startTrackingBtn: document.getElementById('startTrackingBtn'),
            stopTrackingBtn: document.getElementById('stopTrackingBtn'),
            bodyFeedback: document.getElementById('bodyFeedback'),
            leanMetric: document.getElementById('leanMetric'),
            kneeMetric: document.getElementById('kneeMetric'),
            baseMetric: document.getElementById('baseMetric')
        };

        this.canvasContext = this.elements.trackerCanvas.getContext('2d');
        this.bindEvents();
    }

    bindEvents() {
        this.elements.connectSessionBtn.addEventListener('click', () => this.connectSession());
        this.elements.startTrackingBtn.addEventListener('click', () => this.startTracking());
        this.elements.stopTrackingBtn.addEventListener('click', () => this.stopTracking());
        this.elements.sessionCodeInput.addEventListener('input', () => {
            this.elements.sessionCodeInput.value = this.elements.sessionCodeInput.value.replace(/\D/g, '').slice(0, 4);
        });
        this.elements.sessionCodeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.connectSession();
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
            const sessionsQuery = query(
                collection(this.db, 'sessions'),
                where('sessionCode', '==', code),
                limit(1)
            );
            const snapshot = await getDocs(sessionsQuery);

            if (snapshot.empty) {
                this.setStatus('No matching session yet. Start the session on the glasses first.');
                return;
            }

            const sessionDoc = snapshot.docs[0];
            this.sessionId = sessionDoc.id;
            this.sessionCode = code;
            this.elements.startTrackingBtn.disabled = false;
            this.setStatus(`Connected to session ${code}. Place this device on the athlete's side.`);
        } catch (error) {
            console.error(error);
            this.setStatus('Could not connect to Firestore. Check Wi-Fi and Firebase rules.');
        } finally {
            this.elements.connectSessionBtn.disabled = false;
        }
    }

    async startTracking() {
        if (!this.sessionId) {
            this.setStatus('Connect to a session first.');
            return;
        }

        this.elements.startTrackingBtn.disabled = true;
        this.setStatus('Loading pose tracker...');

        try {
            await this.initializePoseLandmarker();
            await this.startCamera();

            this.isTracking = true;
            this.elements.stopTrackingBtn.disabled = false;
            this.elements.trackerPlaceholder.style.display = 'none';
            this.setStatus('Tracking body position and saving samples.');
            requestAnimationFrame(() => this.trackFrame());
        } catch (error) {
            console.error(error);
            this.setStatus('Camera or pose tracking failed. Use HTTPS and allow camera access.');
            this.elements.startTrackingBtn.disabled = false;
        }
    }

    async initializePoseLandmarker() {
        if (this.poseLandmarker) return;

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
        );

        try {
            this.poseLandmarker = await this.createPoseLandmarker(vision, "GPU");
        } catch (error) {
            console.warn('GPU pose tracking unavailable, falling back to CPU:', error);
            this.poseLandmarker = await this.createPoseLandmarker(vision, "CPU");
        }
    }

    async createPoseLandmarker(vision, delegate) {
        return PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
                delegate
            },
            runningMode: "VIDEO",
            numPoses: 1
        });
    }

    async startCamera() {
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

    resizeCanvas() {
        const video = this.elements.trackerVideo;
        const canvas = this.elements.trackerCanvas;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    }

    trackFrame() {
        if (!this.isTracking) return;

        const video = this.elements.trackerVideo;
        if (video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = video.currentTime;
            const results = this.poseLandmarker.detectForVideo(video, performance.now());
            this.renderResults(results);
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
        const feedback = this.buildFeedback(metrics);

        this.elements.bodyFeedback.textContent = feedback.message;
        this.elements.leanMetric.textContent = `${metrics.trunkLeanDeg.toFixed(1)} deg`;
        this.elements.kneeMetric.textContent = `${metrics.kneeAngleDeg.toFixed(0)} deg`;
        this.elements.baseMetric.textContent = `${metrics.stanceWidthPct.toFixed(1)}%`;

        if (performance.now() - this.lastSaveMs > 1000) {
            this.lastSaveMs = performance.now();
            this.saveTrackingSample(metrics, feedback);
        }
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

        return {
            trunkLeanDeg,
            kneeAngleDeg,
            stanceWidthPct,
            hipHeightPct: hip.y * 100,
            poseScore: this.getPoseScore(landmarks)
        };
    }

    buildFeedback(metrics) {
        const notes = [];

        if (metrics.poseScore < 0.45) {
            return {
                message: 'Body partly out of frame.',
                leanLabel: 'low confidence',
                kneeLabel: 'low confidence',
                baseLabel: 'low confidence'
            };
        }

        let leanLabel = 'good lean';
        if (metrics.trunkLeanDeg < 8) {
            leanLabel = 'too upright';
            notes.push('Lean forward more');
        } else if (metrics.trunkLeanDeg > 32) {
            leanLabel = 'over leaning';
            notes.push('Control the lean');
        }

        let kneeLabel = 'athletic bend';
        if (metrics.kneeAngleDeg > 165) {
            kneeLabel = 'knees straight';
            notes.push('Bend knees');
        } else if (metrics.kneeAngleDeg < 120) {
            kneeLabel = 'very deep';
            notes.push('Rise slightly');
        }

        let baseLabel = 'stable base';
        if (metrics.stanceWidthPct < 6) {
            baseLabel = 'narrow base';
            notes.push('Widen base');
        } else if (metrics.stanceWidthPct > 24) {
            baseLabel = 'wide base';
            notes.push('Narrow base');
        }

        return {
            message: notes.length ? notes.join(' + ') : 'Good athletic position',
            leanLabel,
            kneeLabel,
            baseLabel
        };
    }

    async saveTrackingSample(metrics, feedback) {
        if (!this.sessionId) return;

        const sample = {
            sessionId: this.sessionId,
            sessionCode: this.sessionCode,
            metrics,
            feedback,
            source: 'side-tracker',
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(collection(this.db, 'sessions', this.sessionId, 'trackingSamples'), sample);
            await setDoc(doc(this.db, 'sessions', this.sessionId), {
                latestTrackingFeedback: {
                    metrics,
                    feedback,
                    source: 'side-tracker',
                    updatedAt: serverTimestamp()
                }
            }, { merge: true });
        } catch (error) {
            console.warn('Tracking sample save failed:', error);
            this.setStatus('Tracking locally, but Firestore save failed.');
        }
    }

    stopTracking() {
        this.isTracking = false;
        this.elements.stopTrackingBtn.disabled = true;
        this.elements.startTrackingBtn.disabled = !this.sessionId;
        this.elements.trackerPlaceholder.style.display = 'flex';

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
