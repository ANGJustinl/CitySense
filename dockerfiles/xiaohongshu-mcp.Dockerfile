FROM golang:1.24 AS builder

WORKDIR /src
RUN git init . && git remote add origin https://github.com/xpzouying/xiaohongshu-mcp.git
RUN git fetch --depth=1 origin 0cf885c2d02745678ec6cc91b401d898373064e9 && git checkout FETCH_HEAD
COPY dockerfiles/xiaohongshu-mcp-search-timeout.patch /tmp/xiaohongshu-mcp-search-timeout.patch
RUN git apply --recount /tmp/xiaohongshu-mcp-search-timeout.patch
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /out/app .

FROM xpzouying/xiaohongshu-mcp:latest

COPY --from=builder /out/app /app/app
