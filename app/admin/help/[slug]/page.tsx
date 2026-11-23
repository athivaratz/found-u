"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { segmentAfter } from "@/lib/dynamic-segment";

export default function AdminHelpSlugRedirectPage() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const slug = segmentAfter(pathname, "/admin/help");
    router.replace(slug ? `/admin/blog/legacy/${slug}` : "/admin/blog?section=help");
  }, [pathname, router]);

  return null;
}
