import { auth, storage } from '../firebaseConfig';

// Firebase download-token URLs bypass Storage Rules. New records store a
// Storage path instead; this retrieves it with the caller's Firebase ID token
// and returns an authorised playback URL for training videos.
export const isLegacyDownloadUrl = (value?: string) => /^https?:\/\//i.test(value || '');

export const getProtectedFileUrl = async (storagePath?: string): Promise<string> => {
  if (!storagePath) return '';
  if (isLegacyDownloadUrl(storagePath)) return storagePath;

  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to view this file.');
  }
  if (storagePath.startsWith('training/')) {
    // Vite does not run Vercel API routes locally. Avoid sending a video-path
    // query to the SPA dev server, which treats the .mp4 suffix as a module.
    if (import.meta.env.DEV) return storage.ref(storagePath).getDownloadURL();
    const token = await user.getIdToken();
    // A unique request also bypasses older installed service workers that
    // cached signed links before the no-API-cache policy was introduced.
    const response = await fetch(`/api/training-video?format=url&path=${encodeURIComponent(storagePath)}&request=${crypto.randomUUID()}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Could not load protected file (${response.status}).`);
    const { url } = await response.json();
    if (!url) throw new Error('Could not create a secure video link.');
    return url;
  }
  // Let the Firebase SDK make the authorised Storage request. Hand-rolled
  // REST headers were rejected by Storage even for valid signed-in users.
  return storage.ref(storagePath).getDownloadURL();
};
