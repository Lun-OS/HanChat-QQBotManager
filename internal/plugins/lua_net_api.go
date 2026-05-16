package plugins

import (
	"io"
	"net"
	"strings"
	"sync"
	"time"

	lua "github.com/yuin/gopher-lua"
	"golang.org/x/net/websocket"
)

// WebSocket连接管理
type WebSocketConnection struct {
	conn      *websocket.Conn
	connected bool
	mu        sync.Mutex
	onMessage func(string)
	onClose   func()
}

var wsConnections = make(map[int]*WebSocketConnection)
var wsConnMu sync.Mutex
var nextWSID = 1

// 创建WebSocket连接
func (m *Manager) luaWebSocketConnect(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		url := L.CheckString(1)

		if !strings.HasPrefix(url, "ws://") && !strings.HasPrefix(url, "wss://") {
			L.Push(lua.LNil)
			L.Push(lua.LString("URL必须以ws://或wss://开头"))
			return 2
		}

		// 安全检查：禁止访问内网地址
		host := extractHostFromURL(url)
		if host != "" {
			if ip := net.ParseIP(host); ip != nil {
				if isPrivateIP(ip) {
					L.Push(lua.LNil)
					L.Push(lua.LString("禁止访问内网地址"))
					return 2
				}
			} else {
				ips, err := net.LookupIP(host)
				if err == nil {
					for _, ip := range ips {
						if isPrivateIP(ip) {
							L.Push(lua.LNil)
							L.Push(lua.LString("禁止访问内网地址"))
							return 2
						}
					}
				}
			}
		}

		conn, err := websocket.Dial(url, "", "http://localhost/")
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		wsConnMu.Lock()
		connID := nextWSID
		nextWSID++
		wsConnections[connID] = &WebSocketConnection{
			conn:      conn,
			connected: true,
		}
		wsConnMu.Unlock()

		// 启动消息监听协程
		go func() {
			buffer := make([]byte, 1024*1024) // 1MB缓冲区
			for {
				wsConnMu.Lock()
				ws := wsConnections[connID]
				wsConnMu.Unlock()

				if ws == nil || !ws.connected {
					break
				}

				n, err := ws.conn.Read(buffer)
				if err != nil {
					ws.mu.Lock()
					ws.connected = false
					if ws.onClose != nil {
						ws.onClose()
					}
					ws.mu.Unlock()
					break
				}

				if n > 0 && ws.onMessage != nil {
					ws.onMessage(string(buffer[:n]))
				}
			}
		}()

		result := L.NewTable()
		L.SetField(result, "id", lua.LNumber(connID))
		L.SetField(result, "connected", lua.LBool(true))
		L.Push(result)
		return 1
	}
}

// WebSocket发送消息
func (m *Manager) luaWebSocketSend(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connID := L.CheckInt(1)
		message := L.CheckString(2)

		wsConnMu.Lock()
		ws, exists := wsConnections[connID]
		wsConnMu.Unlock()

		if !exists || ws == nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("连接不存在"))
			return 2
		}

		ws.mu.Lock()
		if !ws.connected {
			ws.mu.Unlock()
			L.Push(lua.LFalse)
			L.Push(lua.LString("连接已断开"))
			return 2
		}

		err := websocket.Message.Send(ws.conn, message)
		ws.mu.Unlock()

		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// WebSocket关闭连接
func (m *Manager) luaWebSocketClose(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connID := L.CheckInt(1)

		wsConnMu.Lock()
		ws, exists := wsConnections[connID]
		if exists {
			delete(wsConnections, connID)
		}
		wsConnMu.Unlock()

		if ws == nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("连接不存在"))
			return 2
		}

		ws.mu.Lock()
		ws.connected = false
		ws.conn.Close()
		ws.mu.Unlock()

		L.Push(lua.LTrue)
		return 1
	}
}

// WebSocket接收消息（阻塞模式）
func (m *Manager) luaWebSocketReceive(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connID := L.CheckInt(1)
		timeout := L.OptNumber(2, 30) // 默认30秒超时

		wsConnMu.Lock()
		ws, exists := wsConnections[connID]
		wsConnMu.Unlock()

		if !exists || ws == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("连接不存在"))
			return 2
		}

		ws.mu.Lock()
		if !ws.connected {
			ws.mu.Unlock()
			L.Push(lua.LNil)
			L.Push(lua.LString("连接已断开"))
			return 2
		}

		result := make(chan string, 1)
		done := make(chan struct{})

		originalHandler := ws.onMessage
		ws.onMessage = func(msg string) {
			select {
			case result <- msg:
			default:
			}
		}
		ws.mu.Unlock()

		go func() {
			time.Sleep(time.Duration(timeout) * time.Second)
			select {
			case <-done:
			default:
				select {
				case result <- "":
				default:
				}
			}
		}()

		msg := <-result
		close(done)

		ws.mu.Lock()
		ws.onMessage = originalHandler
		ws.mu.Unlock()

		if msg == "" {
			L.Push(lua.LNil)
			L.Push(lua.LString("接收超时"))
			return 2
		}

		L.Push(lua.LString(msg))
		return 1
	}
}

// TCP连接管理
type TCPConnection struct {
	conn      net.Conn
	connected bool
	mu        sync.Mutex
	onMessage func(string)
}

var tcpConnections = make(map[int]*TCPConnection)
var tcpConnMu sync.Mutex
var nextTCPID = 1

// 创建TCP连接（持久连接）
func (m *Manager) luaTcpConnectPersistent(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		address := L.CheckString(1)
		timeout := L.OptNumber(2, 10)

		host, _, err := net.SplitHostPort(address)
		if err != nil {
			host = address
		}

		if ip := net.ParseIP(host); ip != nil {
			if isPrivateIP(ip) {
				L.Push(lua.LNil)
				L.Push(lua.LString("禁止访问内网地址"))
				return 2
			}
		} else {
			ips, err := net.LookupIP(host)
			if err == nil {
				for _, ip := range ips {
					if isPrivateIP(ip) {
						L.Push(lua.LNil)
						L.Push(lua.LString("禁止访问内网地址"))
						return 2
					}
				}
			}
		}

		if timeout > 30 {
			timeout = 30
		}

		conn, err := net.DialTimeout("tcp", address, time.Duration(timeout)*time.Second)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		tcpConnMu.Lock()
		connID := nextTCPID
		nextTCPID++
		tcpConnections[connID] = &TCPConnection{
			conn:      conn,
			connected: true,
		}
		tcpConnMu.Unlock()

		go func() {
			buffer := make([]byte, 64*1024)
			for {
				tcpConnMu.Lock()
				tcp := tcpConnections[connID]
				tcpConnMu.Unlock()

				if tcp == nil || !tcp.connected {
					break
				}

				tcp.conn.SetReadDeadline(time.Now().Add(30 * time.Second))
				n, err := tcp.conn.Read(buffer)
				if err != nil {
					tcp.mu.Lock()
					tcp.connected = false
					if tcp.onMessage != nil {
						tcp.onMessage("")
					}
					tcp.mu.Unlock()
					break
				}

				if n > 0 && tcp.onMessage != nil {
					tcp.onMessage(string(buffer[:n]))
				}
			}
		}()

		result := L.NewTable()
		L.SetField(result, "id", lua.LNumber(connID))
		L.SetField(result, "connected", lua.LBool(true))
		L.Push(result)
		return 1
	}
}

// TCP发送数据
func (m *Manager) luaTcpSend(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connID := L.CheckInt(1)
		message := L.CheckString(2)

		tcpConnMu.Lock()
		tcp, exists := tcpConnections[connID]
		tcpConnMu.Unlock()

		if !exists || tcp == nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("连接不存在"))
			return 2
		}

		tcp.mu.Lock()
		if !tcp.connected {
			tcp.mu.Unlock()
			L.Push(lua.LFalse)
			L.Push(lua.LString("连接已断开"))
			return 2
		}

		if len(message) > 10*1024*1024 {
			tcp.mu.Unlock()
			L.Push(lua.LFalse)
			L.Push(lua.LString("消息太大"))
			return 2
		}

		tcp.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		_, err := tcp.conn.Write([]byte(message))
		tcp.mu.Unlock()

		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// TCP接收数据
func (m *Manager) luaTcpReceive(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connID := L.CheckInt(1)
		timeout := L.OptNumber(2, 30)

		tcpConnMu.Lock()
		tcp, exists := tcpConnections[connID]
		tcpConnMu.Unlock()

		if !exists || tcp == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("连接不存在"))
			return 2
		}

		tcp.mu.Lock()
		if !tcp.connected {
			tcp.mu.Unlock()
			L.Push(lua.LNil)
			L.Push(lua.LString("连接已断开"))
			return 2
		}

		buffer := make([]byte, 64*1024)
		tcp.conn.SetReadDeadline(time.Now().Add(time.Duration(timeout) * time.Second))
		n, err := tcp.conn.Read(buffer)
		tcp.mu.Unlock()

		if err != nil {
			if err == io.EOF {
				L.Push(lua.LNil)
				L.Push(lua.LString("连接已关闭"))
			} else {
				L.Push(lua.LNil)
				L.Push(lua.LString(err.Error()))
			}
			return 2
		}

		L.Push(lua.LString(string(buffer[:n])))
		return 1
	}
}

// TCP关闭连接
func (m *Manager) luaTcpClose(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connID := L.CheckInt(1)

		tcpConnMu.Lock()
		tcp, exists := tcpConnections[connID]
		if exists {
			delete(tcpConnections, connID)
		}
		tcpConnMu.Unlock()

		if tcp == nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("连接不存在"))
			return 2
		}

		tcp.mu.Lock()
		tcp.connected = false
		tcp.conn.Close()
		tcp.mu.Unlock()

		L.Push(lua.LTrue)
		return 1
	}
}

// UDP监听管理
type UDPListener struct {
	conn    *net.UDPConn
	running bool
	mu      sync.Mutex
}

var udpListeners = make(map[int]*UDPListener)
var udpListenerMu sync.Mutex
var nextUDPID = 1

// 创建UDP监听
func (m *Manager) luaUdpListen(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		address := L.CheckString(1)

		addr, err := net.ResolveUDPAddr("udp", address)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if addr.IP != nil && !addr.IP.IsLoopback() {
			L.Push(lua.LNil)
			L.Push(lua.LString("只能监听本地地址"))
			return 2
		}

		conn, err := net.ListenUDP("udp", addr)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		udpListenerMu.Lock()
		listenerID := nextUDPID
		nextUDPID++
		udpListeners[listenerID] = &UDPListener{
			conn:    conn,
			running: true,
		}
		udpListenerMu.Unlock()

		result := L.NewTable()
		L.SetField(result, "id", lua.LNumber(listenerID))
		L.SetField(result, "address", lua.LString(address))
		L.SetField(result, "running", lua.LBool(true))
		L.Push(result)
		return 1
	}
}

// UDP接收数据
func (m *Manager) luaUdpReceive(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		listenerID := L.CheckInt(1)
		timeout := L.OptNumber(2, 30)

		udpListenerMu.Lock()
		listener, exists := udpListeners[listenerID]
		udpListenerMu.Unlock()

		if !exists || listener == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("监听器不存在"))
			return 2
		}

		listener.mu.Lock()
		if !listener.running {
			listener.mu.Unlock()
			L.Push(lua.LNil)
			L.Push(lua.LString("监听器已停止"))
			return 2
		}

		buffer := make([]byte, 65507)
		listener.conn.SetReadDeadline(time.Now().Add(time.Duration(timeout) * time.Second))
		n, remoteAddr, err := listener.conn.ReadFromUDP(buffer)
		listener.mu.Unlock()

		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		result := L.NewTable()
		L.SetField(result, "data", lua.LString(string(buffer[:n])))
		L.SetField(result, "remote_addr", lua.LString(remoteAddr.String()))
		L.Push(result)
		return 1
	}
}

// UDP发送数据（通过监听器）
func (m *Manager) luaUdpSendFrom(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		listenerID := L.CheckInt(1)
		targetAddr := L.CheckString(2)
		message := L.CheckString(3)

		udpListenerMu.Lock()
		listener, exists := udpListeners[listenerID]
		udpListenerMu.Unlock()

		if !exists || listener == nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("监听器不存在"))
			return 2
		}

		listener.mu.Lock()
		if !listener.running {
			listener.mu.Unlock()
			L.Push(lua.LFalse)
			L.Push(lua.LString("监听器已停止"))
			return 2
		}

		addr, err := net.ResolveUDPAddr("udp", targetAddr)
		if err != nil {
			listener.mu.Unlock()
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		if len(message) > 65507 {
			listener.mu.Unlock()
			L.Push(lua.LFalse)
			L.Push(lua.LString("消息太大"))
			return 2
		}

		_, err = listener.conn.WriteToUDP([]byte(message), addr)
		listener.mu.Unlock()

		if err != nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString(err.Error()))
			return 2
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// UDP关闭监听器
func (m *Manager) luaUdpCloseListener(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		listenerID := L.CheckInt(1)

		udpListenerMu.Lock()
		listener, exists := udpListeners[listenerID]
		if exists {
			delete(udpListeners, listenerID)
		}
		udpListenerMu.Unlock()

		if listener == nil {
			L.Push(lua.LFalse)
			L.Push(lua.LString("监听器不存在"))
			return 2
		}

		listener.mu.Lock()
		listener.running = false
		listener.conn.Close()
		listener.mu.Unlock()

		L.Push(lua.LTrue)
		return 1
	}
}

// 辅助函数：从URL提取主机名
func extractHostFromURL(url string) string {
	url = strings.TrimPrefix(url, "ws://")
	url = strings.TrimPrefix(url, "wss://")
	
	if idx := strings.Index(url, "/"); idx != -1 {
		url = url[:idx]
	}
	
	if idx := strings.Index(url, ":"); idx != -1 {
		url = url[:idx]
	}
	
	return url
}



// 获取连接状态
func (m *Manager) luaGetConnectionStatus(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connType := L.CheckString(1)
		connID := L.CheckInt(2)

		result := L.NewTable()

		switch connType {
		case "websocket":
			wsConnMu.Lock()
			ws, exists := wsConnections[connID]
			wsConnMu.Unlock()
			if exists && ws != nil {
				L.SetField(result, "connected", lua.LBool(ws.connected))
			} else {
				L.SetField(result, "connected", lua.LBool(false))
			}
		case "tcp":
			tcpConnMu.Lock()
			tcp, exists := tcpConnections[connID]
			tcpConnMu.Unlock()
			if exists && tcp != nil {
				L.SetField(result, "connected", lua.LBool(tcp.connected))
			} else {
				L.SetField(result, "connected", lua.LBool(false))
			}
		case "udp":
			udpListenerMu.Lock()
			udp, exists := udpListeners[connID]
			udpListenerMu.Unlock()
			if exists && udp != nil {
				L.SetField(result, "running", lua.LBool(udp.running))
			} else {
				L.SetField(result, "running", lua.LBool(false))
			}
		default:
			L.SetField(result, "error", lua.LString("未知连接类型"))
		}

		L.Push(result)
		return 1
	}
}

// 获取所有连接列表
func (m *Manager) luaListConnections(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		result := L.NewTable()

		wsConnMu.Lock()
		wsList := L.NewTable()
		i := 1
		for id, ws := range wsConnections {
			item := L.NewTable()
			L.SetField(item, "id", lua.LNumber(id))
			L.SetField(item, "type", lua.LString("websocket"))
			L.SetField(item, "connected", lua.LBool(ws.connected))
			L.RawSetInt(wsList, i, item)
			i++
		}
		wsConnMu.Unlock()
		L.SetField(result, "websocket", wsList)

		tcpConnMu.Lock()
		tcpList := L.NewTable()
		i = 1
		for id, tcp := range tcpConnections {
			item := L.NewTable()
			L.SetField(item, "id", lua.LNumber(id))
			L.SetField(item, "type", lua.LString("tcp"))
			L.SetField(item, "connected", lua.LBool(tcp.connected))
			L.RawSetInt(tcpList, i, item)
			i++
		}
		tcpConnMu.Unlock()
		L.SetField(result, "tcp", tcpList)

		udpListenerMu.Lock()
		udpList := L.NewTable()
		i = 1
		for id, udp := range udpListeners {
			item := L.NewTable()
			L.SetField(item, "id", lua.LNumber(id))
			L.SetField(item, "type", lua.LString("udp"))
			L.SetField(item, "running", lua.LBool(udp.running))
			L.RawSetInt(udpList, i, item)
			i++
		}
		udpListenerMu.Unlock()
		L.SetField(result, "udp", udpList)

		L.Push(result)
		return 1
	}
}

// 批量关闭连接
func (m *Manager) luaCloseAllConnections(selfID string, pluginName string) func(*lua.LState) int {
	return func(L *lua.LState) int {
		connType := L.OptString(1, "")

		if connType == "" || connType == "websocket" {
			wsConnMu.Lock()
			for _, ws := range wsConnections {
				ws.mu.Lock()
				ws.connected = false
				ws.conn.Close()
				ws.mu.Unlock()
			}
			wsConnections = make(map[int]*WebSocketConnection)
			wsConnMu.Unlock()
		}

		if connType == "" || connType == "tcp" {
			tcpConnMu.Lock()
			for _, tcp := range tcpConnections {
				tcp.mu.Lock()
				tcp.connected = false
				tcp.conn.Close()
				tcp.mu.Unlock()
			}
			tcpConnections = make(map[int]*TCPConnection)
			tcpConnMu.Unlock()
		}

		if connType == "" || connType == "udp" {
			udpListenerMu.Lock()
			for _, udp := range udpListeners {
				udp.mu.Lock()
				udp.running = false
				udp.conn.Close()
				udp.mu.Unlock()
			}
			udpListeners = make(map[int]*UDPListener)
			udpListenerMu.Unlock()
		}

		L.Push(lua.LTrue)
		return 1
	}
}

// 注册网络API
func (m *Manager) registerNetworkAPI(L *lua.LState, selfID, pluginName string) {
	netTable := L.NewTable()

	// WebSocket API
	wsTable := L.NewTable()
	L.SetField(wsTable, "connect", L.NewFunction(m.luaWebSocketConnect(selfID, pluginName)))
	L.SetField(wsTable, "send", L.NewFunction(m.luaWebSocketSend(selfID, pluginName)))
	L.SetField(wsTable, "receive", L.NewFunction(m.luaWebSocketReceive(selfID, pluginName)))
	L.SetField(wsTable, "close", L.NewFunction(m.luaWebSocketClose(selfID, pluginName)))
	L.SetField(netTable, "websocket", wsTable)

	// TCP API
	tcpTable := L.NewTable()
	L.SetField(tcpTable, "connect", L.NewFunction(m.luaTcpConnectPersistent(selfID, pluginName)))
	L.SetField(tcpTable, "send", L.NewFunction(m.luaTcpSend(selfID, pluginName)))
	L.SetField(tcpTable, "receive", L.NewFunction(m.luaTcpReceive(selfID, pluginName)))
	L.SetField(tcpTable, "close", L.NewFunction(m.luaTcpClose(selfID, pluginName)))
	L.SetField(netTable, "tcp", tcpTable)

	// UDP API
	udpTable := L.NewTable()
	L.SetField(udpTable, "listen", L.NewFunction(m.luaUdpListen(selfID, pluginName)))
	L.SetField(udpTable, "receive", L.NewFunction(m.luaUdpReceive(selfID, pluginName)))
	L.SetField(udpTable, "send", L.NewFunction(m.luaUdpSend(selfID, pluginName)))
	L.SetField(udpTable, "send_from", L.NewFunction(m.luaUdpSendFrom(selfID, pluginName)))
	L.SetField(udpTable, "close", L.NewFunction(m.luaUdpCloseListener(selfID, pluginName)))
	L.SetField(netTable, "udp", udpTable)

	// 连接管理API
	L.SetField(netTable, "status", L.NewFunction(m.luaGetConnectionStatus(selfID, pluginName)))
	L.SetField(netTable, "list", L.NewFunction(m.luaListConnections(selfID, pluginName)))
	L.SetField(netTable, "close_all", L.NewFunction(m.luaCloseAllConnections(selfID, pluginName)))

	L.SetGlobal("net", netTable)
}
