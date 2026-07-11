"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Camera, Clock, Radio } from "lucide-react";
import { ComingSoonCta } from "@/components/landing/coming-soon-cta";
import { MobileHeroPhone } from "@/components/landing/mobile-hero-phone";
import { LandingHeroCardSwap } from "@/components/landing/landing-hero-card-swap";
import { LandingFeaturesCarouselLazy } from "@/components/landing/landing-features-carousel-lazy";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import {
  deferredSection,
  focusRing,
  heroHeadingClass,
  heroShell,
  primaryCtaClass,
  proseWidth,
  secondaryCtaClass,
  sectionBody,
  sectionHeadingClass,
  sectionIntro,
  sectionY,
  sectionYCta,
  sectionYHero,
  shell,
} from "@/components/landing/landing-tokens";
import type { PublicHeroImage } from "@/lib/landing-public-data";
import { cn } from "@/lib/utils";

const steps = [
  {
    num: "1",
    title: "แจ้งเข้าระบบ",
    text: "ของหายหรือของเจอ กรอกรายละเอียดกับจุดที่เกี่ยวข้อง ใช้เวลาไม่นาน",
  },
  {
    num: "2",
    title: "ระบบช่วยจับคู่",
    text: "เมื่อมีรายการที่เข้ากัน ทีมงานหรือระบบจะช่วยเชื่อมให้เจอ",
  },
  {
    num: "3",
    title: "ติดตามสถานะ",
    text: "ติดตามสถานะได้ตลอด ไม่ต้องสอบถามในแชทหลายครั้ง",
  },
];

const features = [
  {
    id: "lost",
    icon: Search,
    title: "แจ้งของหาย",
    text: "บันทึกชื่อ ประเภท สถานที่ และช่องทางติดต่อ มีรหัสให้ติดตามทันที",
    tint: "bg-bg-tertiary text-text-secondary",
    dotLabel: "ของหาย",
  },
  {
    id: "found",
    icon: Camera,
    title: "แจ้งเจอของ",
    text: "ถ่ายรูปหรือกรอกรายละเอียด แล้วบอกว่าฝากไว้ที่ไหนในโรงเรียน",
    tint: "bg-bg-tertiary text-text-secondary",
    dotLabel: "ของเจอ",
  },
  {
    id: "track",
    icon: Clock,
    title: "ติดตามสถานะ",
    text: "พิมพ์รหัสติดตามแล้วรู้เลยว่าอยู่ขั้นตอนไหน",
    tint: "bg-bg-tertiary text-text-secondary",
    dotLabel: "ติดตาม",
  },
  {
    id: "nfc",
    icon: Radio,
    title: "แท็ก NFC",
    text: "ติดแท็กกับของสำคัญ คนพบสแกนแล้วแจ้งถึงคุณได้เร็วขึ้น",
    tint: "bg-bg-tertiary text-text-secondary",
    dotLabel: "NFC",
  },
];

const FALLBACK_HERO_IMAGE: PublicHeroImage = {
  fileName: "logo.png",
  label: "foundu.forum",
  url: "/logo.png",
  width: 1024,
  height: 1024,
};

export type LandingPageClientProps = {
  comingSoon: boolean;
  comingSoonMessage: string;
  heroImages: PublicHeroImage[];
  mobileHeroImages: PublicHeroImage[];
};

export function LandingPageClient({
  comingSoon,
  comingSoonMessage,
  heroImages,
  mobileHeroImages,
}: LandingPageClientProps) {
  const cardImages = useMemo(
    () => (heroImages.length > 0 ? heroImages : [FALLBACK_HERO_IMAGE]),
    [heroImages]
  );

  const mobileCardImages = useMemo(() => {
    if (mobileHeroImages.length > 0) return mobileHeroImages;
    if (heroImages.length > 0) return heroImages;
    return [FALLBACK_HERO_IMAGE];
  }, [heroImages, mobileHeroImages]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg-secondary text-text-primary">
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:z-[100]",
          "focus:left-[max(1rem,env(safe-area-inset-left,0px))] focus:top-[max(1rem,env(safe-area-inset-top,0px))]",
          "rounded-full bg-line-green-cta px-4 py-2 text-sm font-semibold text-white",
          focusRing,
          "focus-visible:ring-offset-bg-primary"
        )}
      >
        ข้ามไปเนื้อหาหลัก
      </a>

      <header className="sticky top-0 z-50 border-b border-border-light bg-bg-primary safe-top">
        <div
          className={cn(
            shell,
            "flex items-center justify-between gap-2 py-3 min-[400px]:gap-4 min-[400px]:py-4"
          )}
        >
          <Link
            href="/"
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg min-[400px]:gap-3",
              focusRing,
              "focus-visible:ring-offset-bg-primary"
            )}
          >
            <Image
              src="/logo.png"
              alt="foundu.forum"
              width={40}
              height={40}
              className="h-9 w-9 shrink-0 object-contain"
              priority
            />
            <span className="truncate text-lg font-semibold tracking-tight max-[399px]:sr-only">
              foundu.forum
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 min-[400px]:gap-2 sm:gap-3">
            <AnimatedThemeToggler
              className={cn(focusRing, "focus-visible:ring-offset-bg-primary")}
            />
            <ComingSoonCta
              comingSoon={comingSoon}
              message={comingSoonMessage}
              href="/auth/register"
              label="เริ่มใช้งาน"
              className={cn(
                primaryCtaClass,
                focusRing,
                "min-h-11 px-4 py-2 text-sm font-semibold focus-visible:ring-offset-bg-primary min-[400px]:px-5"
              )}
            />
          </div>
        </div>
      </header>

      <main id="main-content">
        <section
          aria-labelledby="hero-heading"
          className={cn(
            "relative overflow-x-clip overflow-y-visible bg-bg-secondary",
            sectionYHero,
            "md:overflow-visible"
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 hidden md:block"
            aria-hidden
          >
            <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-line-green/10 blur-3xl motion-reduce:hidden" />
          </div>

          <LandingHeroCardSwap images={cardImages} />

          <div className={heroShell}>
            <div
              className={cn(
                "grid items-center gap-10",
                "max-md:landscape:grid-cols-[minmax(0,1fr)_minmax(200px,42%)] max-md:landscape:gap-6 max-md:landscape:items-center",
                "md:grid-cols-[minmax(0,1fr)_minmax(280px,42%)] md:gap-12 lg:gap-16"
              )}
            >
              <div
                className={cn(
                  "text-center md:text-left",
                  proseWidth,
                  "md:max-w-xl lg:max-w-none lg:pr-4"
                )}
              >
                <h1 id="hero-heading" className={heroHeadingClass}>
                  ของหาย? แจ้งง่ายนิดเดียว
                </h1>
                <p className="mt-4 text-pretty text-base leading-relaxed text-text-primary md:text-lg">
                  foundu.forum รวมการแจ้งของหาย ของเจอ และติดตามสถานะไว้ที่เดียว
                  ให้คุณประกาศติดตามของที่หายและของที่พบเจอได้รวดเร็วกว่าเดิม
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
                  <ComingSoonCta
                    comingSoon={comingSoon}
                    message={comingSoonMessage}
                    href="/auth/register"
                    label="เริ่มใช้งาน"
                    showArrow
                    className={cn(
                      primaryCtaClass,
                      focusRing,
                      "w-full min-h-11 px-7 py-3.5 text-base font-semibold sm:w-auto focus-visible:ring-offset-bg-secondary"
                    )}
                  />
                  <a
                    href="#วิธีใช้"
                    className={cn(
                      "w-full sm:w-auto",
                      secondaryCtaClass,
                      focusRing,
                      "focus-visible:ring-offset-bg-secondary"
                    )}
                  >
                    ดูว่าใช้ยังไง
                  </a>
                </div>
              </div>

              <div className="relative min-w-0">
                <div className="hidden lg:block lg:w-full" aria-hidden>
                  <div className="aspect-[97/70] w-full max-w-full opacity-0" />
                </div>
                <MobileHeroPhone images={mobileCardImages} className="lg:hidden" />
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="features-heading"
          className={cn(
            deferredSection,
            "relative z-30 border-t border-border-light bg-bg-primary",
            sectionY
          )}
        >
          <div className={shell}>
            <div className={cn(sectionIntro, "mx-auto max-w-2xl text-center")}>
              <h2 id="features-heading" className={sectionHeadingClass}>
                ทำอะไรได้บ้าง
              </h2>
              <p className="text-pretty text-text-secondary">
                ฟีเจอร์ของ foundu.forum
              </p>
            </div>

            <div className={sectionBody}>
              <LandingFeaturesCarouselLazy features={features} />
            </div>
          </div>
        </section>

        <section
          id="วิธีใช้"
          aria-labelledby="steps-heading"
          className={cn(
            deferredSection,
            "border-t border-border-light bg-bg-secondary",
            sectionY
          )}
        >
          <div className={shell}>
            <div className={cn(sectionIntro, "mx-auto max-w-2xl text-center")}>
              <p className="text-sm font-medium text-text-secondary">
                ใช้งานง่ายๆ สามขั้น
              </p>
              <h2 id="steps-heading" className={sectionHeadingClass}>
                แจ้ง ติดตาม จับคู่
              </h2>
            </div>

            <ol
              className={cn(
                sectionBody,
                "grid gap-10",
                "lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-border-light"
              )}
            >
              {steps.map((step) => (
                <li
                  key={step.num}
                  className="min-w-0 lg:px-8 lg:first:pl-0 lg:last:pr-0"
                >
                  <p className="text-sm font-medium tabular-nums text-line-green-link">
                    ขั้นที่ {step.num}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-text-primary">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="cta-heading"
          className={cn(
            deferredSection,
            "border-t border-border-light bg-bg-primary",
            sectionYCta
          )}
        >
          <div className={cn(shell, "max-w-2xl text-center")}>
            <div className="rounded-2xl border border-border-light bg-bg-secondary px-8 py-10 md:px-10 md:py-12">
              <h2 id="cta-heading" className={sectionHeadingClass}>
                พร้อมลองใช้แล้วหรือยัง
              </h2>
              <p className="mt-3 text-text-secondary">
                เริ่มแจ้งหรือติดตามของที่หายและของที่เจอได้ทันที
              </p>
              <div className="mt-8 flex justify-center">
                <ComingSoonCta
                  comingSoon={comingSoon}
                  message={comingSoonMessage}
                  href="/auth/register"
                  label="เริ่มใช้งาน"
                  showArrow
                  className={cn(
                    primaryCtaClass,
                    focusRing,
                    "w-full min-h-11 px-8 py-3.5 font-semibold sm:w-auto focus-visible:ring-offset-bg-primary"
                  )}
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer
        className={cn(
          deferredSection,
          "border-t border-border-light bg-bg-secondary safe-bottom"
        )}
      >
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
    </div>
  );
}
