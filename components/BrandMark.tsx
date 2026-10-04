import React from 'react';

interface BrandMarkProps {
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className = '' }) => (
  <img
    src="/nekotech-logo.png"
    alt=""
    aria-hidden="true"
    className={['nekotech-mark', 'shrink-0', className].filter(Boolean).join(' ')}
  />
);
