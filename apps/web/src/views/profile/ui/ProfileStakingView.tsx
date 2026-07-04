import { PageShell } from "@/components/PageShell";
import { StakingSection } from "@/components/profile/StakingSection";

export function ProfileStakingView() {
  return (
    <PageShell title="Стейкинг подарков" description="Застейкай подарки и получай до 5% в месяц.">
      <StakingSection />
    </PageShell>
  );
}
