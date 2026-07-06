package domain

import "errors"

var (
	ErrInvalidAmount     = errors.New("invalid amount")
	ErrInsufficientFunds = errors.New("insufficient balance")
	ErrRoundNotOpen      = errors.New("round not accepting bets")
	ErrRoomFull          = errors.New("room is full")
	ErrNotFound          = errors.New("not found")
	ErrForbidden         = errors.New("forbidden")
	ErrAlreadyListed     = errors.New("item already listed")
	ErrWalletNotLinked   = errors.New("wallet not linked")
	ErrTransferPending   = errors.New("transfer already pending")
	ErrTransferExpired   = errors.New("transfer expired")
	ErrTransferNotFound  = errors.New("transfer not found")
	ErrDuplicateRequest  = errors.New("duplicate request")
	ErrChainUnavailable  = errors.New("chain verification unavailable")
)
