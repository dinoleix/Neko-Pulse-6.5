import React, { useState } from 'react';
import { CurrentUser } from '../types';

export const ProfileAvatar = ({ user }: { user: CurrentUser }) => {
  const [failedUrl, setFailedUrl] = useState<string>();
  const initials = user.name?.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase() || '?';

  return (
    <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e6f0e9] text-2xl font-bold text-[#063b2c] ring-1 ring-[#d9d5cb]">
      {user.photoUrl && failedUrl !== user.photoUrl ? (
        <img src={user.photoUrl} alt="Your profile photo" className="h-full w-full object-cover"
          onError={() => setFailedUrl(user.photoUrl || undefined)} />
      ) : <span aria-hidden="true">{initials}</span>}
    </span>
  );
};
