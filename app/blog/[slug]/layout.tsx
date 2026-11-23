export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function BlogSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
