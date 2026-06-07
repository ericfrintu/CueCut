# CueCut - Soccer Reaction HUD for Meta Ray-Ban Display

A real-time soccer reaction training web app optimized for Meta Ray-Ban Display glasses. CueCut displays randomized soccer-specific audio/visual cues, tracks reaction time and movement time, and provides immediate feedback to help athletes improve auditory-motor coupling and first-step quickness.

## Project Overview

CueCut is a Stanford final project designed to explore auditory-motor coupling in soccer athletes. The app displays regulated 4 Direction Drill cues (FRONT, BACK, LEFT, RIGHT) with configurable audio feedback and immediate performance metrics. Athletes react from a center start toward 15m targets, and the app logs reaction time and session history for training analysis.

### Core Features

- **Real-Time Cue Display**: Large, high-contrast text optimized for wearable AR display
- **Audio-Visual Feedback**: Tone-based cue sounds with spoken timing feedback
- **Timing Measurement**: Manual or motion-sensor-based reaction/movement time tracking
- **Session Tracking**: Automatic data logging with localStorage persistence
- **CSV Export**: Export all rep data for analysis in spreadsheet tools
- **Performance Visualization**: Simple reaction time graphs showing progress across reps
- **Score Tracking**: PR callouts, best/latest cue scores, and fatigue readouts
- **D-Pad Navigation**: Full keyboard/arrow key control for use on glasses
- **Motion Sensor Support**: Optional accelerometer/gyroscope integration (bonus feature)

## How It Works

### Typical Training Flow

1. **Home Screen**: Select "Start Session"
2. **Ready Screen**: Press Enter/Select to begin a rep
3. **Waiting Screen**: Random 1-3 second delay (keeps athlete ready)
4. **Cue Screen**: Large cue word appears with audio (e.g., "LEFT") – this is when timing starts
5. **Movement Screen**: Athlete sprints/cuts, then taps Reaction Finished
6. **Feedback Screen**: Displays reaction time and plays audio feedback
7. **Repeat** for next rep, or **End Session** to see summary

### Key Metrics Captured

Each rep saves:

- **Reaction Time**: Delay from cue display to first movement (milliseconds)
- **Movement Time**: Optional duration field for future motion-timing modes
- **Total Time**: Optional total timing field for future motion-timing modes
- **Timestamp**: ISO 8601 format for session tracking
- **Timing Mode**: Manual entry or motion detection

## ⚡ Quick Start (Local Testing)

### Option 1: Python (Easiest)

```bash
cd /Users/ericfrintu/music257final
python3 -m http.server 8000
```

Then open browser to: **http://localhost:8000**

### Option 2: Node.js

```bash
cd /Users/ericfrintu/music257final
npx http-server
```

Then open browser to: **http://localhost:8080** (or shown in terminal)

### That's it!

The app is now running locally. Use your **browser or keyboard** to test:
- **Mouse/Touch**: Click buttons directly
- **Arrow Keys**: Navigate between buttons (D-pad simulation)
- **Enter**: Select/activate focused button  
- **Escape**: Go back (in Settings/Data screens)

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Safari, Firefox, Edge)
- For testing on Meta Ray-Ban Display: Meta AI app installed on phone paired with glasses

### Installation (Local Development)

## App Controls

**Keyboard Navigation (D-Pad Simulation):**
- **Arrow Up/Down/Left/Right**: Navigate between buttons
- **Enter**: Select/activate focused button
- **Escape**: Go back (Settings/Data screens only)

**Mouse/Touch:**
- Click any button directly

---

## App Screens & Features

### Home Screen

- Display app title and tagline
- Navigation menu: Start Session, View Data, Settings
- Motion sensor status indicator
- Total rep counter

### Ready Screen

- Shows "READY" prompt
- Instruction: "Hold still"
- Button to start rep

### Waiting Screen

- Brief pause with animated dots
- Random delay between configured min/max (default 1.0–3.0 seconds)

### Cue Screen

- **Large, high-contrast cue text** (5rem font, green color, text-shadow glow)
- Tone playback for each cue:
  - FRONT: high-pitched beep
  - BACK: double descending beep
  - LEFT: left-panned beep
  - RIGHT: right-panned beep
- Reaction timer starts at this moment

### Movement Screen

- Current cue displayed
- One action button:
  - **Reaction Finished**: Record the reaction time and save the rep

### Feedback Screen

- Summary of rep data:
  - Cue performed
  - Reaction time (e.g., "0.32s")
  - Score note (new PR, tied PR, or delta from best)
- Audio feedback with the reaction time
- Buttons: Next Rep, End Session

### Session Summary Screen

- **Reps Completed**: Total number of reps in session
- **Average Reaction Time**: Mean reaction time
- **Best Reaction Time**: Fastest reaction
- **Fatigue**: Last reps compared with early-session reps
- **Reaction Time Graph**: Visual chart of last ~20 reps (simple bar chart)
- Buttons: Export CSV, Home

### Settings Screen

- **Audio Toggle**: On/Off
- **Timing Mode**: Manual or Motion Detection
- **Speech Rate**: Slow (0.8x), Normal (1.0x), Fast (1.3x)
- **Session Goal**: Open, 5, 10, or 20 reps before auto-summary
- **Random Delay Range**: Min and max delay in seconds (default 1.0–3.0s)
- **Cue Selection**: Checkboxes to enable/disable specific cues
- **Reset All Data**: Clears all stored reps and settings

### Data View Screen

- Lists 10 most recent reps
- Shows cue and reaction time for each rep
- Export button for CSV download

## Configuration

### Local Storage

All app state is stored in browser `localStorage`:

- **`cuecut_reps`**: Array of all rep data objects
- **`cuecut_settings`**: App settings (audio, timing mode, speech rate, delays, enabled cues)

### Firestore Sync

When Firebase is available, completed reps are also mirrored to Firestore:

- **`sessions/{sessionId}`**: Session metadata, including the short session code shown on the Ready screen
- **`sessions/{sessionId}/reps/{repId}`**: Individual rep timing data for that session
- **`sessions/{sessionId}/reps/{repId}/trackingSamples/{sampleId}`**: Side-device pose samples captured only while that rep is active
- **`sessionCodes/{code}`**: Fast lookup record that lets the side tracker connect from the 4-digit code
- **`sessions/{sessionId}.activeRep`**: Live rep window used to start/stop side-device recording
- **`sessions/{sessionId}.sessionSettings`**: Phone-controlled settings for the current session only

The dashboard still reads from local storage first, so the app stays usable if the network or Firebase is unavailable.

### Side Tracker

Open `/tracker.html` on a phone or laptop placed to the athlete's side. Enter the 4-digit session code shown on the glasses app, start the camera, choose the run view/angle, and the tracker will save body-position samples only during active reps.

Session settings are adjusted from the tracker page and apply to that connected session only.

For front-camera LEFT/RIGHT cut views, the tracker estimates plant-knee stack, plant-leg bend, stance width, and chest-over-hips alignment. A single front angle cannot fully measure depth or hip rotation, so those cues are treated as coaching estimates rather than exact biomechanics.

The tracker keeps the setup simple by showing where to place the phone and what the camera is reading for the selected view. Coach feedback is kept short so visual and audio feedback can support the athlete without taking attention away from the drill.

The tracker shows a simple Connect / Camera / Cue readiness strip. It records pose samples only during the active rep window, ignores low-confidence pose samples for saved coach feedback, and sends one summarized coach cue after the rep ends.

The tracker uses browser camera access and MediaPipe Pose Landmarker, so it must run on HTTPS or localhost.

Recommended Firestore access should be limited to the app data paths used here: `sessions/{sessionId}`, `sessionCodes/{code}`, `sessions/{sessionId}/reps/{repId}`, and `sessions/{sessionId}/reps/{repId}/trackingSamples/{sampleId}`.

### Default Settings

```javascript
{
    audioEnabled: true,
    timingMode: 'manual',
    speechRate: 1.0,
    delayMin: 1.0,
    delayMax: 3.0,
    enabledCues: ['FRONT', 'BACK', 'LEFT', 'RIGHT'],
    drillType: '4_direction',
    drillFieldRadiusMeters: 15,
    cameraDistanceMeters: '',
    cameraMode: 'auto',
    motionDetectionEnabled: false
}
```

### Customization

Edit `app.js` to adjust:

- **Cue bank**: Modify `CUE_BANK` constant (line ~18)
- **Motion threshold**: Adjust `accelThreshold` in `MotionDetector` class
- **Max-width for display**: Edit `max-width: 600px` in `styles.css`
- **Colors/fonts**: Modify CSS in `styles.css`

## Data Export & Analysis

### CSV Format

Reps are exported with the following columns:

```
rep_id,timestamp,cue,cue_start_ms,first_movement_ms,finish_ms,reaction_ms,movement_ms,total_ms,timing_mode,motion_start_ms,notes
```

Example row:
```
rep_1234567890_abc123,2024-03-15T14:30:22.123Z,LEFT,1000,1320,,320,,,manual,,
```

### Opening in Spreadsheet

1. In app, click **Export CSV** on Summary or Data View screen
2. Save the `.csv` file
3. Open in Excel, Google Sheets, or other spreadsheet tool
4. Analyze trends:
   - Sort by reaction time (ascending) to identify PRs
   - Filter by cue type to see if certain movements are faster
   - Plot reaction time across session (X-axis: rep number, Y-axis: reaction time)

## Deployment

**See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.**

### Quick Deploy Options:

1. **Vercel** (Recommended): https://vercel.com/new → Drag & drop folder
2. **Netlify**: https://app.netlify.com → Drag & drop folder  
3. **GitHub Pages**: Push to GitHub → Enable Pages in Settings

All three provide free HTTPS hosting.

### Example Deployed URL

After deployment, you'll have a public URL like:
- `https://cuecut.vercel.app`
- `https://cuecut-demo.netlify.app`
- `https://username.github.io/music257final`

Paste this URL into your Meta AI app to add the web app to your glasses.

---

## Adding to Meta Ray-Ban Display

Once deployed to a public HTTPS URL:

1. **On your phone**, open the **Meta AI app**
2. Navigate to **Wearables** or **Ray-Ban Device** section
3. Look for **Web App** or **Browser** option
4. Paste your app URL (e.g., `https://cuecut.vercel.app`)
5. On glasses, navigate to the web app from the app menu
6. Use **D-Pad** (arrow keys) to navigate and **Select** to activate

## Motion Sensor Support (Beta)

The app includes optional accelerometer/gyroscope support for automatic first-movement detection.

### How It Works

- When a cue appears, motion listening begins
- Acceleration above ~25 m/s² triggers "first movement" marking
- Manual timing remains the fallback if motion is unavailable

### Requirements

- iOS 13+ or Android 10+ device with motion sensors
- HTTPS connection (required by browser permissions API)
- User grants **Motion & Orientation** permission when prompted

### Testing

1. In Settings, select **Timing Mode: Motion Detection**
2. Start a rep
3. Browser will request permission → Grant it
4. When you accelerate, first movement time is auto-recorded
5. Check movement screen to see times populated

### Limitations

- Motion detection works best with large, sudden movements (like sprints)
- Filtering and thresholds are basic; requires tuning for specific use cases
- May trigger false positives if athlete fidgets

---

## Research Framing

### Hypothesis

**Repeated training with Meta Ray-Ban Display soccer-specific audio/visual cues and immediate feedback will improve auditory-motor coupling, reducing reaction time and increasing consistency in soccer-specific first-step and cutting tasks.**

### Rationale

Auditory-motor coupling—the coordination between auditory processing and motor response—is critical in dynamic sports like soccer. Athletes must react to changing field conditions, teammate calls, and referee whistles with minimal latency. Traditional coaching emphasizes visual training; however, integrating synchronized audio-visual feedback may accelerate motor learning via multisensory integration.

Wearable AR displays offer a unique testing platform: they keep visual feedback in the athlete's peripheral vision (not disrupting field view), deliver audio without removing hearing from the environment, and provide real-time performance metrics directly in the glasses.

### Key Metrics

1. **Cue-to-First-Movement Reaction Time** (milliseconds)
   - Measures central processing speed and motor initiation
   - Target: Reduction of 5–15% after 4–8 weeks of training

2. **Movement Time** (milliseconds)
   - Execution speed of the actual directional cut or press
   - Target: Consistency (low variance)

3. **Total Rep Time** (milliseconds)
   - Sum of reaction + movement; overall performance metric

4. **Consistency** (standard deviation of reaction times)
   - Variability across reps within a session or across sessions
   - Lower = more consistent, better training adaptation

6. **Before/After Improvement**
   - Compare session 1 vs. session 8 reaction times
   - Expected: 10–20% improvement in mean reaction time

### Relevant Neural Systems

| System | Role in Auditory-Motor Coupling |
|--------|----------------------------------|
| **Auditory Cortex** (superior temporal gyrus, Heschl's gyrus) | Processes speech and acoustic features of cue |
| **Visual Cortex** (V1, V5/MT) | Processes display text and visual cue |
| **Premotor Cortex** (BA 6) | Prepares motor program based on cue |
| **Primary Motor Cortex** (M1) | Executes the movement command |
| **Cerebellum** | Coordinates timing, predicts sensory consequences, refines motor timing |
| **Basal Ganglia** (striatum, substantia nigra) | Selects motor program (via direct vs. indirect pathways), reward-based learning |
| **Sensorimotor Integration Networks** (parietal cortex, SMA) | Cross-modal sensory binding and movement planning |
| **Anterior Cingulate Cortex** (ACC) | Error monitoring and performance feedback processing |

**Key Circuit**: Auditory input (auditory cortex) → multimodal association areas → premotor/motor cortex → movement. **Immediate feedback** (rep data) engages reward circuits (ventral striatum) and error-monitoring circuits (ACC), accelerating motor learning.

### Expected Learning Curve

- **Week 1**: Baseline (high variability, reaction time ~400–600 ms)
- **Week 2–3**: Practice effect begins (reaction time decreases to ~350–500 ms, variance drops)
- **Week 4–6**: Motor learning plateau (reaction time stabilizes ~300–400 ms, consistency high)
- **Week 7–8**: Performance ceiling, focus shifts to maintaining consistency

### Postulated Mechanisms

1. **Multisensory Integration**: Audio + visual cues engage multiple cortical regions simultaneously, accelerating cross-modal binding
2. **Rapid Feedback Loop**: Immediate timing feedback (within 1–2 seconds) supports fast adjustment between reps
3. **Expectancy & Attention**: Repeated cues create predictive motor programs, reducing central processing latency
4. **Neuroplasticity**: Consistent, rewarded practice drives synaptic consolidation in motor and cerebellar circuits

### Limitations & Future Directions

- **MVP Version**: Manual timing, no computer vision confirmation of movement
- **Limited Generalization**: Lab-based reactions may not transfer 1:1 to live game scenarios
- **No Confounds Controlled**: Athlete sleep, caffeine intake, motivation not measured
- **Small Sample**: First version for individual athlete testing, not group statistics

### Future Upgrades

1. **External Camera Timing**: Use phone or external camera to detect first movement (pixel frame analysis)
2. **Advanced IMU Filtering**: Improved accelerometer/gyroscope calibration and low-pass filtering
3. **Glasses Camera Integration**: Use glasses camera to detect athlete movement directly
4. **Pre/Post Video Analysis**: Correlate reaction time improvements with video-recorded cutting mechanics
5. **Multiplayer/Competitive**: Track multiple athletes, leaderboard, social motivation
6. **Advanced Visualization**: Reaction time trends, fatigue detection, and cue-specific leaderboards
7. **Machine Learning**: Automated movement classification (sprint vs. cut) from motion sensors
8. **Native SDK Integration**: Use Meta's Device Access Toolkit for lower-latency sensor access

---

## Architecture

### File Structure

```
music257final/
├── index.html      # Main HTML (all screens, DOM structure)
├── styles.css      # Styling (600x600 optimized, HUD theme)
├── app.js          # App logic (state management, timing, data)
├── tracker.html    # Side-device pose tracking page
├── tracker.js      # Camera, pose metrics, and Firestore tracking sync
└── README.md       # This file
```

### Key Classes (app.js)

- **`RepData`**: Data model for a single rep (cue, timings, metadata)
- **`Settings`**: Manages app configuration via localStorage
- **`MotionDetector`**: Handles motion sensor permissions and accelerometer events
- **`AudioFeedback`**: Uses Web Audio cue tones and Web Speech timing feedback
- **`DataStorage`**: Manages localStorage for reps, stats calculations, CSV export
- **`CloudStorage`**: Mirrors session and rep data to Firestore when Firebase is loaded
- **`CueCutApp`**: Main controller; orchestrates UI, navigation, and rep flow

### State Management

- **Current Screen**: `app.currentScreen` tracks active view
- **Current Rep**: `app.currentRepData` holds in-progress rep object
- **Settings**: Persisted in `localStorage['cuecut_settings']`
- **All Reps**: Persisted in `localStorage['cuecut_reps']`
- **Cloud Reps**: Mirrored to Firestore under `sessions/{sessionId}/reps`

### Event Loop

1. User action (button click, keyboard) → event handler
2. Event handler updates `currentRepData` or calls navigation function
3. Navigation function calls `goToScreen()` to show new view
4. New screen may initialize timers, start sensors, or update UI displays
5. Rinse and repeat

---

## Troubleshooting

### App doesn't load

- Verify all three files (`index.html`, `styles.css`, `app.js`) are in the same directory
- Check browser console (F12) for JavaScript errors
- Ensure you're accessing via `http://localhost:8000`, not `file://`

### Motion sensor not working

- Motion requires **HTTPS** or **localhost**
- Some browsers require explicit user permission (granted on first use)
- Check Settings → **Timing Mode** is set to **Motion Detection**
- Test on a real phone, not browser emulator (emulator motion is limited)

### Audio not playing

- Check Settings → **Audio** is toggled **On**
- Verify browser speakers/headphones work
- Some browsers require a user interaction before generated audio can play; start a rep and refresh if needed
- Speech synthesis may not be available in some languages/locales

### Data not saving

- Check browser's localStorage quota (may be full)
- Ensure cookies/local storage isn't disabled in privacy settings
- Use browser DevTools → Application → Local Storage to inspect `cuecut_reps`

### Layout broken on glasses

- Verify viewport is 600x600 px; test in browser DevTools with device emulation
- Check that no CSS is overridden by device-specific rules
- Glasses may have lower pixel density; use large fonts (done) and high contrast (done)

---

## Testing Checklist

- [ ] Start session → Ready screen appears
- [ ] Press Enter/Select → Waiting screen, then cue screen
- [ ] Cue displays large, audio plays
- [ ] Arrow keys navigate buttons, Enter selects
- [ ] Reaction Finished → rep saves and feedback shows reaction time
- [ ] Feedback shows PR/delta score note
- [ ] Session goal auto-ends at selected rep count
- [ ] Summary shows averages and chart
- [ ] Summary fatigue readout appears after enough reps
- [ ] Export CSV → file downloads with timing data
- [ ] Settings toggle on/off → changes persist after refresh
- [ ] Reset All Data → clears stored reps and resets settings
- [ ] Motion Detection mode (if on device) → auto-populates first movement
- [ ] View Data → shows recent reps
- [ ] Navigate back via Escape/Backspace

---

## License

This project is part of a Stanford final project and is provided as-is for educational and research purposes.

## Contact & Support

For questions or feedback, contact the CueCut development team through Stanford course channels.

---

## Appendix: CSV to Spreadsheet Analysis Examples

### Example 1: Find Your Personal Record (PR)

In Google Sheets:
```
=MINIFS(C:C, A:A, "reaction_ms")
```
Returns your fastest reaction time.

### Example 2: Reaction Time Trend

- **X-axis**: Rep number (timestamp ordered)
- **Y-axis**: Reaction time (ms)
- Create a line chart to visualize learning curve

### Example 4: Session-to-Session Progress

If exporting multiple sessions, add a "session_id" column, then:
```
=AVERAGEIF(session_id, 1, reaction_ms)  # Session 1 average
=AVERAGEIF(session_id, 2, reaction_ms)  # Session 2 average
```
Compare to track improvement.

---

**Last Updated**: March 2024 | CueCut v1.0
