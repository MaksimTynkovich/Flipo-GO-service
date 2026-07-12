package telegram

import (
	"context"
	"fmt"

	"github.com/gotd/td/tg"
)

// IncomingGift is a collectible gift on the deposit MTProto account.
type IncomingGift struct {
	ScannedGift
	SenderTelegramID int64
	MsgID            int
	SavedID          int64
}

// ScanOwnedGiftsOnce returns all unique collectible gifts currently on the MTProto account.
func ScanOwnedGiftsOnce(ctx context.Context, cfg MTProtoConfig) ([]IncomingGift, error) {
	if !cfg.Enabled() {
		return nil, ErrMTProtoNotConfigured
	}

	var owned []IncomingGift
	err := WithMTProtoAPI(ctx, cfg, func(ctx context.Context, api *tg.Client) error {
		users, err := api.UsersGetUsers(ctx, []tg.InputUserClass{&tg.InputUserSelf{}})
		if err != nil {
			return fmt.Errorf("users.getUsers self: %w", err)
		}
		if len(users) == 0 {
			return fmt.Errorf("self user not returned")
		}
		user, ok := users[0].(*tg.User)
		if !ok {
			return fmt.Errorf("unexpected self user type %T", users[0])
		}

		peer, err := userPeer(ScanTarget{UserID: user.ID, AccessHash: user.AccessHash})
		if err != nil {
			return err
		}

		offset := ""
		for {
			resp, err := api.PaymentsGetSavedStarGifts(ctx, &tg.PaymentsGetSavedStarGiftsRequest{
				Peer:   peer,
				Offset: offset,
				Limit:  100,
			})
			if err != nil {
				return fmt.Errorf("payments.getSavedStarGifts: %w", err)
			}

			for _, saved := range resp.Gifts {
				unique, ok := saved.Gift.(*tg.StarGiftUnique)
				if !ok || unique.Slug == "" {
					continue
				}
				mapped := mapUniqueGift(unique)
				msgID, _ := saved.GetMsgID()
				savedID, _ := saved.GetSavedID()
				owned = append(owned, IncomingGift{
					ScannedGift:      mapped,
					SenderTelegramID: peerUserID(saved),
					MsgID:            msgID,
					SavedID:          savedID,
				})
			}

			nextOffset, ok := resp.GetNextOffset()
			if !ok || nextOffset == "" {
				break
			}
			offset = nextOffset
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return owned, nil
}

// ScanIncomingGiftsOnce returns gifts that have a known sender (for user deposit matching).
func ScanIncomingGiftsOnce(ctx context.Context, cfg MTProtoConfig) ([]IncomingGift, error) {
	owned, err := ScanOwnedGiftsOnce(ctx, cfg)
	if err != nil {
		return nil, err
	}
	incoming := make([]IncomingGift, 0, len(owned))
	for _, gift := range owned {
		if gift.SenderTelegramID == 0 {
			continue
		}
		incoming = append(incoming, gift)
	}
	return incoming, nil
}

func peerUserID(saved tg.SavedStarGift) int64 {
	from, ok := saved.GetFromID()
	if !ok || from == nil {
		return 0
	}
	switch p := from.(type) {
	case *tg.PeerUser:
		return p.UserID
	default:
		return 0
	}
}
