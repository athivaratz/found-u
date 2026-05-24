import { redirect } from "next/navigation";

export default function SecuritySettingsRedirect() {
  redirect("/settings");
}
