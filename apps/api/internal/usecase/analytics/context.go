package analytics

import "context"

type requestMetaKey struct{}

type RequestMeta struct {
	RequestID string
	SessionID string
	Path      string
	Method    string
	UserAgent string
	IPAddress string
}

func WithRequestMeta(ctx context.Context, meta RequestMeta) context.Context {
	return context.WithValue(ctx, requestMetaKey{}, meta)
}

func RequestMetaFromContext(ctx context.Context) RequestMeta {
	meta, _ := ctx.Value(requestMetaKey{}).(RequestMeta)
	return meta
}
