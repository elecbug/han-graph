FROM golang:1.26.11-alpine3.24@sha256:ecb67f987aa1a57794c91d19ade7ae0209f2f0f5496aaef9e6ae85ddf92d02ab AS build

WORKDIR /build
COPY src/go.mod src/go.sum ./
# Keep completed downloads and retry interrupted proxy streams over HTTP/1.1.
RUN go mod download || ( \
      export GODEBUG=http2client=0; \
      for delay in 2 4 8; do \
        echo "Retrying Go module download over HTTP/1.1 in ${delay}s" >&2; \
        sleep "$delay"; \
        go mod download && exit 0; \
      done; \
      exit 1 \
    )
COPY src/ ./
RUN GOPROXY=off CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-s -w" -o /out/han-graph ./cmd

FROM alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 1000 app \
    && adduser -S -D -H -u 1000 -G app app \
    && mkdir -p /app/var \
    && chown app:app /app/var
WORKDIR /app
COPY --from=build /out/han-graph /usr/local/bin/han-graph
COPY dataset/ ./dataset/
COPY LICENSE /usr/share/licenses/han-graph/LICENSE
COPY src/LICENSE /usr/share/licenses/han-graph/src-LICENSE

USER 1000:1000
EXPOSE 18080
ENTRYPOINT ["/usr/local/bin/han-graph"]
CMD ["-data", "/app/dataset", "-accounts", "/app/var/accounts.db", "-addr", "0.0.0.0:18080", "serve"]
