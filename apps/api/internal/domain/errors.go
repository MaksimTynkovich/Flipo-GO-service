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
)
