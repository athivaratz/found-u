import Image from "next/image";
import Link from "next/link";
import { PublicFooter } from "@/components/shared/public-footer";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { listHelpPages } from "@/lib/help/data";
import { focusRing, shell } from "@/components/landing/landing-tokens";
import { cn } from "@/lib/utils";

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pages = await listHelpPages();

  return (
    <div className="min-h-screen bg-bg-secondary text-text-primary">
      <header className="sticky top-0 z-30 border-b border-border-light bg-bg-primary/95 backdrop-blur">
        <div className={cn(shell, "flex h-14 items-center justify-between gap-3")}>
          <Link
            href="/"
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-lg px-1",
              focusRing
            )}
          >
            <Image
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="font-semibold text-text-primary">Found-U</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/help"
              className={cn(
                "hidden rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-text-primary sm:inline-flex",
                focusRing
              )}
            >
              ช่วยเหลือ
            </Link>
            {pages.map((page) => (
              <Link
                key={page.slug}
                href={`/help/${page.slug}`}
                className={cn(
                  "hidden max-w-[10rem] truncate rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-text-primary lg:inline-flex",
                  focusRing
                )}
                title={page.title}
              >
                {page.title}
              </Link>
            ))}
            <AnimatedThemeToggler />
          </div>
        </div>
      </header>

      <main className={cn(shell, "py-8 md:py-12")}>{children}</main>

      <PublicFooter
        helpLinks={pages.map((page) => ({
          href: `/help/${page.slug}`,
          label: page.title,
        }))}
      />
    </div>
  );
}
