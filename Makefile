# Makefile for HanChat-QQBotManager
# 支持跨平台编译

# 项目信息
APP_NAME := HanChat-QQBotManager
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date +%Y%m%d-%H%M%S)
LDFLAGS := -s -w -X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME)

# 构建目录
BUILD_DIR := build

# 默认目标
.PHONY: all
all: clean build-all

# 清理构建文件
.PHONY: clean
clean:
	@echo "清理构建文件..."
	@rm -rf $(BUILD_DIR)
	@echo "清理完成"

# 构建所有平台
.PHONY: build-all
build-all: build-windows build-linux
	@echo "所有平台构建完成！"
	@echo "Windows: $(BUILD_DIR)/$(APP_NAME)-windows-amd64.exe"
	@echo "Linux:   $(BUILD_DIR)/$(APP_NAME)-linux-amd64"

# 构建Windows版本
.PHONY: build-windows
build-windows:
	@echo "构建Windows版本..."
	@mkdir -p $(BUILD_DIR)
	@GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-windows-amd64.exe ./cmd/app
	@echo "Windows版本构建完成: $(BUILD_DIR)/$(APP_NAME)-windows-amd64.exe"

# 构建Linux版本
.PHONY: build-linux
build-linux:
	@echo "构建Linux版本..."
	@mkdir -p $(BUILD_DIR)
	@GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME)-linux-amd64 ./cmd/app
	@echo "Linux版本构建完成: $(BUILD_DIR)/$(APP_NAME)-linux-amd64"

# 构建当前平台
.PHONY: build
build:
	@echo "构建当前平台版本..."
	@mkdir -p $(BUILD_DIR)
	@go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(APP_NAME) ./cmd/app
	@echo "构建完成: $(BUILD_DIR)/$(APP_NAME)"

# 运行（开发模式）
.PHONY: run
run:
	@go run ./cmd/app

# 测试
.PHONY: test
test:
	@go test ./...

# 格式化代码
.PHONY: fmt
fmt:
	@go fmt ./...

# 代码检查
.PHONY: vet
vet:
	@go vet ./...

# 帮助信息
.PHONY: help
help:
	@echo "HanChat-QQBotManager 构建系统"
	@echo ""
	@echo "可用命令:"
	@echo "  make build-all     - 构建所有平台（Windows和Linux）"
	@echo "  make build-windows - 构建Windows版本"
	@echo "  make build-linux   - 构建Linux版本"
	@echo "  make build         - 构建当前平台版本"
	@echo "  make clean         - 清理构建文件"
	@echo "  make run           - 运行程序（开发模式）"
	@echo "  make test          - 运行测试"
	@echo "  make fmt           - 格式化代码"
	@echo "  make vet           - 代码检查"
	@echo "  make help          - 显示此帮助信息"
	@echo ""

