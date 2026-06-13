FROM golang:1.24 AS builder

WORKDIR /src
ARG XHS_MCP_REPO=https://github.com/ANGJustinl/xiaohongshu-mcp.git
ARG XHS_MCP_COMMIT=d93a11caae4f8ce84e954dde53933be22d7908c4
RUN git init . && git remote add origin ${XHS_MCP_REPO}
RUN git fetch --depth=1 origin ${XHS_MCP_COMMIT} && git checkout FETCH_HEAD
COPY dockerfiles/xiaohongshu-mcp-search-timeout.patch /tmp/xiaohongshu-mcp-search-timeout.patch
RUN git apply --recount /tmp/xiaohongshu-mcp-search-timeout.patch
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /out/app .

FROM xpzouying/xiaohongshu-mcp:latest

COPY --from=builder /out/app /app/app
