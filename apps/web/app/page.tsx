import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/src/shared/config/navigation";

export default function HomePage() {
  redirect(APP_ROUTES.cases);
}
