import { redirect } from "next/navigation";

export default function LegacyHrPosRedirect() {
  redirect("/pos");
}
