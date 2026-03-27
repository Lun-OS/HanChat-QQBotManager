package plugins

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"HanChat-QQBotManager/internal/utils"
	lua "github.com/yuin/gopher-lua"
	"go.uber.org/zap"
)

// HTTPHandlerTimeout HTTP处理器默认超时时间
const HTTPHandlerTimeout = 30 * time.Second

// HTTPHandler HTTP处理器
type HTTPHandler struct {
	PluginName string
	SelfID     string
	Handler    *lua.LFunction
	Methods    []string
}

// HTTPInterfaceManager HTTP接口管理器
type HTTPInterfaceManager struct {
	pluginsManager *Manager
	// handlers 存储格式: map[externalName]*HTTPHandler (全局接口)
	// 或 map[selfID/externalName]*HTTPHandler (账号隔离接口)
	handlers   map[string]*HTTPHandler
	handlersMu sync.RWMutex
	logger     *zap.SugaredLogger
}

// NewHTTPInterfaceManager 创建HTTP接口管理器
func NewHTTPInterfaceManager(pm *Manager, logger *zap.SugaredLogger) *HTTPInterfaceManager {
	return &HTTPInterfaceManager{
		pluginsManager: pm,
		handlers:       make(map[string]*HTTPHandler),
		logger:         logger,
	}
}

// RegisterHTTPHandler 注册HTTP处理器
// selfID为空字符串时表示全局接口，所有账号共享
// selfID不为空时表示账号隔离接口，只有指定账号可以访问
func (him *HTTPInterfaceManager) RegisterHTTPHandler(pluginName, selfID, externalName string, handler *lua.LFunction, methods []string) error {
	him.handlersMu.Lock()
	defer him.handlersMu.Unlock()

	// 构建存储key
	key := him.buildHandlerKey(selfID, externalName)

	if _, exists := him.handlers[key]; exists {
		return fmt.Errorf("外部接口名称 '%s' 已被注册", externalName)
	}

	him.handlers[key] = &HTTPHandler{
		PluginName: pluginName,
		SelfID:     selfID,
		Handler:    handler,
		Methods:    methods,
	}

	him.logger.Infow("HTTP接口已注册", "plugin", pluginName, "self_id", selfID, "externalName", externalName, "methods", methods)
	return nil
}

// UnregisterHTTPHandler 注销HTTP处理器
func (him *HTTPInterfaceManager) UnregisterHTTPHandler(externalName string, selfID string) error {
	him.handlersMu.Lock()
	defer him.handlersMu.Unlock()

	key := him.buildHandlerKey(selfID, externalName)
	if _, exists := him.handlers[key]; !exists {
		return fmt.Errorf("外部接口名称 '%s' 未注册", externalName)
	}

	delete(him.handlers, key)
	him.logger.Infow("HTTP接口已注销", "externalName", externalName, "selfID", selfID)
	return nil
}

// GetHandler 获取处理器
// selfID为空时只查找全局接口
// selfID不为空时优先查找账号隔离接口，找不到再查找全局接口
func (him *HTTPInterfaceManager) GetHandler(externalName string, selfID string) (*HTTPHandler, bool) {
	him.handlersMu.RLock()
	defer him.handlersMu.RUnlock()

	// 如果指定了selfID，先查找账号隔离接口
	if selfID != "" {
		key := him.buildHandlerKey(selfID, externalName)
		if handler, exists := him.handlers[key]; exists {
			return handler, true
		}
	}

	// 查找全局接口
	key := him.buildHandlerKey("", externalName)
	handler, exists := him.handlers[key]
	return handler, exists
}

// buildHandlerKey 构建处理器存储key
func (him *HTTPInterfaceManager) buildHandlerKey(selfID, externalName string) string {
	if selfID == "" {
		return externalName
	}
	return selfID + "/" + externalName
}

// ListHandlers 列出所有处理器
func (him *HTTPInterfaceManager) ListHandlers() map[string]*HTTPHandler {
	him.handlersMu.RLock()
	defer him.handlersMu.RUnlock()

	result := make(map[string]*HTTPHandler)
	for k, v := range him.handlers {
		result[k] = v
	}
	return result
}

// HandleHTTPRequest 处理HTTP请求（带超时控制）
func (him *HTTPInterfaceManager) HandleHTTPRequest(c *utils.HTTPRequestContext) (*utils.HTTPResponse, error) {
	handler, exists := him.GetHandler(c.Path, c.SelfID)
	if !exists {
		return nil, fmt.Errorf("接口不存在: %s", c.Path)
	}

	methodSupported := false
	for _, method := range handler.Methods {
		if strings.ToUpper(method) == strings.ToUpper(c.Method) {
			methodSupported = true
			break
		}
	}

	if !methodSupported {
		return nil, fmt.Errorf("不支持的请求方法: %s", c.Method)
	}

	// 在新的多账号架构中，通过账号容器查找插件实例
	instance := him.pluginsManager.getPluginInstance(handler.SelfID, handler.PluginName)
	if instance == nil {
		return nil, fmt.Errorf("插件未运行: %s (账号: %s)", handler.PluginName, handler.SelfID)
	}

	// 设置反向WebSocket服务（插件需要通过它调用Bot API）
	instance.reverseWS = him.pluginsManager.reverseWS
	instance.SelfID = handler.SelfID

	L := instance.L

	// 创建带超时的上下文，用于中断Lua执行
	ctx, cancel := context.WithTimeout(context.Background(), HTTPHandlerTimeout)
	defer cancel()

	// 设置Lua状态机的上下文，使其可以被中断
	L.SetContext(ctx)

	resultChan := make(chan *utils.HTTPResponse, 1)
	errorChan := make(chan error, 1)
	doneChan := make(chan struct{})

	go func() {
		defer close(doneChan)
		// 确保在goroutine结束时清理上下文
		defer L.RemoveContext()
		defer func() {
			if r := recover(); r != nil {
				errorChan <- fmt.Errorf("处理器panic: %v", r)
			}
		}()

		instance.mu.Lock()
		defer instance.mu.Unlock()

		L.Push(handler.Handler)

		ctxTable := L.NewTable()
		L.SetField(ctxTable, "method", lua.LString(c.Method))
		L.SetField(ctxTable, "path", lua.LString(c.Path))

		queryTable := L.NewTable()
		for k, v := range c.Query {
			L.SetField(queryTable, k, lua.LString(v))
		}
		L.SetField(ctxTable, "query", queryTable)

		headersTable := L.NewTable()
		for k, v := range c.Headers {
			L.SetField(headersTable, k, lua.LString(v))
		}
		L.SetField(ctxTable, "headers", headersTable)

		L.SetField(ctxTable, "body", lua.LString(c.Body))
		L.SetField(ctxTable, "remote_addr", lua.LString(c.RemoteAddr))
		L.SetField(ctxTable, "self_id", lua.LString(c.SelfID))

		L.Push(ctxTable)

		if err := L.PCall(1, 1, nil); err != nil {
			// 检查是否是上下文取消导致的错误
			if ctx.Err() != nil {
				errorChan <- fmt.Errorf("执行被中断: %w", ctx.Err())
			} else {
				errorChan <- fmt.Errorf("执行处理器失败: %w", err)
			}
			return
		}

		ret := L.Get(-1)
		L.Pop(1)

		if ret == lua.LNil {
			// 使用内存池获取响应对象
			resp := utils.GetHTTPResponseGlobal()
			resp.StatusCode = http.StatusOK
			resp.Body = ""
			resultChan <- resp
			return
		}

		if ret.Type() == lua.LTTable {
			resultTable := ret.(*lua.LTable)

			// 使用内存池获取响应对象
			resp := utils.GetHTTPResponseGlobal()

			statusCode := http.StatusOK
			if statusVal := L.GetField(resultTable, "status"); statusVal != lua.LNil {
				if num, ok := statusVal.(lua.LNumber); ok {
					statusCode = int(num)
				}
			}
			resp.StatusCode = statusCode

			// 清空并重用headers map
			for k := range resp.Headers {
				delete(resp.Headers, k)
			}

			if headersVal := L.GetField(resultTable, "headers"); headersVal.Type() == lua.LTTable {
				headersTable := headersVal.(*lua.LTable)
				headersTable.ForEach(func(key lua.LValue, value lua.LValue) {
					if key.Type() == lua.LTString && value.Type() == lua.LTString {
						resp.Headers[key.String()] = value.String()
					}
				})
			}

			body := ""
			if bodyVal := L.GetField(resultTable, "body"); bodyVal.Type() == lua.LTString {
				body = bodyVal.String()
			}
			resp.Body = body

			resultChan <- resp
			return
		}

		if ret.Type() == lua.LTString {
			// 使用内存池获取响应对象
			resp := utils.GetHTTPResponseGlobal()
			resp.StatusCode = http.StatusOK
			resp.Body = ret.String()
			resultChan <- resp
			return
		}

		// 使用内存池获取响应对象
		resp := utils.GetHTTPResponseGlobal()
		resp.StatusCode = http.StatusOK
		resp.Body = ""
		resultChan <- resp
	}()

	select {
	case result := <-resultChan:
		return result, nil
	case err := <-errorChan:
		return nil, err
	case <-ctx.Done():
		// 等待goroutine完成，确保资源清理
		<-doneChan
		him.logger.Warnw("HTTP请求处理超时",
			"plugin", handler.PluginName,
			"self_id", handler.SelfID,
			"path", c.Path,
			"timeout", HTTPHandlerTimeout.String())
		return nil, fmt.Errorf("HTTP请求处理超时: %s", HTTPHandlerTimeout.String())
	}
}

// UnregisterPluginHandlers 注销插件的所有处理器
func (him *HTTPInterfaceManager) UnregisterPluginHandlers(pluginIdentifier string) {
	him.handlersMu.Lock()
	defer him.handlersMu.Unlock()

	for name, handler := range him.handlers {
		// pluginIdentifier 格式为 "self_id/plugin_name"
		if handler.SelfID+"/"+handler.PluginName == pluginIdentifier {
			delete(him.handlers, name)
			him.logger.Infow("插件HTTP接口已注销", "plugin", pluginIdentifier, "externalName", name)
		}
	}
}
