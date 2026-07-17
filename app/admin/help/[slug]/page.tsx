import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AdminHelpSlugRedirectPage({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/admin/blog/legacy/${slug}`);
}
