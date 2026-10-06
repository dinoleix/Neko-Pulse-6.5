import React from 'react';

interface BrandMarkProps {
  className?: string;
  variant?: 'default' | 'black';
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className = '', variant = 'default' }) => (
  <img
    src={variant === 'black' ? '/nekotech-logo-black.png' : '/nekotech-logo.png'}
    alt=""
    aria-hidden="true"
    className={['nekotech-mark', variant === 'black' ? 'nekotech-mark-black' : '', 'shrink-0', className].filter(Boolean).join(' ')}
  />
);
