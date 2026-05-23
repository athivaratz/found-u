"use client";

import type { User } from "firebase/auth";
import type { AppUser } from "@/lib/types";
import { getProfilePhotoUrl, getUserInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";
import { User as UserIcon } from "lucide-react";

interface UserAvatarProps {
  user: User | null | undefined;
  appUser?: AppUser | null;
  className?: string;
  iconClassName?: string;
  fallbackClassName?: string;
}

export function UserAvatar({
  user,
  appUser,
  className = "w-10 h-10 rounded-full object-cover",
  iconClassName = "w-5 h-5",
  fallbackClassName,
}: UserAvatarProps) {
  const photoUrl = getProfilePhotoUrl(appUser, user);

  if (photoUrl) {
    return <img src={photoUrl} alt="" className={className} />;
  }

  const initials = getUserInitials(appUser, user);

  return (
    <div
      className={cn(
        className,
        "flex items-center justify-center bg-line-green/20 text-line-green font-semibold text-sm",
        fallbackClassName
      )}
    >
      {initials.length <= 2 ? (
        initials
      ) : (
        <UserIcon className={iconClassName} />
      )}
    </div>
  );
}
