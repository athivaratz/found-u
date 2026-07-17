import Image from "next/image";
import Link from "next/link";
import {
  focusRing,
  proseWidth,
  shell,
} from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

type PublicFooterProps = {
  className?: string;
  showHelpLinks?: boolean;
};

export function PublicFooter({
  className,
  showHelpLinks = true,
}: PublicFooterProps) {
  return (
    <footer
      className={cn("border-t border-border-light bg-bg-secondary safe-bottom", className)}
    >
      {showHelpLinks && (
        <div className="border-b border-border-light py-6">
          <div
            className={cn(
              shell,
              "flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm"
            )}
          >
            <Link
              href="/help/how-to-use"
              className={cn(
                "rounded font-medium text-line-green-link hover:text-line-green-link-hover hover:underline",
                focusRing,
                "focus-visible:ring-offset-bg-secondary"
              )}
            >
              วิธีใช้งาน
            </Link>
            <Link
              href="/help/new-school"
              className={cn(
                "rounded font-medium text-line-green-link hover:text-line-green-link-hover hover:underline",
                focusRing,
                "focus-visible:ring-offset-bg-secondary"
              )}
            >
              นำไปใช้ในโรงเรียนของคุณ
            </Link>
          </div>
        </div>
      )}

      <div className="border-b border-border-light py-8 md:py-10">
        <div
          className={cn(
            shell,
            "flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between"
          )}
        >
          <div className="flex shrink-0 items-center justify-center gap-5 sm:gap-8">
            <a
              href="https://nrct.go.th"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="สำนักงานการวิจัยแห่งชาติ (NRCT) — เปิดในแท็บใหม่"
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 transition-opacity hover:opacity-80",
                focusRing,
                "focus-visible:ring-offset-bg-secondary"
              )}
            >
              <Image
                src="/img/logo/nrct.png"
                alt=""
                width={120}
                height={120}
                loading="lazy"
                className="h-16 w-auto object-contain sm:h-20"
              />
            </a>
            <a
              href="https://www.nstda.or.th"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="สำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ (NSTDA) — เปิดในแท็บใหม่"
              className={cn(
                "flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 transition-opacity hover:opacity-80",
                focusRing,
                "focus-visible:ring-offset-bg-secondary"
              )}
            >
              <Image
                src="/img/logo/nstda.png"
                alt=""
                width={160}
                height={80}
                loading="lazy"
                className="h-12 w-auto object-contain sm:h-14"
              />
            </a>
          </div>
          <div
            className={cn(
              proseWidth,
              "text-center text-sm leading-relaxed text-text-secondary md:text-right"
            )}
          >
            <p className="text-pretty">
              โครงการ Found-U : ระบบแจ้งของหาย-ของเจอสำหรับโรงเรียนด้วยปัญญาประดิษฐ์
              และเทคโนโลยี NFC ได้รับทุนอุดหนุนการทำกิจกรรมส่งเสริมและสนับสนุนการวิจัยและนวัตกรรมจากสำนักงานการวิจัยแห่งชาติ
              และสำนักงานพัฒนาวิทยาศาสตร์และเทคโนโลยีแห่งชาติ
            </p>
            <p className="mt-3 text-pretty text-xs leading-relaxed text-text-secondary italic">
              This research and innovation activity is funded by National Research Council of
              Thailand (NRCT) and National Science and Technology Development Agency (NSTDA)
            </p>
          </div>
        </div>
      </div>

      <div className="py-8">
        <div
          className={cn(
            shell,
            "flex flex-col items-center gap-3 text-center text-sm text-text-secondary"
          )}
        >
          <Image
            src="/logo.png"
            alt=""
            width={32}
            height={32}
            loading="lazy"
            className="h-8 w-8 opacity-80"
            aria-hidden
          />
          <p className="text-pretty">
            foundu.forum — ระบบแจ้งของหายและของเจอสำหรับโรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) ๒ โดย{" "}
            <a
              href="https://www.instagram.com/foundu.forum"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="foundu.forum บน Instagram — เปิดในแท็บใหม่"
              className={cn(
                "rounded font-medium text-line-green-link hover:text-line-green-link-hover hover:underline",
                focusRing,
                "focus-visible:ring-offset-bg-secondary"
              )}
            >
              foundu.forum
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
