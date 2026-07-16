import { Home } from "lucide-react";

export function NotFoundHomeButton() {
  return (
    <a
      href="/"
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-line-green px-6 py-3.5 font-medium text-white transition-colors hover:bg-line-green-hover"
    >
      <Home className="w-5 h-5" />
      หน้าแรก
    </a>
  );
}
