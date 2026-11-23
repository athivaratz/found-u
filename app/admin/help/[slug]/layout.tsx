export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function AdminHelpSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
