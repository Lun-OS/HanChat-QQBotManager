package utils

import (
	"sync"
)

// HTTPRequestContext HTTP请求上下文
type HTTPRequestContext struct {
	Method     string
	Path       string
	Query      map[string]string
	Headers    map[string]string
	Body       string
	RemoteAddr string
	SelfID     string // 账号ID，用于账号隔离的HTTP接口
}

// HTTPResponse HTTP响应
type HTTPResponse struct {
	StatusCode int
	Headers    map[string]string
	Body       string
}

// MemoryPool 内存池管理器
type MemoryPool struct {
	stringPool    *sync.Pool
	bytePool      *sync.Pool
	mapPool       *sync.Pool
	slicePool     *sync.Pool
	responsePool  *sync.Pool
	requestPool   *sync.Pool
}

// GlobalMemoryPool 全局内存池实例
var GlobalMemoryPool *MemoryPool

// InitMemoryPool 初始化全局内存池
func InitMemoryPool() {
	GlobalMemoryPool = NewMemoryPool()
}

// NewMemoryPool 创建新的内存池
func NewMemoryPool() *MemoryPool {
	return &MemoryPool{
		stringPool: &sync.Pool{
			New: func() interface{} {
				return new(string)
			},
		},
		bytePool: &sync.Pool{
			New: func() interface{} {
				buf := make([]byte, 0, 1024) // 初始容量1KB
				return &buf
			},
		},
		mapPool: &sync.Pool{
			New: func() interface{} {
				m := make(map[string]interface{})
				return &m
			},
		},
		slicePool: &sync.Pool{
			New: func() interface{} {
				s := make([]interface{}, 0, 16) // 初始容量16
				return &s
			},
		},
		responsePool: &sync.Pool{
			New: func() interface{} {
				return &HTTPResponse{
					StatusCode: 200,
					Headers:    make(map[string]string),
					Body:       "",
				}
			},
		},
		requestPool: &sync.Pool{
			New: func() interface{} {
				return &HTTPRequestContext{
					Method:     "GET",
					Path:       "",
					Query:      make(map[string]string),
					Headers:    make(map[string]string),
					Body:       "",
					RemoteAddr: "",
				}
			},
		},
	}
}

// GetString 获取字符串指针
func (p *MemoryPool) GetString() *string {
	return p.stringPool.Get().(*string)
}

// PutString 归还字符串指针
func (p *MemoryPool) PutString(s *string) {
	*s = "" // 清空内容
	p.stringPool.Put(s)
}

// GetBytes 获取字节切片指针
func (p *MemoryPool) GetBytes() *[]byte {
	buf := p.bytePool.Get().(*[]byte)
	*buf = (*buf)[:0] // 重置长度
	return buf
}

// PutBytes 归还字节切片指针
func (p *MemoryPool) PutBytes(buf *[]byte) {
	*buf = (*buf)[:0] // 清空内容
	p.bytePool.Put(buf)
}

// GetMap 获取map指针
func (p *MemoryPool) GetMap() *map[string]interface{} {
	m := p.mapPool.Get().(*map[string]interface{})
	for k := range *m {
		delete(*m, k) // 清空map
	}
	return m
}

// PutMap 归还map指针
func (p *MemoryPool) PutMap(m *map[string]interface{}) {
	for k := range *m {
		delete(*m, k) // 清空map
	}
	p.mapPool.Put(m)
}

// GetSlice 获取切片指针
func (p *MemoryPool) GetSlice() *[]interface{} {
	s := p.slicePool.Get().(*[]interface{})
	*s = (*s)[:0] // 重置长度
	return s
}

// PutSlice 归还切片指针
func (p *MemoryPool) PutSlice(s *[]interface{}) {
	*s = (*s)[:0] // 清空内容
	p.slicePool.Put(s)
}

// GetHTTPResponse 获取HTTP响应对象
func (p *MemoryPool) GetHTTPResponse() *HTTPResponse {
	resp := p.responsePool.Get().(*HTTPResponse)
	resp.StatusCode = 200
	resp.Body = ""
	// 清空headers
	for k := range resp.Headers {
		delete(resp.Headers, k)
	}
	return resp
}

// PutHTTPResponse 归还HTTP响应对象
func (p *MemoryPool) PutHTTPResponse(resp *HTTPResponse) {
	resp.StatusCode = 200
	resp.Body = ""
	// 清空headers
	for k := range resp.Headers {
		delete(resp.Headers, k)
	}
	p.responsePool.Put(resp)
}

// GetHTTPRequest 获取HTTP请求对象
func (p *MemoryPool) GetHTTPRequest() *HTTPRequestContext {
	req := p.requestPool.Get().(*HTTPRequestContext)
	req.Method = "GET"
	req.Path = ""
	req.Body = ""
	req.RemoteAddr = ""
	// 清空query和headers
	for k := range req.Query {
		delete(req.Query, k)
	}
	for k := range req.Headers {
		delete(req.Headers, k)
	}
	return req
}

// PutHTTPRequest 归还HTTP请求对象
func (p *MemoryPool) PutHTTPRequest(req *HTTPRequestContext) {
	req.Method = "GET"
	req.Path = ""
	req.Body = ""
	req.RemoteAddr = ""
	// 清空query和headers
	for k := range req.Query {
		delete(req.Query, k)
	}
	for k := range req.Headers {
		delete(req.Headers, k)
	}
	p.requestPool.Put(req)
}

// GetStringGlobal 全局获取字符串指针
func GetStringGlobal() *string {
	if GlobalMemoryPool == nil {
		InitMemoryPool()
	}
	return GlobalMemoryPool.GetString()
}

// PutStringGlobal 全局归还字符串指针
func PutStringGlobal(s *string) {
	if GlobalMemoryPool != nil {
		GlobalMemoryPool.PutString(s)
	}
}

// GetBytesGlobal 全局获取字节切片指针
func GetBytesGlobal() *[]byte {
	if GlobalMemoryPool == nil {
		InitMemoryPool()
	}
	return GlobalMemoryPool.GetBytes()
}

// PutBytesGlobal 全局归还字节切片指针
func PutBytesGlobal(buf *[]byte) {
	if GlobalMemoryPool != nil {
		GlobalMemoryPool.PutBytes(buf)
	}
}

// GetMapGlobal 全局获取map指针
func GetMapGlobal() *map[string]interface{} {
	if GlobalMemoryPool == nil {
		InitMemoryPool()
	}
	return GlobalMemoryPool.GetMap()
}

// PutMapGlobal 全局归还map指针
func PutMapGlobal(m *map[string]interface{}) {
	if GlobalMemoryPool != nil {
		GlobalMemoryPool.PutMap(m)
	}
}

// GetSliceGlobal 全局获取切片指针
func GetSliceGlobal() *[]interface{} {
	if GlobalMemoryPool == nil {
		InitMemoryPool()
	}
	return GlobalMemoryPool.GetSlice()
}

// PutSliceGlobal 全局归还切片指针
func PutSliceGlobal(s *[]interface{}) {
	if GlobalMemoryPool != nil {
		GlobalMemoryPool.PutSlice(s)
	}
}

// GetHTTPResponseGlobal 全局获取HTTP响应对象
func GetHTTPResponseGlobal() *HTTPResponse {
	if GlobalMemoryPool == nil {
		InitMemoryPool()
	}
	return GlobalMemoryPool.GetHTTPResponse()
}

// PutHTTPResponseGlobal 全局归还HTTP响应对象
func PutHTTPResponseGlobal(resp *HTTPResponse) {
	if GlobalMemoryPool != nil {
		GlobalMemoryPool.PutHTTPResponse(resp)
	}
}

// GetHTTPRequestGlobal 全局获取HTTP请求对象
func GetHTTPRequestGlobal() *HTTPRequestContext {
	if GlobalMemoryPool == nil {
		InitMemoryPool()
	}
	return GlobalMemoryPool.GetHTTPRequest()
}

// PutHTTPRequestGlobal 全局归还HTTP请求对象
func PutHTTPRequestGlobal(req *HTTPRequestContext) {
	if GlobalMemoryPool != nil {
		GlobalMemoryPool.PutHTTPRequest(req)
	}
}