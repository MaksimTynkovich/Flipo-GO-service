package telegram

import (
	"context"
	"errors"
	"fmt"

	"github.com/gotd/td/tg"
)

var (
	ErrGiftNotOnAccount  = errors.New("gift not found on deposit account")
	ErrGiftTransfer      = errors.New("gift transfer failed")
	ErrInsufficientStars = errors.New("insufficient stars on deposit account")
)

type GiftTransferService struct {
	cfg MTProtoConfig
}

func NewGiftTransferService(cfg MTProtoConfig) *GiftTransferService {
	return &GiftTransferService{cfg: cfg}
}

// SendGift transfers a collectible gift from the deposit MTProto account back to the user.
// Paid transfers go through payments.getPaymentForm + payments.sendStarsForm; free transfers
// use payments.transferStarGift when Telegram reports NO_PAYMENT_NEEDED.
func (s *GiftTransferService) SendGift(ctx context.Context, slug string, recipient ScanTarget) error {
	if !s.cfg.Enabled() {
		return ErrMTProtoNotConfigured
	}
	if slug == "" {
		return fmt.Errorf("%w: empty slug", ErrGiftTransfer)
	}

	return WithMTProtoAPI(ctx, s.cfg, func(ctx context.Context, api *tg.Client) error {
		stargift, err := findOwnedGiftInput(ctx, api, slug)
		if err != nil {
			return err
		}

		resolved, err := resolveScanTarget(ctx, api, recipient)
		if err != nil {
			return fmt.Errorf("%w: resolve recipient: %v", ErrGiftTransfer, err)
		}

		toPeer, err := userPeer(resolved)
		if err != nil {
			return fmt.Errorf("%w: recipient peer: %v", ErrGiftTransfer, err)
		}

		if err := transferStarGift(ctx, api, stargift, toPeer); err != nil {
			return err
		}
		return nil
	})
}

func transferStarGift(ctx context.Context, api *tg.Client, stargift tg.InputSavedStarGiftClass, toPeer tg.InputPeerClass) error {
	invoice := &tg.InputInvoiceStarGiftTransfer{
		Stargift: stargift,
		ToID:     toPeer,
	}

	form, err := api.PaymentsGetPaymentForm(ctx, &tg.PaymentsGetPaymentFormRequest{
		Invoice: invoice,
	})
	if err != nil {
		if tg.IsNoPaymentNeeded(err) {
			return transferStarGiftFree(ctx, api, stargift, toPeer)
		}
		return mapGiftTransferRPCError(err)
	}

	formID, err := paymentFormID(form)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrGiftTransfer, err)
	}

	if _, err := api.PaymentsSendStarsForm(ctx, &tg.PaymentsSendStarsFormRequest{
		FormID:  formID,
		Invoice: invoice,
	}); err != nil {
		return mapGiftTransferRPCError(err)
	}
	return nil
}

func transferStarGiftFree(ctx context.Context, api *tg.Client, stargift tg.InputSavedStarGiftClass, toPeer tg.InputPeerClass) error {
	_, err := api.PaymentsTransferStarGift(ctx, &tg.PaymentsTransferStarGiftRequest{
		Stargift: stargift,
		ToID:     toPeer,
	})
	if err != nil {
		return mapGiftTransferRPCError(err)
	}
	return nil
}

func paymentFormID(form tg.PaymentsPaymentFormClass) (int64, error) {
	switch f := form.(type) {
	case *tg.PaymentsPaymentForm:
		return f.FormID, nil
	case *tg.PaymentsPaymentFormStars:
		return f.FormID, nil
	case *tg.PaymentsPaymentFormStarGift:
		return f.FormID, nil
	default:
		return 0, fmt.Errorf("unsupported payment form type %T", form)
	}
}

func mapGiftTransferRPCError(err error) error {
	if tg.IsBalanceTooLow(err) {
		return ErrInsufficientStars
	}
	return fmt.Errorf("%w: %v", ErrGiftTransfer, err)
}

func findOwnedGiftInput(ctx context.Context, api *tg.Client, slug string) (tg.InputSavedStarGiftClass, error) {
	users, err := api.UsersGetUsers(ctx, []tg.InputUserClass{&tg.InputUserSelf{}})
	if err != nil {
		return nil, fmt.Errorf("users.getUsers self: %w", err)
	}
	if len(users) == 0 {
		return nil, errors.New("self user not returned")
	}
	user, ok := users[0].(*tg.User)
	if !ok {
		return nil, fmt.Errorf("unexpected self user type %T", users[0])
	}

	peer, err := userPeer(ScanTarget{UserID: user.ID, AccessHash: user.AccessHash})
	if err != nil {
		return nil, err
	}

	offset := ""
	for {
		resp, err := api.PaymentsGetSavedStarGifts(ctx, &tg.PaymentsGetSavedStarGiftsRequest{
			Peer:   peer,
			Offset: offset,
			Limit:  100,
		})
		if err != nil {
			return nil, fmt.Errorf("payments.getSavedStarGifts: %w", err)
		}

		for _, saved := range resp.Gifts {
			unique, ok := saved.Gift.(*tg.StarGiftUnique)
			if !ok || unique.Slug != slug {
				continue
			}
			if savedID, ok := saved.GetSavedID(); ok && savedID > 0 {
				return &tg.InputSavedStarGiftChat{
					Peer:    &tg.InputPeerSelf{},
					SavedID: savedID,
				}, nil
			}
			if msgID, ok := saved.GetMsgID(); ok && msgID > 0 {
				return &tg.InputSavedStarGiftUser{MsgID: msgID}, nil
			}
			return &tg.InputSavedStarGiftSlug{Slug: slug}, nil
		}

		nextOffset, ok := resp.GetNextOffset()
		if !ok || nextOffset == "" {
			break
		}
		offset = nextOffset
	}

	return nil, ErrGiftNotOnAccount
}
