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

	spend := *ok
	spend.Title = "Отыграй 5 TON в кейсах"
	spend.ObjectiveType = domain.DailyQuestObjectiveOpenCasesSpend
	spend.ObjectiveTarget = 5_000_000_000
	if err := validateQuest(&spend); err != nil {
		t.Fatalf("cases spend: %v", err)
	}

	roulette := *ok
	roulette.Title = "Отыграй 2 TON в рулетке"
	roulette.ObjectiveType = domain.DailyQuestObjectiveWagerRoulette
	roulette.ObjectiveTarget = 2_000_000_000
	roulette.ObjectiveCaseID = &caseID
	if err := validateQuest(&roulette); err != nil {
		t.Fatalf("roulette wager: %v", err)
	}
	if roulette.ObjectiveCaseID != nil {
		t.Fatal("expected case id cleared for roulette")
	}

	crash := *ok
	crash.Title = "Отыграй 3 TON в crash"
	crash.ObjectiveType = domain.DailyQuestObjectiveWagerCrash
	crash.ObjectiveTarget = 3_000_000_000
	if err := validateQuest(&crash); err != nil {
		t.Fatalf("crash wager: %v", err)
	}

	hit := *ok
	hit.Title = "Выбей x50"
	hit.ObjectiveType = domain.DailyQuestObjectiveRouletteWinMult
	hit.ObjectiveTarget = 1
	hit.ObjectiveParam = 5000
	if err := validateQuest(&hit); err != nil {
		t.Fatalf("roulette win mult: %v", err)
	}

	hitBad := hit
	hitBad.ObjectiveParam = 50
	if err := validateQuest(&hitBad); err == nil {
		t.Fatal("expected error for tiny mult param")
	}

	cash := *ok
	cash.Title = "Додержи x2"
	cash.ObjectiveType = domain.DailyQuestObjectiveCrashCashoutMult
	cash.ObjectiveTarget = 1
	cash.ObjectiveParam = 200
	if err := validateQuest(&cash); err != nil {
		t.Fatalf("crash cashout: %v", err)
	}

	streak := *ok
	streak.Title = "Угадай цвет 5 раз подряд"
	streak.ObjectiveType = domain.DailyQuestObjectiveRouletteColorStreak
	streak.ObjectiveTarget = 5
	streak.ObjectiveParam = 999
	if err := validateQuest(&streak); err != nil {
		t.Fatalf("color streak: %v", err)
	}
	if streak.ObjectiveParam != 0 {
		t.Fatal("expected streak param cleared")
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

	none := *ok
	none.RewardType = domain.DailyQuestRewardNone
	none.RewardNanoton = 0
	if err := validateQuest(&none); err != nil {
		t.Fatalf("none reward: %v", err)
	}
}

func TestActionForObjective(t *testing.T) {
	if actionForObjective(domain.DailyQuestObjectiveOpenCases) != "cases" {
		t.Fatal("cases")
	}
	if actionForObjective(domain.DailyQuestObjectiveOpenCasesSpend) != "cases" {
		t.Fatal("cases spend")
	}
	if actionForObjective(domain.DailyQuestObjectiveInviteReferrals) != "referrals" {
		t.Fatal("referrals")
	}
	if actionForObjective(domain.DailyQuestObjectiveWagerRoulette) != "roulette" {
		t.Fatal("roulette")
	}
	if actionForObjective(domain.DailyQuestObjectiveWagerCrash) != "crash" {
		t.Fatal("crash")
	}
	if actionForObjective(domain.DailyQuestObjectiveRouletteWinMult) != "roulette" {
		t.Fatal("roulette win mult")
	}
	if actionForObjective(domain.DailyQuestObjectiveCrashCashoutMult) != "crash" {
		t.Fatal("crash cashout")
	}
	if actionForObjective(domain.DailyQuestObjectiveRouletteColorStreak) != "roulette" {
		t.Fatal("color streak")
	}
}

func TestMultFromParam(t *testing.T) {
	if multFromParam(5000) != 50 {
		t.Fatal("50x")
	}
	if floatMultFromParam(200) != 2.0 {
		t.Fatal("2x")
	}
	if multFromParam(0) != 2 {
		t.Fatal("fallback")
	}
}
