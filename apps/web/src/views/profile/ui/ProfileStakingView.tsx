import { PageShell } from "@/components/PageShell";
import { StakingSection } from "@/components/profile/StakingSection";

export function ProfileStakingView() {
  return (
    <PageShell description="Пассивный доход с подарков — управляй портфелем и доходностью.">
      <StakingSection />
    </PageShell>
  );
}
