package domain

import (
	"strconv"
	"strings"
)

const (
	ProfileTxRefPrefix        = "profile:"
	DepositMsgTxRefPrefix     = "deposit:msg:"
	DepositSavedTxRefPrefix   = "deposit:saved:"
	BotMarketMsgTxRefPrefix   = "bot-market:msg:"
	BotMarketSavedTxRefPrefix = "bot-market:saved:"
)

// IsUserGiftDepositTxRef is true only for refs minted from a real incoming
// Telegram transfer to the deposit bot (numeric message or saved-gift id).
// Fake prefixes like deposit:manual: or deposit:<slug> do not count.
func IsUserGiftDepositTxRef(txRef string) bool {
	return hasPositiveIntSuffix(txRef, DepositMsgTxRefPrefix) ||
		hasPositiveIntSuffix(txRef, DepositSavedTxRefPrefix)
}

// IsBotCustodyTxRef is true when the inventory row is backed by a gift that
// was observed on the deposit MTProto account (user deposit or bot-market intake).
func IsBotCustodyTxRef(txRef string) bool {
	return IsUserGiftDepositTxRef(txRef) ||
		hasPositiveIntSuffix(txRef, BotMarketMsgTxRefPrefix) ||
		hasPositiveIntSuffix(txRef, BotMarketSavedTxRefPrefix)
}

// CanMarketBuyback — platform may pay market buyback only for gifts in bot custody.
// Profile-virtual items, manual SQL "deposits", and case/quest claims are excluded.
func CanMarketBuyback(item InventoryItem) bool {
	if IsProfileVirtualItem(item) || IsCaseClaimItem(item) {
		return false
	}
	return IsBotCustodyTxRef(item.TelegramTxRef)
}

func hasPositiveIntSuffix(txRef, prefix string) bool {
	rest, ok := strings.CutPrefix(txRef, prefix)
	if !ok {
		return false
	}
	idPart, _, _ := strings.Cut(rest, ":")
	id, err := strconv.ParseInt(idPart, 10, 64)
	return err == nil && id > 0
}
