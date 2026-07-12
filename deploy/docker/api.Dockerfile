FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
RUN CGO_ENABLED=0 go build -o /api ./cmd/server

FROM alpine:3.19
RUN apk add --no-cache ca-certificates wget
COPY --from=builder /api /api
COPY --from=builder /app/assets/bots /assets/bots
ENV BOTS_DATA_DIR=/assets/bots
EXPOSE 8080
CMD ["/api"]
