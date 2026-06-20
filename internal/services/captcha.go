package services

import (
	"bytes"
	"encoding/base64"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/dchest/captcha"
	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/utils"
)

// CaptchaService 验证码服务
// 基于 github.com/dchest/captcha 实现
type CaptchaService struct {
	mu     sync.RWMutex
	logger *zap.SugaredLogger
	store  captcha.Store
	// 配置
	length   int           // 验证码长度
	width    int           // 图片宽度
	height   int           // 图片高度
	expire   time.Duration // 过期时间
	enabled  bool          // 是否启用
}

// CaptchaResponse 验证码响应
type CaptchaResponse struct {
	CaptchaID   string `json:"captcha_id"`   // 验证码ID
	ImageBase64 string `json:"image_base64"` // Base64编码的图片
	ExpireTime  int64  `json:"expire_time"`  // 过期时间戳
}

// NewCaptchaService 创建验证码服务
func NewCaptchaService(baseLogger *zap.Logger) *CaptchaService {
	logger := utils.NewModuleLogger(baseLogger, "service.captcha")

	// 从环境变量读取是否启用验证码，默认启用
	enabled := true
	if env := os.Getenv("CAPTCHA_ENABLED"); env != "" {
		enabled = strings.ToLower(env) != "false"
	}

	// 创建内存存储，过期时间5分钟
	store := captcha.NewMemoryStore(1000, 5*time.Minute)
	captcha.SetCustomStore(store)

	svc := &CaptchaService{
		logger:  logger,
		store:   store,
		length:  4,              // 4位验证码
		width:   240,            // 图片宽度
		height:  80,             // 图片高度
		expire:  5 * time.Minute, // 过期时间
		enabled: enabled,
	}

	logger.Infow("验证码服务初始化", "enabled", enabled)

	return svc
}

// IsEnabled 检查验证码是否启用
func (s *CaptchaService) IsEnabled() bool {
	return s.enabled
}

// GenerateCaptcha 生成验证码
// 返回验证码ID和图片的Base64编码
func (s *CaptchaService) GenerateCaptcha() (*CaptchaResponse, error) {
	// 生成验证码ID
	captchaID := captcha.NewLen(s.length)

	// 生成图片
	var buf bytes.Buffer
	if err := captcha.WriteImage(&buf, captchaID, s.width, s.height); err != nil {
		s.logger.Errorw("生成验证码图片失败", "error", err)
		return nil, err
	}

	// 转换为Base64
	base64Str := base64.StdEncoding.EncodeToString(buf.Bytes())

	s.logger.Debugw("验证码生成成功", "captcha_id", captchaID[:8]+"...")

	return &CaptchaResponse{
		CaptchaID:   captchaID,
		ImageBase64: "data:image/png;base64," + base64Str,
		ExpireTime:  time.Now().Add(s.expire).Unix(),
	}, nil
}

// VerifyCaptcha 验证验证码
// 如果验证码未启用，直接返回 true
// 验证成功后，验证码会被标记为已使用
func (s *CaptchaService) VerifyCaptcha(captchaID, code string) bool {
	// 如果验证码未启用，直接返回成功
	if !s.enabled {
		return true
	}

	if captchaID == "" || code == "" {
		return false
	}

	// 使用 dchest/captcha 验证
	if !captcha.VerifyString(captchaID, code) {
		s.logger.Debugw("验证码错误", "captcha_id", captchaID[:8]+"...")
		return false
	}

	s.logger.Debugw("验证码验证成功", "captcha_id", captchaID[:8]+"...")
	return true
}

// RefreshCaptcha 刷新验证码
// 生成新的验证码并返回，同时删除旧的验证码
func (s *CaptchaService) RefreshCaptcha(oldCaptchaID string) (*CaptchaResponse, error) {
	// 删除旧的验证码
	if oldCaptchaID != "" {
		s.store.Get(oldCaptchaID, true) // true 表示删除
	}

	// 生成新的验证码
	return s.GenerateCaptcha()
}

// GetCaptchaCount 获取当前验证码数量（用于监控）
func (s *CaptchaService) GetCaptchaCount() int {
	// dchest/captcha 的内存存储不暴露计数接口
	// 返回 -1 表示不支持
	return -1
}
