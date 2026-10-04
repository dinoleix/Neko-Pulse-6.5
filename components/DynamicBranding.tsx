
import React, { useEffect } from 'react';

/**
 * Keep the app and installed PWA branded as NekoTech/Neko Pulse.
 * Tenant company logos remain available for HR letterheads, but must not
 * replace the product's browser or home-screen icon.
 */
export const DynamicBranding: React.FC = () => {
  useEffect(() => {
    const productLogo = '/nekotech-logo.png';
    const productFavicon = '/nekotech-favicon.svg';
    const appleIcon = document.getElementById('apple-icon') as HTMLLinkElement | null;
    const favicon = document.getElementById('favicon') as HTMLLinkElement | null;
    const manifest = document.getElementById('app-manifest') as HTMLLinkElement | null;

    if (appleIcon) appleIcon.href = productLogo;
    if (favicon) favicon.href = productFavicon;
    if (manifest) manifest.href = '/manifest.json';
  }, []);

  return null;
};
