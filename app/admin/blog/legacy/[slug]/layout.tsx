export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function AdminBlogLegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
