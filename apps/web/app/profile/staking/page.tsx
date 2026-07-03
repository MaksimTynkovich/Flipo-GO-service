import { ProfileBackLink } from "@/components/profile/ProfileBackLink";
import { StakingSection } from "@/components/profile/StakingSection";
import { PageShell } from "@/components/PageShell";

export default function ProfileStakingPage() {
  return (
    <PageShell title="Стейкинг">
      <ProfileBackLink />
      <div className="pb-24">
        <StakingSection />
      </div>
    </PageShell>
  );
}
