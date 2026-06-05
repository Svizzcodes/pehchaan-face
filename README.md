# PEHCHAAN: Offline Biometric Face Verification Engine

Pehchaan is an enterprise-grade, offline-first facial authentication and active liveness verification system specifically engineered for the National Highways Authority of India (NHAI). The system operates entirely on-device, executing high-performance deep learning models and cryptographic verification routines directly on standard mid-range mobile processors without requiring an active cellular connection or cloud-based API integrations.

---

## 1. System Architecture & Pipeline Flow

The authentication pipeline executes in a sequential, non-blocking flow designed to maximize biometric accuracy while maintaining a processing latency of under 150ms:

```
[Camera Frame] ➔ [manipulateAsync: 640x640] ➔ [decodeJpegBase64ToRGBA] 
                    │
                    ▼
          [Face landmark Warp Alignment]
                    │
                    ▼
         [preprocessFacePixels (112x112)]
                    │
                    ▼
     [MobileFaceNet TFLite Inference] ➔ [192-dim Vector] ➔ [l2Normalize]
                                                               │
                                                               ▼
                                                    [Cosine Match vs SQLite]
```

### Step 1: Camera Capture & Image Processing
* **Vision Camera Frame Capture:** The front camera captures a high-resolution frame.
* **Aspect Resizing:** `expo-image-manipulator` scales the captured image to a uniform $640 \times 640$ pixels, reducing buffer load.
* **RGBA Byte Decoding:** The base64 JPEG stream is decoded into a raw RGBA byte buffer using a canvas-free JS decoder (`jpeg-js`).

### Step 2: Affine Similarity Transformation & Face Alignment
To normalize variations in head tilt, translation, and scale, the engine applies an affine similarity transform based on five facial landmarks (Left Eye, Right Eye, Nose, Left Mouth, Right Mouth):
* The system computes the scale factor $s$ and rotation angle $\theta$ from the eye coordinates:
  $$\theta = \text{atan2}(dy, dx)$$
  $$s = \frac{\text{canonicalEyeDistance}}{\text{capturedEyeDistance}}$$
* It maps pixels from the source coordinate system back to a canonical $112 \times 112$ destination grid using inverse mapping with nearest-neighbor interpolation, ensuring the eyes, nose, and mouth align with strict pixel boundaries.

### Step 3: Local Model Inference
* **Normalization:** Aligned pixels are normalized from $[0, 255]$ to the range $[-1.0, 1.0]$.
* **TFLite CPU Forward Pass:** The $112 \times 112 \times 3$ float32 tensor is loaded into the native TensorFlow Lite interpreter via `react-native-fast-tflite`. On actual hardware, C++ bindings run the `mobilefacenet.tflite` (5.2 MB) model on the CPU registers in 50ms – 150ms.
* **Output Embedding:** The model outputs a 192-dimensional floating-point vector. This vector is L2-normalized:
  $$\vec{e}_{\text{normalized}} = \frac{\vec{e}}{\|\vec{e}\|_2}$$

### Step 4: Verification & Cosine Matching
The query embedding is compared against all locally enrolled personnel using **Cosine Similarity**:
$$\text{Similarity}(\vec{A}, \vec{B}) = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\|_2 \|\vec{B}\|_2}$$
* **Thresholding:** If the cosine similarity exceeds $0.65$, it is registered as a match.
* **Confidence Calibration:** The raw score is calibrated into a user-friendly percentage:
  * Similarity above threshold is mapped linearly to $[75\%, 100\%]$.
  * Similarity below threshold is mapped to $[0\%, 75\%)$.

---

## 2. Active Liveness Detection Engine

To prevent presentation attacks (e.g., holding a paper photo, playing a video on another screen, or 3D masks), Pehchaan implements a challenge-response state machine driven by three separate detectors:

1. **Blink Detection (`BlinkDetector`):**
   * Computes the average eye opening probability.
   * A valid blink is registered only when the probability drops below $0.3$ (eyes closed) and then rises above $0.7$ (eyes open) within a rolling frame window.
2. **Head Turn Detection (`HeadTurnDetector`):**
   * Sets a baseline yaw angle when the face is centered.
   * Tracks left turns (yaw drops below $-20^\circ$) and right turns (yaw exceeds $+20^\circ$) relative to the baseline.
3. **Smile Verification (`SmileDetector`):**
   * Evaluates the smiling probability index.
   * Compares the target mouth stretching ratio against a threshold of $0.75$.

---

## 3. Geolocation & Database Sync Architecture

The application is engineered to operate in zero-network environments indefinitely, utilizing a dual-table local SQLite caching pattern and local cryptographic signing:

### Non-Blocking GPS Capture
To prevent GPS hardware locking from adding latency to the biometric authentication screen:
* The app initiates background location prefetching using `Location.Accuracy.High` immediately when the screen mounts.
* On successful face matching, the app pulls the coordinates from the active location memory cache instantly (taking $0\text{ms}$ blocking time).

### SQLite Caching & Storage Cleanup
Local storage is managed via two tables:
1. **`attendance_records`:** Stores detailed logs, including names, timestamps, confidence scores, and raw location coordinates.
2. **`unique_attendance_days`:** Stores compact primary key pairs `(employee_id, date)` representing daily attendance presence.

* **S3 Synchronization:** When network access is available, the sync service batches all unsynced detailed records, uploads them to AWS S3, and marks them as synced.
* **Local Purge:** The app runs a cleanup query to purge rows from `attendance_records` that have been successfully synced, freeing local storage. The rows in `unique_attendance_days` are preserved, ensuring local statistics, streaks, and calendars remain fully functional offline without bloating the device.

### Web Crypto Signature V4 Sync
To keep the binary lightweight, Pehchaan does not import the bulky, Node-dependent `@aws-sdk/client-s3` package. Instead:
* The app performs direct HTTP PUT calls to S3.
* Upload payloads are signed locally using AWS Signature Version 4 calculations built on top of the native React Native Hermes Web Crypto API.

---

## 4. Setup & Installation

### Prerequisite Dependencies
Install the required packages using expo:
```bash
npx expo install react-native-vision-camera expo-sqlite expo-image-manipulator expo-location expo-linear-gradient react-native-reanimated
```
*Note: Make sure your target device uses iOS 12.0+ or Android 8.0+.*

### Model File Placement
1. Create the model directory: `assets/models/`.
2. Place your optimized `mobilefacenet.tflite` model in this directory.
3. (Optional) In simulator mode, the runner automatically detours TFLite execution to a deterministic sine-based projection mapping, allowing testing without native binaries.

### Environment Configuration
Create a `.env` file at the project root:
```env
EXPO_PUBLIC_AWS_REGION=ap-south-1
EXPO_PUBLIC_S3_BUCKET=pehchaan-attendance-data
EXPO_PUBLIC_AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY
EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY
```

---

## 5. NHAI Use Cases & Ecosystem Fit

* **Toll Booth Shift Verification:** Plaza concessionaires can swap shifts and log attendance in milliseconds, ensuring no lane queues build up.
* **Off-Grid Construction Sites:** Laborers working on remote highway stretches or tunnels can enroll and log attendance without network access.
* **Contractor Manpower Auditing:** Geolocated biometric timestamps prevent contractors from inflating manual daily logsheets, ensuring transparent labor auditing.

---

## 6. Contributors

* **Mahak Mehadia**
* **Parthiv Abhani**
* **Shlok Vij**
