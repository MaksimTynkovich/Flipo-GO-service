import { redirect } from "next/navigation";
import { APP_ROUTES } from "@/src/shared/config/navigation";

export default function ProfileInventoryPage() {
  redirect(APP_ROUTES.inventory);
}
