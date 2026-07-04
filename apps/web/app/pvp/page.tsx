import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/src/shared/config/navigation";

export default function PvpRedirectPage() {
  redirect(APP_ROUTES.pvp);
}
