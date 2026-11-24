export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function HelpSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
