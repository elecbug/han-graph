FROM golang:1.26.10-alpine3.24 AS build

WORKDIR /build
COPY src/go.mod src/go.sum ./
RUN go mod download
COPY src/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/han-graph ./cmd

FROM alpine:3.24.3

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
