package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// DistributedLock 基于文件的分布式锁
// 用于多实例部署时防止定时任务重复执行
type DistributedLock struct {
	mu         sync.Mutex
	lockDir    string
	instanceID string
}

// LockInfo 锁信息
type LockInfo struct {
	InstanceID string    `json:"instance_id"`
	AcquiredAt time.Time `json:"acquired_at"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// NewDistributedLock 创建分布式锁
func NewDistributedLock(lockDir string) *DistributedLock {
	return &DistributedLock{
		lockDir:    lockDir,
		instanceID: generateInstanceID(),
	}
}

// generateInstanceID 生成唯一实例ID
func generateInstanceID() string {
	return fmt.Sprintf("%d_%d", time.Now().UnixNano(), os.Getpid())
}

// Acquire 获取锁
// lockName: 锁名称
// ttl: 锁的过期时间
// 返回值: 是否成功获取锁，如果是当前实例持有的锁也会返回true
func (dl *DistributedLock) Acquire(lockName string, ttl time.Duration) bool {
	dl.mu.Lock()
	defer dl.mu.Unlock()

	// 确保锁目录存在
	if err := os.MkdirAll(dl.lockDir, 0755); err != nil {
		return false
	}

	lockFile := filepath.Join(dl.lockDir, lockName+".lock")

	// 检查锁是否已存在
	if info, err := dl.readLockInfo(lockFile); err == nil {
		// 锁存在，检查是否过期
		if time.Now().Before(info.ExpiresAt) {
			// 锁未过期，检查是否是当前实例持有的
			if info.InstanceID == dl.instanceID {
				// 是当前实例持有的锁，更新过期时间（续期）
				return dl.writeLockInfo(lockFile, ttl)
			}
			// 是其他实例持有的锁，且未过期
			return false
		}
		// 锁已过期，可以尝试获取
	}

	// 创建新锁
	return dl.writeLockInfo(lockFile, ttl)
}

// Release 释放锁
func (dl *DistributedLock) Release(lockName string) bool {
	dl.mu.Lock()
	defer dl.mu.Unlock()

	lockFile := filepath.Join(dl.lockDir, lockName+".lock")

	// 检查锁是否是当前实例持有的
	if info, err := dl.readLockInfo(lockFile); err == nil {
		if info.InstanceID != dl.instanceID {
			// 不是当前实例持有的锁，不能释放
			return false
		}
	}

	// 删除锁文件
	if err := os.Remove(lockFile); err != nil {
		return false
	}

	return true
}

// IsHeld 检查锁是否被当前实例持有
func (dl *DistributedLock) IsHeld(lockName string) bool {
	lockFile := filepath.Join(dl.lockDir, lockName+".lock")

	info, err := dl.readLockInfo(lockFile)
	if err != nil {
		return false
	}

	// 检查锁是否过期
	if time.Now().After(info.ExpiresAt) {
		return false
	}

	// 检查是否是当前实例持有的
	return info.InstanceID == dl.instanceID
}

// Renew 续期锁
func (dl *DistributedLock) Renew(lockName string, ttl time.Duration) bool {
	dl.mu.Lock()
	defer dl.mu.Unlock()

	lockFile := filepath.Join(dl.lockDir, lockName+".lock")

	// 检查锁是否是当前实例持有的
	info, err := dl.readLockInfo(lockFile)
	if err != nil {
		return false
	}

	if info.InstanceID != dl.instanceID {
		return false
	}

	// 更新过期时间
	return dl.writeLockInfo(lockFile, ttl)
}

// readLockInfo 读取锁信息
func (dl *DistributedLock) readLockInfo(lockFile string) (*LockInfo, error) {
	data, err := os.ReadFile(lockFile)
	if err != nil {
		return nil, err
	}

	var info LockInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	return &info, nil
}

// writeLockInfo 写入锁信息
func (dl *DistributedLock) writeLockInfo(lockFile string, ttl time.Duration) bool {
	info := LockInfo{
		InstanceID: dl.instanceID,
		AcquiredAt: time.Now(),
		ExpiresAt:  time.Now().Add(ttl),
	}

	data, err := json.Marshal(info)
	if err != nil {
		return false
	}

	// 使用临时文件然后重命名，确保原子性
	tempFile := lockFile + ".tmp"
	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		return false
	}

	if err := os.Rename(tempFile, lockFile); err != nil {
		os.Remove(tempFile)
		return false
	}

	return true
}

// CleanupExpiredLocks 清理过期的锁文件
func (dl *DistributedLock) CleanupExpiredLocks() {
	entries, err := os.ReadDir(dl.lockDir)
	if err != nil {
		return
	}

	now := time.Now()
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		lockFile := filepath.Join(dl.lockDir, entry.Name())
		if info, err := dl.readLockInfo(lockFile); err == nil {
			if now.After(info.ExpiresAt) {
				os.Remove(lockFile)
			}
		}
	}
}

// GetInstanceID 获取当前实例ID
func (dl *DistributedLock) GetInstanceID() string {
	return dl.instanceID
}
