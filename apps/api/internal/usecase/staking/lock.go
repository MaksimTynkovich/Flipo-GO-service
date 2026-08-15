package staking

import "context"

type epochLocker interface {
	WithEpochLock(ctx context.Context, fn func(context.Context) error) error
}

func (s *Service) withEpochLock(ctx context.Context, fn func(context.Context) error) error {
	if s == nil || s.staking == nil {
		return fn(ctx)
	}
	locker, ok := s.staking.(epochLocker)
	if !ok {
		return fn(ctx)
	}
	return locker.WithEpochLock(ctx, fn)
}
