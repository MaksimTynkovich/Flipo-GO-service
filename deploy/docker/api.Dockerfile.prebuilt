# Prebuilt binary deploy (avoids OOM on small VPS during go build).
# Expects: deploy/prebuilt/api (linux/amd64)

FROM alpine:3.19
RUN apk add --no-cache ca-certificates wget
COPY deploy/prebuilt/api /api
EXPOSE 8080
CMD ["/api"]
