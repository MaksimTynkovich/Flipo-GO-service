package quests

import (
	"testing"

	"github.com/flipo/flipo/apps/api/internal/domain"
	"github.com/google/uuid"
)

func TestValidateQuest(t *testing.T) {
	caseID := uuid.New()
	ok := &domain.DailyQuest{
		Title:           "Открой 2 кейса",
		ObjectiveType:   domain.DailyQuestObjectiveOpenCases,
		ObjectiveTarget: 2,
		RewardType:      domain.DailyQuestRewardBalance,
		RewardNanoton:   1_000_000_000,
	}
	if err := validateQuest(ok); err != nil {
		t.Fatalf("expected ok, got %v", err)
	}

	bad := *ok
	bad.ObjectiveTarget = 0
	if err := validateQuest(&bad); err == nil {
		t.Fatal("expected error for target 0")
	}

	free := *ok
	free.RewardType = domain.DailyQuestRewardFreeCase
	free.RewardNanoton = 0
	free.RewardCaseID = &caseID
	if err := validateQuest(&free); err != nil {
		t.Fatalf("free case: %v", err)
	}

	freeBad := free
	freeBad.RewardCaseID = nil
	if err := validateQuest(&freeBad); err == nil {
		t.Fatal("expected error for missing case")
	}

	gift := *ok
	gift.RewardType = domain.DailyQuestRewardGift
	gift.RewardNanoton = 500_000_000
	gift.RewardCollectionSlug = "plushpepe"
	gift.RewardModelName = "Toy"
	gift.RewardGiftName = "Plush Pepe"
	if err := validateQuest(&gift); err != nil {
		t.Fatalf("gift: %v", err)
	}

	giftBad := gift
	giftBad.RewardCollectionSlug = ""
	if err := validateQuest(&giftBad); err == nil {
		t.Fatal("expected error for missing collection")
	}
}

func TestActionForObjective(t *testing.T) {
	if actionForObjective(domain.DailyQuestObjectiveOpenCases) != "cases" {
		t.Fatal("cases")
	}
	if actionForObjective(domain.DailyQuestObjectiveInviteReferrals) != "referrals" {
		t.Fatal("referrals")
	}
}
