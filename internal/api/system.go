// 其他系统接口
package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"HanChat-QQBotManager/internal/services"
	"HanChat-QQBotManager/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"go.uber.org/zap"
)

type SystemStatusCache struct {
	mu             sync.RWMutex
	networkUpload  float64
	networkDownload float64
	cpuUsage       float64
	memTotal       uint64
	memUsed        uint64
	memAvailable   uint64
	memUsagePercent float64
	prevNetIO      []net.IOCountersStat
	prevTime       time.Time
}

var statusCache *SystemStatusCache
var cacheOnce sync.Once

func NewSystemStatusCache() *SystemStatusCache {
	return &SystemStatusCache{}
}

func (s *SystemStatusCache) Start(interval time.Duration) {
	s.update()
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			s.update()
		}
	}()
}

func (s *SystemStatusCache) update() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(s.prevTime).Seconds()

	if elapsed <= 0 {
		elapsed = 1
	}

	currIO, _ := net.IOCounters(false)
	currUpload := uint64(0)
	currDownload := uint64(0)
	for _, io := range currIO {
		currUpload += io.BytesSent
		currDownload += io.BytesRecv
	}

	if len(s.prevNetIO) > 0 {
		prevUpload := uint64(0)
		prevDownload := uint64(0)
		for _, io := range s.prevNetIO {
			prevUpload += io.BytesSent
			prevDownload += io.BytesRecv
		}
		s.networkUpload = float64(currUpload-prevUpload) / elapsed
		s.networkDownload = float64(currDownload-prevDownload) / elapsed
	}

	s.prevNetIO = currIO
	s.prevTime = now

	cpuPercent, _ := cpu.Percent(0, false)
	if len(cpuPercent) > 0 {
		s.cpuUsage = cpuPercent[0]
	}

	memInfo, _ := mem.VirtualMemory()
	if memInfo != nil {
		s.memTotal = memInfo.Total
		s.memUsed = memInfo.Used
		s.memAvailable = memInfo.Available
		s.memUsagePercent = memInfo.UsedPercent
	}
}

func (s *SystemStatusCache) GetNetworkSpeed() (upload, download float64) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.networkUpload, s.networkDownload
}

func (s *SystemStatusCache) GetSystemStatus() (cpuUsage float64, memTotal, memUsed, memAvailable uint64, memUsagePercent float64) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cpuUsage, s.memTotal, s.memUsed, s.memAvailable, s.memUsagePercent
}

// RegisterSystemRoutes 注册系统信息相关路由
func RegisterSystemRoutes(r *gin.RouterGroup, reverseWS *services.ReverseWebSocketService, base *zap.Logger) {
	logger := base.With(zap.String("module", "api.system")).Sugar()

	cacheOnce.Do(func() {
		statusCache = NewSystemStatusCache()
		statusCache.Start(2 * time.Second)
	})

	// 获取版本信息 - 使用第一个在线账号
	r.GET("/version", func(c *gin.Context) {
		logger.Infow("获取版本信息", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "get_version_info", nil)
		if err != nil {
			utils.BadGateway(c, "获取版本信息失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 获取 bot 状态 - 使用第一个在线账号
	r.GET("/status", func(c *gin.Context) {
		logger.Infow("获取 bot 状态", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "get_status", nil)
		if err != nil {
			utils.BadGateway(c, "获取 bot 状态失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 设置在线状态 - 使用第一个在线账号
	r.POST("/online-status", func(c *gin.Context) {
		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid json body"})
			return
		}
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		// 兼容 camelCase
		status := body["status"]
		if status == nil {
			status = body["Status"]
		}
		ext := body["ext_status"]
		if ext == nil {
			ext = body["extStatus"]
		}
		battery := body["battery_status"]
		if battery == nil {
			battery = body["batteryStatus"]
		}
		logger.Infow("设置在线状态", "requestId", c.GetString("requestId"), "status", status, "ext", ext, "battery", battery)
		// 类型断言与默认值处理
		toInt := func(v interface{}, def int) int {
			switch t := v.(type) {
			case float64:
				return int(t)
			case int:
				return t
			default:
				return def
			}
		}
		
		params := map[string]interface{}{
			"status":  toInt(status, 1),
			"ext":     toInt(ext, 0),
			"battery": toInt(battery, 0),
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "set_online_status", params)
		if err != nil {
			utils.BadGateway(c, "设置在线状态失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// ==================== 补充缺失的系统接口 ====================

	// 获取 cookies - 使用第一个在线账号
	r.POST("/cookies", func(c *gin.Context) {
		// 兼容多种入参方式：JSON body、form、query
		domain := ""
		// 优先 JSON
		var body struct {
			Domain string `json:"domain"`
		}
		if err := c.ShouldBindJSON(&body); err == nil {
			domain = strings.TrimSpace(body.Domain)
		}
		// 其次表单
		if domain == "" {
			domain = strings.TrimSpace(c.PostForm("domain"))
		}
		// 再次 query 兜底
		if domain == "" {
			domain = strings.TrimSpace(c.Query("domain"))
		}

		if domain == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: domain"})
			return
		}

		logger.Infow("获取cookies(POST)", "requestId", c.GetString("requestId"), "domain", domain)

		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}

		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}

		res, err := reverseWS.CallBotAPI(targetSelfID, "get_cookies", map[string]interface{}{
			"domain": domain,
		})
		if err != nil {
			utils.BadGateway(c, "获取 cookies 失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 兼容：GET 方式获取 cookies，使用 query 参数 (?domain=qun.qq.com)
	r.GET("/cookies", func(c *gin.Context) {
		domain := strings.TrimSpace(c.Query("domain"))
		if domain == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: domain"})
			return
		}
		logger.Infow("获取cookies(GET)", "requestId", c.GetString("requestId"), "domain", domain)
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "get_cookies", map[string]interface{}{
			"domain": domain,
		})
		if err != nil {
			utils.BadGateway(c, "获取 cookies 失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 清理缓存（已废弃）- 使用第一个在线账号
	r.GET("/clean-cache", func(c *gin.Context) {
		logger.Infow("清理缓存（已废弃）", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "clean_cache", nil)
		if err != nil {
			utils.BadGateway(c, "清理缓存失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "缓存已清理（该接口已废弃）"})
	})

	// 重启（已废弃）- 使用第一个在线账号
	r.POST("/restart", func(c *gin.Context) {
		logger.Infow("重启（已废弃）", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "set_restart", nil)
		if err != nil {
			utils.BadGateway(c, "重启失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res["data"], "message": "重启命令已发送（该接口已废弃）"})
	})

	// ==================== 其他功能接口 ====================

	// 图片 OCR - 使用第一个在线账号
	r.POST("/ocr-image", func(c *gin.Context) {
		var body struct {
			Image string `json:"image"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Image == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: image"})
			return
		}
		logger.Infow("图片OCR", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "ocr_image", map[string]interface{}{
			"image": body.Image,
		})
		if err != nil {
			utils.BadGateway(c, "图片 OCR 失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 获取图片 rkey - 使用第一个在线账号
	r.GET("/rkey", func(c *gin.Context) {
		logger.Infow("获取图片rkey", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "get_rkey", nil)
		if err != nil {
			utils.BadGateway(c, "获取图片 rkey 失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 获取推荐表情 - 使用第一个在线账号
	r.POST("/recommend-face", func(c *gin.Context) {
		var body struct {
			Word string `json:"word"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Word == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: word"})
			return
		}
		logger.Infow("获取推荐表情", "requestId", c.GetString("requestId"), "word", body.Word)
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "get_recommend_face", map[string]interface{}{
			"word": body.Word,
		})
		if err != nil {
			utils.BadGateway(c, "获取推荐表情失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 获取收藏表情 - 使用第一个在线账号
	r.GET("/custom-face", func(c *gin.Context) {
		logger.Infow("获取收藏表情", "requestId", c.GetString("requestId"))
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "fetch_custom_face", nil)
		if err != nil {
			utils.BadGateway(c, "获取收藏表情失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 发送 Protobuf 数据包 - 使用第一个在线账号
	r.POST("/send-pb", func(c *gin.Context) {
		var body struct {
			Cmd string `json:"cmd"`
			Hex string `json:"hex"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Cmd == "" || body.Hex == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填参数: cmd, hex"})
			return
		}
		logger.Infow("发送Protobuf数据包", "requestId", c.GetString("requestId"), "cmd", body.Cmd)
		
		// 获取第一个在线账号
		accounts := reverseWS.GetAccountManager().GetAllAccounts()
		var targetSelfID string
		for selfID, account := range accounts {
			if account.IsOnline() {
				targetSelfID = selfID
				break
			}
		}
		
		if targetSelfID == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"message": "没有在线的账号",
			})
			return
		}
		
		res, err := reverseWS.CallBotAPI(targetSelfID, "send_pb", map[string]interface{}{
			"cmd": body.Cmd,
			"hex": body.Hex,
		})
		if err != nil {
			utils.BadGateway(c, "发送 Protobuf 数据包失败（账号: "+targetSelfID+"）: "+err.Error())
			return
		}
		respondWithData(c, res)
	})

	// 获取服务器状态 - 不需要调用Bot API
	r.GET("/server-status", func(c *gin.Context) {
		logger.Infow("获取服务器状态", "requestId", c.GetString("requestId"))

		// 获取主机信息
		hostInfo, err := host.Info()
		if err != nil {
			logger.Errorw("获取主机信息失败", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "获取主机信息失败: " + err.Error()})
			return
		}

		// 获取CPU信息
		cpuInfo, err := cpu.Info()
		if err != nil {
			logger.Errorw("获取CPU信息失败", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "获取CPU信息失败: " + err.Error()})
			return
		}

		// 从缓存获取CPU、内存、网络数据
		cpuUsage, memTotal, memUsed, memAvailable, memUsagePercent := statusCache.GetSystemStatus()

		// 获取网络IO统计
		netIO, err := net.IOCounters(false)
		if err != nil {
			logger.Errorw("获取网络信息失败", "error", err)
			netIO = []net.IOCountersStat{}
		}

		// 构建响应数据
		cpuModel := "Unknown"
		if len(cpuInfo) > 0 {
			cpuModel = cpuInfo[0].ModelName
		}

		netUpload := uint64(0)
		netDownload := uint64(0)
		if len(netIO) > 0 {
			// 计算所有网络接口的总流量
			for _, io := range netIO {
				netUpload += io.BytesSent
				netDownload += io.BytesRecv
			}
		}

		data := gin.H{
			"os": gin.H{
				"platform":        hostInfo.Platform,
				"platformFamily":  hostInfo.PlatformFamily,
				"platformVersion": hostInfo.PlatformVersion,
				"kernelVersion":   hostInfo.KernelVersion,
				"os":              hostInfo.OS,
			},
			"cpu": gin.H{
				"model":        cpuModel,
				"cores":        runtime.NumCPU(),
				"usagePercent": cpuUsage,
			},
			"memory": gin.H{
				"total":        memTotal,
				"used":         memUsed,
				"available":    memAvailable,
				"usagePercent": memUsagePercent,
			},
			"network": gin.H{
				"uploadBytes":   netUpload,
				"downloadBytes": netDownload,
			},
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
	})

	// 生成WebSocket令牌 - 不需要调用Bot API
	r.POST("/generate-ws-token", func(c *gin.Context) {
		logger.Infow("生成WebSocket令牌", "requestId", c.GetString("requestId"))

		// 获取请求体中的时间戳
		var body struct {
			Timestamp int64 `json:"timestamp"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "参数错误"})
			return
		}

		// 如果没有提供时间戳，默认使用当前时间+1小时
		if body.Timestamp == 0 {
			body.Timestamp = time.Now().Add(1 * time.Hour).Unix()
		}

		// 获取WebSocket代理密钥（从环境变量获取，必须配置）
		proxyKey := os.Getenv("WEBSOCKET_PROXY_KEY")
		if proxyKey == "" {
			logger.Errorw("FATAL: WEBSOCKET_PROXY_KEY环境变量未设置",
				"error", "为了安全，必须设置WEBSOCKET_PROXY_KEY环境变量")
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "服务器配置错误：代理密钥未配置。请联系管理员设置WEBSOCKET_PROXY_KEY环境变量",
			})
			return
		}

		// 验证密钥长度
		if len(proxyKey) < 16 {
			logger.Errorw("FATAL: WEBSOCKET_PROXY_KEY长度不足",
				"key_length", len(proxyKey),
				"error", "WEBSOCKET_PROXY_KEY长度必须至少为16个字符")
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "服务器配置错误：代理密钥长度不足。密钥长度必须至少为16个字符",
			})
			return
		}

		// 加密时间戳
		timestampStr := strconv.FormatInt(body.Timestamp, 10)
		encryptedToken, err := utils.AESEncrypt(proxyKey, timestampStr)
		if err != nil {
			logger.Errorw("加密WebSocket令牌失败", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "生成令牌失败"})
			return
		}

		// 返回加密后的令牌
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token":     encryptedToken,
				"expiresAt": body.Timestamp,
				"expiresIn": body.Timestamp - time.Now().Unix(),
				"encrypted": true,
			},
			"message": "WebSocket令牌生成成功",
		})
	})

	// 获取系统信息（包含后端版本）
	r.GET("/info", func(c *gin.Context) {
		logger.Infow("获取系统信息", "requestId", c.GetString("requestId"))

		version := os.Getenv("LLBOT_VERSION")
		if version == "" {
			version = "V26.5.26"
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"version": version,
				"name":    "LLBot",
			},
		})
	})

	r.GET("/status-stream", func(c *gin.Context) {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")

		ctx := c.Request.Context()

		cpuInfo, _ := cpu.Info()
		cpuModel := "Unknown"
		if len(cpuInfo) > 0 {
			cpuModel = cpuInfo[0].ModelName
		}

		c.Stream(func(w io.Writer) bool {
			cpuPercent, _ := cpu.Percent(0, false)
			cpuUsage := 0.0
			if len(cpuPercent) > 0 {
				cpuUsage = cpuPercent[0]
			}

			memInfo, _ := mem.VirtualMemory()
			var memData gin.H
			if memInfo != nil {
				memData = gin.H{
					"total":        memInfo.Total,
					"used":         memInfo.Used,
					"available":    memInfo.Available,
					"usagePercent": memInfo.UsedPercent,
				}
			} else {
				memData = gin.H{
					"total":        uint64(0),
					"used":         uint64(0),
					"available":    uint64(0),
					"usagePercent": 0.0,
				}
			}

			netIO, _ := net.IOCounters(false)
			netUpload := uint64(0)
			netDownload := uint64(0)
			for _, io := range netIO {
				netUpload += io.BytesSent
				netDownload += io.BytesRecv
			}

			data := gin.H{
				"cpu": gin.H{
					"model":        cpuModel,
					"cores":        runtime.NumCPU(),
					"usagePercent": cpuUsage,
				},
				"memory": memData,
				"network": gin.H{
					"uploadBytes":   netUpload,
					"downloadBytes": netDownload,
				},
			}

			jsonData, err := json.Marshal(data)
			if err != nil {
				return false
			}

			c.SSEvent("status", string(jsonData))
			c.Writer.Flush()

			select {
			case <-ctx.Done():
				return false
			case <-time.After(5 * time.Second):
				return true
			}
		})
	})

	r.GET("/network-speed", func(c *gin.Context) {
		logger.Infow("获取网络速度", "requestId", c.GetString("requestId"))

		uploadSpeed, downloadSpeed := statusCache.GetNetworkSpeed()

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"uploadSpeed":   uploadSpeed,
				"downloadSpeed": downloadSpeed,
			},
		})
	})
}
