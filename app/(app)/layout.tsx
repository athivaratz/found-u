import { MotionProvider } from "@/components/motion/motion-provider";

/** Shared layout for main student routes — motion + consistent min-height */
export default function AppRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MotionProvider>
      <div className="min-h-screen">{children}</div>
    </MotionProvider>
  );
}
