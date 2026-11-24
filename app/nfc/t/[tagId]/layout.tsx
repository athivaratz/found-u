export function generateStaticParams() {
  return [{ tagId: "_" }];
}

export default function NfcTagLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
