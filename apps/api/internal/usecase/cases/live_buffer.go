package cases

import (
	"context"
	"sync"

	"github.com/flipo/flipo/apps/api/internal/domain"
)

const liveFeedBufferCap = 24

type liveDropBuffer struct {
	mu    sync.RWMutex
	items []domain.CaseLiveDrop
}

func newLiveDropBuffer() *liveDropBuffer {
	return &liveDropBuffer{items: make([]domain.CaseLiveDrop, 0, liveFeedBufferCap)}
}

func (b *liveDropBuffer) Push(drop domain.CaseLiveDrop) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := range b.items {
		if b.items[i].OpenID == drop.OpenID {
			b.items[i] = drop
			return
		}
	}
	b.items = append([]domain.CaseLiveDrop{drop}, b.items...)
	if len(b.items) > liveFeedBufferCap {
		b.items = b.items[:liveFeedBufferCap]
	}
}

func (b *liveDropBuffer) Snapshot() []domain.CaseLiveDrop {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]domain.CaseLiveDrop, len(b.items))
	copy(out, b.items)
	return out
}

func (b *liveDropBuffer) Len() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.items)
}

type bufferingLivePublisher struct {
	inner LiveDropPublisher
	buf   *liveDropBuffer
}

func NewBufferingLivePublisher(inner LiveDropPublisher, buf *liveDropBuffer) LiveDropPublisher {
	return &bufferingLivePublisher{inner: inner, buf: buf}
}

func (p *bufferingLivePublisher) PublishCaseLiveDrop(ctx context.Context, drop domain.CaseLiveDrop) {
	if p.buf != nil {
		p.buf.Push(drop)
	}
	if p.inner != nil {
		p.inner.PublishCaseLiveDrop(ctx, drop)
	}
}
