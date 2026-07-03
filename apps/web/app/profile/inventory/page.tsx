import { ProfileBackLink } from "@/components/profile/ProfileBackLink";
import { InventorySection } from "@/components/profile/InventorySection";
import { PageShell } from "@/components/PageShell";

export default function ProfileInventoryPage() {
  return (
    <PageShell
      title="Инвентарь"
      description="Привяжи collectible gift из Telegram — подарок остаётся в твоём профиле"
    >
      <ProfileBackLink />
      <InventorySection />
    </PageShell>
  );
}
