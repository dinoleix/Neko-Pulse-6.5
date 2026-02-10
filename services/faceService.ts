
import * as faceapi from 'face-api.js';

// Using a reliable CDN for models. 
// Note: We use the 'tiny' models for better mobile performance.
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

let isModelLoaded = false;
let isLoading = false;

export const loadFaceModels = async () => {
    if (isModelLoaded) return;
    if (isLoading) {
        // Wait for other process to finish loading
        while(isLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return;
    }

    try {
        isLoading = true;
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        isModelLoaded = true;
        console.log("Face API Models Loaded");
    } catch (error) {
        console.error("Failed to load face models", error);
        throw error;
    } finally {
        isLoading = false;
    }
};

export const detectSingleFace = async (video: HTMLVideoElement) => {
    // Ensure models are loaded
    if (!isModelLoaded) await loadFaceModels();

    // CRITICAL: Check if video is ready and has dimensions
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return null;
    }

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    
    try {
        // Detect single face with landmarks and descriptor
        const detection = await faceapi.detectSingleFace(video, options)
            .withFaceLandmarks()
            .withFaceDescriptor();
        
        return detection;
    } catch (e) {
        // Suppress errors during stream interruptions/resizes
        return null;
    }
};

// Create a FaceMatcher from database records
export const createFaceMatcher = (labeledDescriptors: { label: string, descriptor: number[] }[]) => {
    if (labeledDescriptors.length === 0) return null;

    const labeled = labeledDescriptors.map(ld => {
        // Convert plain array back to Float32Array
        const descriptor = new Float32Array(ld.descriptor);
        return new faceapi.LabeledFaceDescriptors(ld.label, [descriptor]);
    });

    // Distance threshold: Lower is stricter. 0.6 is default. 
    return new faceapi.FaceMatcher(labeled, 0.5);
};
