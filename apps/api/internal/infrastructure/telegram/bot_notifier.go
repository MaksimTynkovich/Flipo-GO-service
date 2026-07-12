package telegram

import (
	"context"
	"fmt"
	"strings"
)

type BotNotifier struct {
	api *BotAPI
}

func NewBotNotifier(token string) *BotNotifier {
	return &BotNotifier{api: NewBotAPI(token)}
}

func (n *BotNotifier) Enabled() bool {
	return n.api.Enabled()
}

func (n *BotNotifier) SendGiftDeposited(ctx context.Context, telegramUserID int64, giftName string) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}

	text := fmt.Sprintf("🎁 Подарок «%s» зачислен в инвентарь!", giftName)
	return n.api.sendMessage(ctx, telegramUserID, text, nil, "")
}

func (n *BotNotifier) SendDailyStakingYield(ctx context.Context, telegramUserID int64, yieldNanoton, referralBonusNanoton int64) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}
	if yieldNanoton <= 0 && referralBonusNanoton <= 0 {
		return nil
	}

	var parts []string
	if yieldNanoton > 0 {
		parts = append(parts, fmt.Sprintf("📈 За вчера стейкинг принёс %s TON — зачислено на баланс", formatTON(yieldNanoton)))
	}
	if referralBonusNanoton > 0 {
		parts = append(parts, fmt.Sprintf("👥 Ваши рефералы сегодня принесли вам: %s TON — зачислено на баланс", formatTON(referralBonusNanoton)))
	}
	return n.api.sendMessage(ctx, telegramUserID, strings.Join(parts, "\n\n"), nil, "")
}

func (n *BotNotifier) SendWeeklyStakingComplete(ctx context.Context, telegramUserID int64, totalYieldNanoton int64) error {
	if !n.Enabled() || telegramUserID == 0 {
		return nil
	}
	text := "✅ Недельный стейкинг завершён!\n\n"
	if totalYieldNanoton > 0 {
		text += fmt.Sprintf("Доход за неделю: %s TON (уже на балансе).\n\n", formatTON(totalYieldNanoton))
	} else {
		text += "Доход за неделю: 0 TON.\n\n"
	}
	text += "Пора добавить подарки в новый стейкинг."
	return n.api.sendMessage(ctx, telegramUserID, text, nil, "")
}

func formatTON(nanoton int64) string {
	if nanoton <= 0 {
		return "0"
	}
	ton := float64(nanoton) / 1_000_000_000
	prec := 2
	if ton < 0.01 {
		prec = 6
	} else if ton < 1 {
		prec = 4
	}
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.*f", prec, ton), "0"), ".")
}
