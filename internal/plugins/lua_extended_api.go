package plugins

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"math"
	"math/rand"
	"regexp"
	"strconv"
	"strings"
	"time"

	lua "github.com/yuin/gopher-lua"
	"github.com/google/uuid"
)

// ==================== 日期时间API ====================

// 格式化时间
func (m *Manager) luaTimeFormat() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timestamp := L.CheckInt64(1)
		format := L.CheckString(2)
		t := time.Unix(timestamp, 0)
		L.Push(lua.LString(t.Format(format)))
		return 1
	}
}

// 解析时间
func (m *Manager) luaTimeParse() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timeStr := L.CheckString(1)
		format := L.CheckString(2)
		t, err := time.Parse(format, timeStr)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LNumber(t.Unix()))
		return 1
	}
}

// 获取当前时间
func (m *Manager) luaTimeNow() func(*lua.LState) int {
	return func(L *lua.LState) int {
		L.Push(lua.LNumber(time.Now().Unix()))
		return 1
	}
}

// 获取时间组件
func (m *Manager) luaTimeComponents() func(*lua.LState) int {
	return func(L *lua.LState) int {
		timestamp := L.CheckInt64(1)
		t := time.Unix(timestamp, 0)
		result := L.NewTable()
		L.SetField(result, "year", lua.LNumber(t.Year()))
		L.SetField(result, "month", lua.LNumber(int(t.Month())))
		L.SetField(result, "day", lua.LNumber(t.Day()))
		L.SetField(result, "hour", lua.LNumber(t.Hour()))
		L.SetField(result, "minute", lua.LNumber(t.Minute()))
		L.SetField(result, "second", lua.LNumber(t.Second()))
		L.SetField(result, "weekday", lua.LNumber(int(t.Weekday())))
		L.Push(result)
		return 1
	}
}

// ==================== 加密/哈希API ====================

// MD5哈希
func (m *Manager) luaMD5() func(*lua.LState) int {
	return func(L *lua.LState) int {
		data := L.CheckString(1)
		hash := md5.Sum([]byte(data))
		L.Push(lua.LString(hex.EncodeToString(hash[:])))
		return 1
	}
}

// SHA1哈希
func (m *Manager) luaSHA1() func(*lua.LState) int {
	return func(L *lua.LState) int {
		data := L.CheckString(1)
		hash := sha1.Sum([]byte(data))
		L.Push(lua.LString(hex.EncodeToString(hash[:])))
		return 1
	}
}

// SHA256哈希
func (m *Manager) luaSHA256() func(*lua.LState) int {
	return func(L *lua.LState) int {
		data := L.CheckString(1)
		hash := sha256.Sum256([]byte(data))
		L.Push(lua.LString(hex.EncodeToString(hash[:])))
		return 1
	}
}

// ==================== 正则表达式API ====================

// 匹配
func (m *Manager) luaRegexMatch() func(*lua.LState) int {
	return func(L *lua.LState) int {
		pattern := L.CheckString(1)
		str := L.CheckString(2)
		matched, err := regexp.MatchString(pattern, str)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(err.Error()))
			return 2
		}
		L.Push(lua.LBool(matched))
		return 1
	}
}

// 查找所有匹配
func (m *Manager) luaRegexFindAll() func(*lua.LState) int {
	return func(L *lua.LState) int {
		pattern := L.CheckString(1)
		str := L.CheckString(2)
		re, err := regexp.Compile(pattern)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		matches := re.FindAllString(str, -1)
		result := L.NewTable()
		for i, match := range matches {
			L.SetField(result, strconv.Itoa(i+1), lua.LString(match))
		}
		L.Push(result)
		return 1
	}
}

// 替换
func (m *Manager) luaRegexReplace() func(*lua.LState) int {
	return func(L *lua.LState) int {
		pattern := L.CheckString(1)
		str := L.CheckString(2)
		replace := L.CheckString(3)
		re, err := regexp.Compile(pattern)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(err.Error()))
			return 2
		}
		result := re.ReplaceAllString(str, replace)
		L.Push(lua.LString(result))
		return 1
	}
}

// ==================== 数学扩展API ====================

// 随机浮点数
func (m *Manager) luaMathRandomFloat() func(*lua.LState) int {
	return func(L *lua.LState) int {
		min := L.OptNumber(1, 0.0)
		max := L.OptNumber(2, 1.0)
		result := float64(min) + rand.Float64()*(float64(max)-float64(min))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 随机整数
func (m *Manager) luaMathRandomInt() func(*lua.LState) int {
	return func(L *lua.LState) int {
		min := L.CheckInt(1)
		max := L.CheckInt(2)
		result := min + rand.Intn(max-min+1)
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 四舍五入
func (m *Manager) luaMathRound() func(*lua.LState) int {
	return func(L *lua.LState) int {
		x := L.CheckNumber(1)
		result := math.Round(float64(x))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 绝对值
func (m *Manager) luaMathAbs() func(*lua.LState) int {
	return func(L *lua.LState) int {
		x := L.CheckNumber(1)
		result := math.Abs(float64(x))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// 幂运算
func (m *Manager) luaMathPow() func(*lua.LState) int {
	return func(L *lua.LState) int {
		x := L.CheckNumber(1)
		y := L.CheckNumber(2)
		result := math.Pow(float64(x), float64(y))
		L.Push(lua.LNumber(result))
		return 1
	}
}

// ==================== 字符串处理扩展API ====================

// 字符串分割
func (m *Manager) luaStringSplit() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		sep := L.CheckString(2)
		parts := strings.Split(str, sep)
		result := L.NewTable()
		for i, part := range parts {
			L.SetField(result, strconv.Itoa(i+1), lua.LString(part))
		}
		L.Push(result)
		return 1
	}
}

// 字符串连接
func (m *Manager) luaStringJoin() func(*lua.LState) int {
	return func(L *lua.LState) int {
		table := L.CheckTable(1)
		sep := L.CheckString(2)
		var parts []string
		table.ForEach(func(_, val lua.LValue) {
			parts = append(parts, val.String())
		})
		result := strings.Join(parts, sep)
		L.Push(lua.LString(result))
		return 1
	}
}

// 字符串替换
func (m *Manager) luaStringReplace() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		old := L.CheckString(2)
		newStr := L.CheckString(3)
		n := L.OptInt(4, -1)
		result := strings.Replace(str, old, newStr, n)
		L.Push(lua.LString(result))
		return 1
	}
}

// 字符串是否包含
func (m *Manager) luaStringContains() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		substr := L.CheckString(2)
		result := strings.Contains(str, substr)
		L.Push(lua.LBool(result))
		return 1
	}
}

// 字符串修剪
func (m *Manager) luaStringTrim() func(*lua.LState) int {
	return func(L *lua.LState) int {
		str := L.CheckString(1)
		cutset := L.OptString(2, " \t\n\r")
		result := strings.Trim(str, cutset)
		L.Push(lua.LString(result))
		return 1
	}
}

// ==================== UUID生成API ====================

// 生成UUID
func (m *Manager) luaUUIDNew() func(*lua.LState) int {
	return func(L *lua.LState) int {
		u := uuid.New()
		L.Push(lua.LString(u.String()))
		return 1
	}
}

// ==================== 注册扩展API ====================

func (m *Manager) registerExtendedAPI(L *lua.LState) {
	// 日期时间API
	timeTable := L.NewTable()
	L.SetField(timeTable, "now", L.NewFunction(m.luaTimeNow()))
	L.SetField(timeTable, "format", L.NewFunction(m.luaTimeFormat()))
	L.SetField(timeTable, "parse", L.NewFunction(m.luaTimeParse()))
	L.SetField(timeTable, "components", L.NewFunction(m.luaTimeComponents()))
	L.SetGlobal("time", timeTable)

	// 加密/哈希API
	cryptoTable := L.NewTable()
	L.SetField(cryptoTable, "md5", L.NewFunction(m.luaMD5()))
	L.SetField(cryptoTable, "sha1", L.NewFunction(m.luaSHA1()))
	L.SetField(cryptoTable, "sha256", L.NewFunction(m.luaSHA256()))
	L.SetGlobal("crypto", cryptoTable)

	// 正则表达式API
	regexTable := L.NewTable()
	L.SetField(regexTable, "match", L.NewFunction(m.luaRegexMatch()))
	L.SetField(regexTable, "find_all", L.NewFunction(m.luaRegexFindAll()))
	L.SetField(regexTable, "replace", L.NewFunction(m.luaRegexReplace()))
	L.SetGlobal("regex", regexTable)

	// 数学扩展API
	mathTable := L.NewTable()
	L.SetField(mathTable, "random_float", L.NewFunction(m.luaMathRandomFloat()))
	L.SetField(mathTable, "random_int", L.NewFunction(m.luaMathRandomInt()))
	L.SetField(mathTable, "round", L.NewFunction(m.luaMathRound()))
	L.SetField(mathTable, "abs", L.NewFunction(m.luaMathAbs()))
	L.SetField(mathTable, "pow", L.NewFunction(m.luaMathPow()))
	L.SetGlobal("math_ext", mathTable)

	// 字符串处理扩展API
	stringTable := L.NewTable()
	L.SetField(stringTable, "split", L.NewFunction(m.luaStringSplit()))
	L.SetField(stringTable, "join", L.NewFunction(m.luaStringJoin()))
	L.SetField(stringTable, "replace", L.NewFunction(m.luaStringReplace()))
	L.SetField(stringTable, "contains", L.NewFunction(m.luaStringContains()))
	L.SetField(stringTable, "trim", L.NewFunction(m.luaStringTrim()))
	L.SetGlobal("string_ext", stringTable)

	// UUID API
	uuidTable := L.NewTable()
	L.SetField(uuidTable, "new", L.NewFunction(m.luaUUIDNew()))
	L.SetGlobal("uuid", uuidTable)
}
