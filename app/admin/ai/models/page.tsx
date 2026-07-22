import { redirect } from "next/navigation";

export default function AdminAIModelsRedirectPage() {
  redirect("/admin/ai/gemini");
}
