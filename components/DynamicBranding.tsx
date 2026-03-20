
import React, { useEffect } from 'react';
import { db } from '../firebaseConfig';

export const DynamicBranding: React.FC = () => {
  useEffect(() => {
    const updateIcons = async () => {
      try {
        // 1. Fetch the logo from settings
        const doc = await db.collection('settings').doc('companyLogo').get();
        const logoUrl = doc.exists ? doc.data()?.url : null;

        if (logoUrl) {
          // 2. Update Apple Touch Icon (iOS)
          const appleIcon = document.getElementById('apple-icon') as HTMLLinkElement;
          if (appleIcon) {
            appleIcon.href = logoUrl;
          }

          // 3. Update Favicon (Browser Tab)
          const favicon = document.getElementById('favicon') as HTMLLinkElement;
          if (favicon) {
            favicon.href = logoUrl;
          }

          // 4. Update Manifest (Android/PWA)
          const manifestLink = document.getElementById('app-manifest') as HTMLLinkElement;
          if (manifestLink) {
            // We fetch the original manifest structure
            const response = await fetch('/manifest.json');
            const originalManifest = await response.json();

            // We create a new manifest object replacing the icons
            const newManifest = {
              ...originalManifest,
              icons: [
                  {
                    src: logoUrl,
                    sizes: "192x192",
                    type: "image/png",
                    purpose: "any maskable"
                  },
                  {
                    src: logoUrl,
                    sizes: "512x512",
                    type: "image/png",
                    purpose: "any maskable"
                  }
              ]
            };

            // Convert to Blob and set as the new href
            const stringManifest = JSON.stringify(newManifest);
            const blob = new Blob([stringManifest], { type: 'application/json' });
            const manifestURL = URL.createObjectURL(blob);
            
            manifestLink.href = manifestURL;
          }
        }
      } catch (error) {
        console.error("Failed to load dynamic branding:", error);
      }
    };

    updateIcons();
  }, []);

  return null; // This component doesn't render anything visible
};
