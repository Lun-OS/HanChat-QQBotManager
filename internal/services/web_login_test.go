package services

import (
	"sync"
	"testing"
	"time"

	"go.uber.org/zap"
)

func newTestWebLoginService() *WebLoginService {
	logger := zap.NewNop().Sugar()
	svc := &WebLoginService{
		logger:          logger,
		username:        "test",
		password:        "test",
		timezoneOffset:  8,
		banIPFile:       "/tmp/test_banip.ini",
		failedAttempts:  make(map[string]int),
		tokens:          make(map[string]*LoginToken),
		tokenDuration:   1 * time.Hour,
		minRenewalRatio:  0.5,
		maxRenewalRatio:  1.0,
		renewalCooldown:  1 * time.Second,
		lastRenewal:     make(map[string]time.Time),
	}
	return svc
}

func resetServiceConfig(svc *WebLoginService) {
	svc.tokenDuration = 1 * time.Hour
	svc.minRenewalRatio = 0.5
	svc.maxRenewalRatio = 1.0
	svc.renewalCooldown = 1 * time.Second
}

func TestTokenRenewal_NormalRenewal(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now,
		ExpiresAt:   now.Add(20 * time.Minute), // 剩余20分钟（<50%，触发续期）
		LastRenewAt: now,
	}
	svc.mu.Unlock()

	result := svc.RenewTokenIfNeeded(token)

	if !result.Renewed {
		t.Error("Token应该被续期，但实际没有续期")
	}

	// 续期是基于当前时间 + tokenDuration，而不是在原过期时间基础上
	expectedNewExpires := now.Add(svc.tokenDuration)
	if result.NewExpiresAt.Sub(expectedNewExpires) > time.Second {
		t.Errorf("续期后过期时间应接近当前时间+1小时，expected~%v, actual=%v", expectedNewExpires, result.NewExpiresAt)
	}

	t.Logf("续期前剩余时间: %v, 续期后剩余时间: %v, 原因: %s",
		result.RemainingBefore, result.RemainingAfter, result.Reason)
}

func TestTokenRenewal_SufficientTime(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-30 * time.Minute),
		ExpiresAt:   now.Add(30 * time.Minute), // 剩余30分钟（>50%，不触发续期）
		LastRenewAt: now.Add(-30 * time.Minute),
	}
	svc.mu.Unlock()

	result := svc.RenewTokenIfNeeded(token)

	if result.Renewed {
		t.Error("剩余时间充足时不应续期")
	}

	t.Logf("续期状态: %v, 原因: %s", result.Renewed, result.Reason)
}

func TestTokenRenewal_Expiration(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-2 * time.Hour),
		ExpiresAt:   now.Add(-1 * time.Minute), // 已过期
		LastRenewAt: now.Add(-1 * time.Hour),
	}
	svc.mu.Unlock()

	result := svc.RenewTokenIfNeeded(token)

	if result.Renewed {
		t.Error("已过期的Token不应续期")
	}

	if result.Reason != "token_expired" {
		t.Errorf("过期Token的原因应为'token_expired'，实际: %s", result.Reason)
	}

	svc.mu.RLock()
	if _, exists := svc.tokens[token]; exists {
		t.Error("已过期的Token应该被删除")
	}
	svc.mu.RUnlock()
}

func TestTokenRenewal_Cooldown(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-50 * time.Minute),
		ExpiresAt:   now.Add(10 * time.Minute), // 剩余10分钟（<50%）
		LastRenewAt: now.Add(-500 * time.Millisecond), // 刚续期过
	}
	svc.lastRenewal[token] = now.Add(-500 * time.Millisecond) // 冷却期500ms
	svc.mu.Unlock()

	result := svc.RenewTokenIfNeeded(token)

	if result.Renewed {
		t.Error("在冷却期内不应续期")
	}

	t.Logf("冷却期测试结果: renewed=%v, reason=%s", result.Renewed, result.Reason)
}

func TestTokenRenewal_MaxDuration(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.maxRenewalRatio = 1.0

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-110 * time.Minute),
		ExpiresAt:   now.Add(5 * time.Minute),
		LastRenewAt: now.Add(-2 * time.Minute),
	}
	svc.lastRenewal[token] = now.Add(-2 * time.Minute)
	svc.mu.Unlock()

	result := svc.RenewTokenIfNeeded(token)

	if !result.Renewed {
		t.Error("应该触发续期")
	}

	maxExpiresAt := now.Add(-110*time.Minute).Add(2 * time.Hour)
	if result.NewExpiresAt.After(maxExpiresAt) {
		t.Errorf("新过期时间不应超过最大有效期: max=%v, actual=%v", maxExpiresAt, result.NewExpiresAt)
	}

	t.Logf("最大有效期限制测试: new_expires_at=%v, max=%v, reason=%s",
		result.NewExpiresAt, maxExpiresAt, result.Reason)
}

func TestTokenRenewal_ConcurrentCalls(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-50 * time.Minute),
		ExpiresAt:   now.Add(10 * time.Minute), // 剩余10分钟（<50%）
		LastRenewAt: now,
	}
	svc.mu.Unlock()

	var wg sync.WaitGroup
	results := make([]*TokenRenewResult, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = svc.RenewTokenIfNeeded(token)
		}(i)
	}

	wg.Wait()

	renewedCount := 0
	for _, r := range results {
		if r.Renewed {
			renewedCount++
		}
	}

	// 由于并发控制和冷却期，最多只有一次续期
	t.Logf("并发测试: %d/10 次认为已续期", renewedCount)
}

func TestTokenRenewal_NotFoundToken(t *testing.T) {
	svc := newTestWebLoginService()

	result := svc.RenewTokenIfNeeded("nonexistent_token")

	if result.Renewed {
		t.Error("不存在的token不应续期")
	}

	if result.Reason != "token_not_found" {
		t.Errorf("不存在的token原因应为'token_not_found'，实际: %s", result.Reason)
	}
}

func TestRefreshToken_Compatibility(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-50 * time.Minute),
		ExpiresAt:   now.Add(10 * time.Minute),
		LastRenewAt: now,
	}
	svc.mu.Unlock()

	newExpiresAt, renewed := svc.RefreshToken(token)

	if !renewed {
		t.Error("RefreshToken应返回续期成功")
	}

	expectedExpires := now.Add(svc.tokenDuration)
	if newExpiresAt.Sub(expectedExpires) > time.Second {
		t.Errorf("新过期时间不正确: expected~%v, actual=%v", expectedExpires, newExpiresAt)
	}
}

func TestValidateToken_Expired(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now.Add(-2 * time.Hour),
		ExpiresAt:   now.Add(-1 * time.Minute), // 已过期
		LastRenewAt: now.Add(-1 * time.Hour),
	}
	svc.mu.Unlock()

	if svc.ValidateToken(token) {
		t.Error("已过期的token应验证失败")
	}
}

func TestValidateToken_Valid(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now,
		ExpiresAt:   now.Add(1 * time.Hour),
		LastRenewAt: now,
	}
	svc.mu.Unlock()

	if !svc.ValidateToken(token) {
		t.Error("有效的token应验证成功")
	}
}

func TestLogout_CleansRenewalRecord(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now,
		ExpiresAt:   now.Add(1 * time.Hour),
		LastRenewAt: now,
	}
	svc.lastRenewal[token] = now
	svc.mu.Unlock()

	svc.Logout(token)

	svc.mu.RLock()
	if _, exists := svc.tokens[token]; exists {
		t.Error("登出后token应被删除")
	}
	if _, exists := svc.lastRenewal[token]; exists {
		t.Error("登出后续期记录应被删除")
	}
	svc.mu.RUnlock()
}

func TestGetTokenRemainingTime(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()
	expectedRemaining := 30 * time.Minute

	svc.mu.Lock()
	svc.tokens[token] = &LoginToken{
		Token:       token,
		CreatedAt:   now,
		ExpiresAt:   now.Add(expectedRemaining),
		LastRenewAt: now,
	}
	svc.mu.Unlock()

	remaining := svc.GetTokenRemainingTime(token)

	if remaining < expectedRemaining-time.Second || remaining > expectedRemaining+time.Second {
		t.Errorf("剩余时间不正确: expected~%v, actual=%v", expectedRemaining, remaining)
	}
}

func TestIsInRenewalCooldown(t *testing.T) {
	svc := newTestWebLoginService()
	token := svc.generateToken()
	now := time.Now()

	svc.mu.Lock()
	svc.lastRenewal[token] = now.Add(-500 * time.Millisecond) // 刚续期
	svc.mu.Unlock()

	if !svc.IsInRenewalCooldown(token) {
		t.Error("刚续期的token应在冷却期内")
	}

	// 等待冷却期结束
	time.Sleep(600 * time.Millisecond)

	svc.mu.RLock()
	if svc.IsInRenewalCooldown(token) {
		t.Error("冷却期结束后应不在冷却期内")
	}
	svc.mu.RUnlock()
}