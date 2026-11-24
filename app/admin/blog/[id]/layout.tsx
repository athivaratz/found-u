export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function AdminBlogIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
