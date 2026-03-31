package services

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"HanChat-QQBotManager/internal/utils"
)

// WebLoginService Web登录服务
// 基于环境变量校验 + IP封锁机制，完全替代原MySQL登录
type WebLoginService struct {
	mu              sync.RWMutex
	logger          *zap.SugaredLogger
	username        string
	password        string
	timezoneOffset  int
	banIPFile       string
	failedAttempts  map[string]int // IP -> 失败次数
	tokens          map[string]*LoginToken // token -> 登录凭证

	// Token续期配置
	tokenDuration    time.Duration // Token默认有效期
	minRenewalRatio  float64       // 触发续期的剩余比例阈值（默认0.5）
	maxRenewalRatio  float64       // 最大可续期比例（默认1.0，即最多延长到2倍原始有效期）
	renewalCooldown  time.Duration  // 续期冷却时间（防止频繁续期）
	lastRenewal      map[string]time.Time // token -> 上次续期时间
}

// LoginToken 登录凭证
type LoginToken struct {
	Token       string
	CreatedAt   time.Time
	ExpiresAt   time.Time
	LastRenewAt time.Time // 上次续期时间
}

// TokenRenewResult Token续期结果
type TokenRenewResult struct {
	Renewed         bool      // 是否进行了续期
	OldExpiresAt    time.Time // 续期前过期时间
	NewExpiresAt    time.Time // 续期后过期时间
	RemainingBefore time.Duration // 续期前剩余时间
	RemainingAfter  time.Duration // 续期后剩余时间
	Reason          string    // 续期原因或未续期原因
}

// NewWebLoginService 创建Web登录服务
// 从环境变量加载配置
func NewWebLoginService(baseLogger *zap.Logger) *WebLoginService {
	logger := utils.NewModuleLogger(baseLogger, "service.web_login")

	// 从环境变量读取配置
	username := os.Getenv("WEB_LOGIN_USER")
	if username == "" {
		username = "admin" // 默认值
	}

	password := os.Getenv("WEB_LOGIN_PWD")
	if password == "" {
		password = "admin123" // 默认值（仅用于开发）
		logger.Warnw("未设置WEB_LOGIN_PWD环境变量，使用默认密码")
	}

	timezoneOffset := 8 // 默认UTC+8
	if tz := os.Getenv("TIMEZONE_OFFSET"); tz != "" {
		if offset, err := fmt.Sscanf(tz, "%d", &timezoneOffset); err != nil || offset != 1 {
			timezoneOffset = 8
		}
	}

	banIPFile := filepath.Join("log", "BanIP.ini")

	svc := &WebLoginService{
		logger:         logger,
		username:       username,
		password:       password,
		timezoneOffset: timezoneOffset,
		banIPFile:      banIPFile,
		failedAttempts: make(map[string]int),
		tokens:         make(map[string]*LoginToken),

		// Token续期配置 - 默认1小时有效期
		tokenDuration:   1 * time.Hour,
		minRenewalRatio:  0.5,       // 剩余50%以下才续期
		maxRenewalRatio:  1.0,       // 最多延长到2倍原始有效期
		renewalCooldown:  5 * time.Second, // 续期冷却5秒，防止频繁续期
		lastRenewal:      make(map[string]time.Time),
	}

	// 确保BanIP.ini目录存在
	if err := os.MkdirAll(filepath.Dir(banIPFile), 0755); err != nil {
		logger.Warnw("创建BanIP.ini目录失败", "error", err)
	}

	// 启动定期清理任务
	go svc.cleanupTask()

	return svc
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Topo     string `json:"topo" binding:"required"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Success   bool   `json:"success"`
	Token     string `json:"token,omitempty"`
	Message   string `json:"message"`
	ExpiresAt string `json:"expires_at,omitempty"`
}

// Login 执行登录
// 完整流程：IP识别 -> 封禁校验 -> 失败计数 -> 参数校验 -> 结果处理
func (s *WebLoginService) Login(req *LoginRequest, clientIP string) *LoginResponse {
	// 1. IP识别（优先取X-Forwarded-For第一个IP）
	realIP := s.extractRealIP(clientIP)

	// 2. 封禁校验
	if s.isIPBanned(realIP) {
		s.logger.Warnw("登录被拒绝：IP已被封禁", "ip", realIP)
		return &LoginResponse{
			Success: false,
			Message: "系统出现严重错误，请联系系统管理员",
		}
	}

	// 3. 参数校验
	// 校验TOPO（8位纯数字，匹配当前时区当日yyyymmdd格式）
	if !s.validateTopo(req.Topo) {
		s.recordFailedAttempt(realIP)
		return &LoginResponse{
			Success: false,
			Message: "登录失败",
		}
	}

	// 校验账号密码
	if req.Username != s.username || req.Password != s.password {
		s.recordFailedAttempt(realIP)
		s.logger.Warnw("登录失败：账号密码错误", "ip", realIP, "username", req.Username)
		return &LoginResponse{
			Success: false,
			Message: "登录失败",
		}
	}

	// 4. 登录成功，清除失败计数
	s.clearFailedAttempts(realIP)

	// 5. 生成登录凭证
	token := s.generateToken()
	expiresAt := time.Now().Add(s.tokenDuration)

	s.mu.Lock()
	s.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   time.Now(),
		ExpiresAt:   expiresAt,
		LastRenewAt: time.Now(),
	}
	s.mu.Unlock()

	s.logger.Infow("登录成功", "ip", realIP, "username", req.Username,
		"token_ttl", s.tokenDuration)

	return &LoginResponse{
		Success:   true,
		Token:     token,
		Message:   "登录成功",
		ExpiresAt: expiresAt.Format(time.RFC3339),
	}
}

// ValidateToken 验证登录凭证
func (s *WebLoginService) ValidateToken(token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, exists := s.tokens[token]
	if !exists {
		return false
	}

	if time.Now().After(t.ExpiresAt) {
		return false
	}

	return true
}

// RenewTokenIfNeeded 智能续期Token
// 当token剩余有效期不足50%时，自动续期
// 续期条件：
// 1. Token存在且有效
// 2. 不在续期冷却期内（防止频繁续期）
// 3. 剩余有效期不足tokenDuration的50%
// 4. 续期后不超过原始有效期的2倍（最大有效期限制）
func (s *WebLoginService) RenewTokenIfNeeded(token string) *TokenRenewResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	result := &TokenRenewResult{}

	t, exists := s.tokens[token]
	if !exists {
		result.Reason = "token_not_found"
		return result
	}

	if now.After(t.ExpiresAt) {
		result.Reason = "token_expired"
		delete(s.tokens, token)
		return result
	}

	result.OldExpiresAt = t.ExpiresAt
	result.RemainingBefore = t.ExpiresAt.Sub(now)

	// 检查冷却期
	if lastRenew, hasLastRenew := s.lastRenewal[token]; hasLastRenew {
		if now.Sub(lastRenew) < s.renewalCooldown {
			result.Reason = fmt.Sprintf("renewal_cooldown_active (cooldown=%v, remaining=%v)",
				s.renewalCooldown, s.renewalCooldown-now.Sub(lastRenew))
			result.NewExpiresAt = t.ExpiresAt
			result.RemainingAfter = result.RemainingBefore
			return result
		}
	}

	// 计算续期后的新过期时间
	totalValidDuration := s.tokenDuration // 原始有效期时长
	maxExpiresAt := t.CreatedAt.Add(totalValidDuration).Add(s.tokenDuration * time.Duration(s.maxRenewalRatio))

	// 计算剩余有效期比例
	remainingRatio := result.RemainingBefore.Seconds() / s.tokenDuration.Seconds()

	// 检查是否需要续期：剩余时间不足50%
	if remainingRatio >= s.minRenewalRatio {
		result.Reason = fmt.Sprintf("sufficient_remaining_time (ratio=%.2f%%, threshold=%.2f%%)",
			remainingRatio*100, s.minRenewalRatio*100)
		result.NewExpiresAt = t.ExpiresAt
		result.RemainingAfter = result.RemainingBefore
		return result
	}

	// 计算新的过期时间
	newExpiresAt := now.Add(s.tokenDuration)

	// 确保不超过最大有效期
	if newExpiresAt.After(maxExpiresAt) {
		newExpiresAt = maxExpiresAt
		result.Reason = fmt.Sprintf("capped_at_max_duration (new_expires_at=%v, max=%v)",
			newExpiresAt.Format(time.RFC3339), maxExpiresAt.Format(time.RFC3339))
	} else {
		result.Reason = "normal_renewal"
	}

	// 执行续期
	oldExpiresAt := t.ExpiresAt
	t.ExpiresAt = newExpiresAt
	t.LastRenewAt = now
	s.lastRenewal[token] = now

	result.Renewed = true
	result.NewExpiresAt = newExpiresAt
	result.RemainingAfter = newExpiresAt.Sub(now)

	s.logger.Infow("Token续期成功",
		"token", token[:8]+"...",
		"old_expires_at", oldExpiresAt.Format(time.RFC3339),
		"new_expires_at", newExpiresAt.Format(time.RFC3339),
		"remaining_before", result.RemainingBefore.String(),
		"remaining_after", result.RemainingAfter.String(),
		"renewal_reason", result.Reason,
	)

	return result
}

// RefreshToken 刷新Token有效期（兼容旧接口）
// 如果Token有效，延长其过期时间并返回新的过期时间
func (s *WebLoginService) RefreshToken(token string) (time.Time, bool) {
	result := s.RenewTokenIfNeeded(token)
	return result.NewExpiresAt, result.Renewed
}

// GetTokenInfo 获取Token信息
func (s *WebLoginService) GetTokenInfo(token string) (*LoginToken, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, exists := s.tokens[token]
	if !exists {
		return nil, false
	}

	if time.Now().After(t.ExpiresAt) {
		return nil, false
	}

	return t, true
}

// GetTokenRemainingTime 获取Token剩余有效期
func (s *WebLoginService) GetTokenRemainingTime(token string) time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, exists := s.tokens[token]
	if !exists {
		return 0
	}

	if time.Now().After(t.ExpiresAt) {
		return 0
	}

	return t.ExpiresAt.Sub(time.Now())
}

// IsInRenewalCooldown 检查token是否处于续期冷却期
func (s *WebLoginService) IsInRenewalCooldown(token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	lastRenew, exists := s.lastRenewal[token]
	if !exists {
		return false
	}

	return time.Now().Sub(lastRenew) < s.renewalCooldown
}

// Logout 登出
func (s *WebLoginService) Logout(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.tokens, token)
	delete(s.lastRenewal, token)
}

// extractRealIP 提取真实IP
// 优先取X-Forwarded-For第一个IP，自动排除常见内网IP段
func (s *WebLoginService) extractRealIP(clientIP string) string {
	// 简单处理：直接返回clientIP
	// 实际项目中可能需要解析X-Forwarded-For头
	return clientIP
}

// isIPBanned 检查IP是否被封禁
func (s *WebLoginService) isIPBanned(ip string) bool {
	// 读取BanIP.ini文件
	if _, err := os.Stat(s.banIPFile); os.IsNotExist(err) {
		return false
	}

	file, err := os.Open(s.banIPFile)
	if err != nil {
		s.logger.Errorw("读取BanIP.ini失败", "error", err)
		return false
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		// 格式: [10]{IP}
		if strings.Contains(line, ip) {
			return true
		}
	}

	return false
}

// banIP 封禁IP
func (s *WebLoginService) banIP(ip string) error {
	// 追加到BanIP.ini
	file, err := os.OpenFile(s.banIPFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer file.Close()

	// 格式: [10]{IP}
	line := fmt.Sprintf("[10]{%s}\n", ip)
	_, err = file.WriteString(line)
	if err != nil {
		return err
	}

	s.logger.Warnw("IP被封禁", "ip", ip)
	return nil
}

// recordFailedAttempt 记录失败尝试
func (s *WebLoginService) recordFailedAttempt(ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.failedAttempts[ip]++
	count := s.failedAttempts[ip]

	// 累计≥10次则封禁
	if count >= 10 {
		if err := s.banIP(ip); err != nil {
			s.logger.Errorw("封禁IP失败", "ip", ip, "error", err)
		}
		// 清除内存计数
		delete(s.failedAttempts, ip)
	}
}

// clearFailedAttempts 清除失败计数
func (s *WebLoginService) clearFailedAttempts(ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.failedAttempts, ip)
}

// validateTopo 校验TOPO
// 严格校验8位纯数字，匹配当前时区当日yyyymmdd格式
func (s *WebLoginService) validateTopo(topo string) bool {
	// 校验长度
	if len(topo) != 8 {
		return false
	}

	// 校验纯数字
	for _, ch := range topo {
		if ch < '0' || ch > '9' {
			return false
		}
	}

	// 获取当前时区时间
	location := time.FixedZone("Local", s.timezoneOffset*3600)
	now := time.Now().In(location)

	// 格式化为yyyymmdd
	expected := now.Format("20060102")

	return topo == expected
}

// generateToken 生成登录凭证
func (s *WebLoginService) generateToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// 回退到时间戳
		return fmt.Sprintf("token_%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// cleanupTask 定期清理过期凭证
func (s *WebLoginService) cleanupTask() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for token, t := range s.tokens {
			if now.After(t.ExpiresAt) {
				delete(s.tokens, token)
			}
		}
		s.mu.Unlock()
	}
}

// GetBanIPList 获取封禁IP列表
func (s *WebLoginService) GetBanIPList() []string {
	if _, err := os.Stat(s.banIPFile); os.IsNotExist(err) {
		return []string{}
	}

	file, err := os.Open(s.banIPFile)
	if err != nil {
		s.logger.Errorw("读取BanIP.ini失败", "error", err)
		return []string{}
	}
	defer file.Close()

	var ips []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		// 解析 [10]{IP} 格式
		if start := strings.Index(line, "{"); start != -1 {
			if end := strings.Index(line[start:], "}"); end != -1 {
				ip := line[start+1 : start+end]
				ips = append(ips, ip)
			}
		}
	}

	return ips
}

// UnbanIP 解封IP
func (s *WebLoginService) UnbanIP(ip string) error {
	// 读取所有IP
	ips := s.GetBanIPList()

	// 过滤掉要解封的IP
	var newLines []string
	for _, existingIP := range ips {
		if existingIP != ip {
			newLines = append(newLines, fmt.Sprintf("[10]{%s}", existingIP))
		}
	}

	// 写回文件
	content := strings.Join(newLines, "\n")
	if len(newLines) > 0 {
		content += "\n"
	}

	if err := os.WriteFile(s.banIPFile, []byte(content), 0644); err != nil {
		return err
	}

	// 清除内存失败计数
	s.clearFailedAttempts(ip)

	s.logger.Infow("IP已解封", "ip", ip)
	return nil
}

// isPrivateIP 检查是否为内网IP
func isPrivateIP(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	// 检查常见内网网段
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16",
	}

	for _, cidr := range privateRanges {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if ipNet.Contains(parsedIP) {
			return true
		}
	}

	return false
}
