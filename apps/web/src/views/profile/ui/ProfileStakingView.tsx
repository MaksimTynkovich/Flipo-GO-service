import { PageShell } from "@/components/PageShell";
import { StakingSection } from "@/components/profile/StakingSection";

export function ProfileStakingView() {
  return (
    <PageShell description="Застейкай подарки и получай 3% в месяц. С активной игрой в рулетку — до 5%.">
      <StakingSection />
    </PageShell>
  );
}
