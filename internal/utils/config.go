package utils

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// ServerCORS CORS配置
type ServerCORS struct {
	Enabled bool   `mapstructure:"enabled"`
	Origin  string `mapstructure:"origin"`
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port int        `mapstructure:"port"`
	Host string     `mapstructure:"host"`
	CORS ServerCORS `mapstructure:"cors"`
}

// LoggerConfig 日志配置
type LoggerConfig struct {
	Level    string `mapstructure:"level"`
	Format   string `mapstructure:"format"`
	Colorize bool   `mapstructure:"colorize"`
	MaxFiles string `mapstructure:"maxFiles"`
	MaxSize  string `mapstructure:"maxSize"`
	Dir      string `mapstructure:"dir"`
}

// WebSocketConfig WebSocket配置（反向WS）
type WebSocketConfig struct {
	Authorization  string `mapstructure:"authorization"`  // 全局统一Token
	Port           int    `mapstructure:"port"`           // 反向WS监听端口
	MaxConnections int    `mapstructure:"maxConnections"` // 最大连接数限制
}

// PluginConfig 插件配置
type PluginConfig struct {
	Workers   int `mapstructure:"workers"`
	QueueSize int `mapstructure:"queueSize"`
}

// WebLoginConfig Web登录配置
type WebLoginConfig struct {
	Username       string `mapstructure:"username"`
	Password       string `mapstructure:"password"`
	TimezoneOffset int    `mapstructure:"timezoneOffset"`
}

// Config 全局配置
type Config struct {
	Env        string          `mapstructure:"-"`
	Server     ServerConfig    `mapstructure:"server"`
	Logger     LoggerConfig    `mapstructure:"logger"`
	Websocket  WebSocketConfig `mapstructure:"websocket"`
	Plugin     PluginConfig    `mapstructure:"plugin"`
	WebLogin   WebLoginConfig  `mapstructure:"weblogin"`
}

// LoadConfig 加载配置
func LoadConfig() *Config {
	// 加载 .env 文件（如果存在）
	if err := godotenv.Load(); err != nil {
		log.Printf("[config] .env文件未找到，使用默认值")
	}

	v := viper.New()

	// 服务器配置
	v.SetDefault("server.port", getEnvInt("SERVER_PORT", 8080))
	v.SetDefault("server.host", getEnvString("SERVER_HOST", "0.0.0.0"))
	v.SetDefault("server.cors.enabled", getEnvBool("SERVER_CORS_ENABLED", true))
	v.SetDefault("server.cors.origin", getEnvString("SERVER_CORS_ORIGIN", "*"))

	// 日志配置
	v.SetDefault("logger.level", getEnvString("LOGGER_LEVEL", "info"))
	v.SetDefault("logger.format", getEnvString("LOGGER_FORMAT", "json"))
	v.SetDefault("logger.colorize", getEnvBool("LOGGER_COLORIZE", true))
	v.SetDefault("logger.maxFiles", getEnvString("LOGGER_MAX_FILES", "14d"))
	v.SetDefault("logger.maxSize", getEnvString("LOGGER_MAX_SIZE", "20m"))
	v.SetDefault("logger.dir", getEnvString("LOGGER_DIR", "./logs"))

	// 反向WebSocket配置
	v.SetDefault("websocket.authorization", getEnvString("WEBSOCKET_AUTHORIZATION", ""))
	v.SetDefault("websocket.port", getEnvInt("WEBSOCKET_PORT", 8765))
	v.SetDefault("websocket.maxConnections", getEnvInt("WEBSOCKET_MAX_CONNECTIONS", 10))

	// 插件配置
	v.SetDefault("plugin.workers", getEnvInt("PLUGIN_WORKERS", 8))
	v.SetDefault("plugin.queueSize", getEnvInt("PLUGIN_QUEUE_SIZE", 1024))

	// Web登录配置
	v.SetDefault("weblogin.username", getEnvString("WEB_LOGIN_USER", "admin"))
	v.SetDefault("weblogin.password", getEnvString("WEB_LOGIN_PWD", ""))
	v.SetDefault("weblogin.timezoneOffset", getEnvInt("TIMEZONE_OFFSET", 8))

	// 环境变量覆盖
	v.SetEnvPrefix("APP")
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		log.Fatalf("[config] 解析配置失败: %v", err)
	}

	// 额外读取常见无前缀环境变量
	if host := os.Getenv("HOST"); host != "" {
		cfg.Server.Host = host
	}
	if port := os.Getenv("PORT"); port != "" {
		if p, err := strconv.Atoi(port); err == nil {
			cfg.Server.Port = p
		}
	}

	// Env
	env := os.Getenv("NODE_ENV")
	if env == "" {
		env = os.Getenv("APP_ENV")
	}
	if env == "" {
		env = "development"
	}
	cfg.Env = env

	log.Printf("[config] 配置加载完成，服务器端口: %d, CORS: %v", cfg.Server.Port, cfg.Server.CORS.Enabled)

	return &cfg
}

// 环境变量辅助函数
func getEnvString(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}
