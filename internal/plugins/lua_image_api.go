package plugins

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/jpeg"
	"image/png"

	lua "github.com/yuin/gopher-lua"
)

// 图像处理API - 裁剪图像
func (m *Manager) luaImageCrop(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		x := L.CheckInt(2)
		y := L.CheckInt(3)
		width := L.CheckInt(4)
		height := L.CheckInt(5)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		err := processor.Crop(x, y, width, height)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(fmt.Sprintf("裁剪失败: %v", err)))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 缩放图像
func (m *Manager) luaImageResize(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		newWidth := L.CheckInt(2)
		newHeight := L.CheckInt(3)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		err := processor.Resize(newWidth, newHeight)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(fmt.Sprintf("缩放失败: %v", err)))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 旋转图像
func (m *Manager) luaImageRotate(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		degrees := L.CheckNumber(2)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		err := processor.Rotate(float64(degrees))
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(fmt.Sprintf("旋转失败: %v", err)))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 灰度化
func (m *Manager) luaImageGrayscale(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.Grayscale()

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 添加水印
func (m *Manager) luaImageAddWatermark(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		text := L.CheckString(2)
		x := L.OptInt(3, 10)
		y := L.OptInt(4, 10)
		fontSize := L.OptInt(5, 12)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.AddWatermark(text, x, y, fontSize)

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 模糊效果
func (m *Manager) luaImageBlur(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		radius := L.OptInt(2, 5)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		err := processor.Blur(radius)
		if err != nil {
			L.Push(lua.LBool(false))
			L.Push(lua.LString(fmt.Sprintf("模糊失败: %v", err)))
			return 2
		}

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 亮度调整
func (m *Manager) luaImageAdjustBrightness(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		brightness := L.CheckNumber(2)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.AdjustBrightness(float64(brightness))

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 对比度调整
func (m *Manager) luaImageAdjustContrast(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		contrast := L.CheckNumber(2)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.AdjustContrast(float64(contrast))

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 饱和度调整
func (m *Manager) luaImageAdjustSaturation(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		saturation := L.CheckNumber(2)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.AdjustSaturation(float64(saturation))

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 获取图像尺寸
func (m *Manager) luaImageGetSize(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LNil)
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		bounds := processor.GetBounds()

		result := L.NewTable()
		L.SetField(result, "width", lua.LNumber(bounds.Dx()))
		L.SetField(result, "height", lua.LNumber(bounds.Dy()))

		L.Push(result)
		return 1
	}
}

// 图像处理API - 保存为PNG格式
func (m *Manager) luaImageSavePNG(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LNil)
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		img := processor.GetImage()
		if img == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("无法获取图像"))
			return 2
		}

		buf := new(bytes.Buffer)
		err := png.Encode(buf, img)
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("保存PNG失败: %v", err)))
			return 2
		}

		L.Push(lua.LString(base64.StdEncoding.EncodeToString(buf.Bytes())))
		return 1
	}
}

// 图像处理API - 保存为JPEG格式
func (m *Manager) luaImageSaveJPEG(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		quality := L.OptInt(2, 90)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LNil)
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		img := processor.GetImage()
		if img == nil {
			L.Push(lua.LNil)
			L.Push(lua.LString("无法获取图像"))
			return 2
		}

		buf := new(bytes.Buffer)
		err := jpeg.Encode(buf, img, &jpeg.Options{Quality: quality})
		if err != nil {
			L.Push(lua.LNil)
			L.Push(lua.LString(fmt.Sprintf("保存JPEG失败: %v", err)))
			return 2
		}

		L.Push(lua.LString(base64.StdEncoding.EncodeToString(buf.Bytes())))
		return 1
	}
}

// 图像处理API - 绘制圆形
func (m *Manager) luaImageDrawCircle(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		x := L.CheckInt(2)
		y := L.CheckInt(3)
		radius := L.CheckInt(4)
		r := L.CheckInt(5)
		g := L.CheckInt(6)
		b := L.CheckInt(7)
		a := L.OptInt(8, 255)
		filled := L.OptBool(9, false)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.DrawCircle(x, y, radius, uint8(r), uint8(g), uint8(b), uint8(a), filled)

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 绘制线条
func (m *Manager) luaImageDrawLine(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)
		x1 := L.CheckInt(2)
		y1 := L.CheckInt(3)
		x2 := L.CheckInt(4)
		y2 := L.CheckInt(5)
		r := L.CheckInt(6)
		g := L.CheckInt(7)
		b := L.CheckInt(8)
		a := L.OptInt(9, 255)
		thickness := L.OptInt(10, 1)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.RLock()
		processor, exists := instance.imageProcessors[processorID]
		instance.imageProcessorMu.RUnlock()

		if !exists {
			L.Push(lua.LBool(false))
			L.Push(lua.LString("图像处理器不存在或已释放"))
			return 2
		}

		processor.DrawLine(x1, y1, x2, y2, uint8(r), uint8(g), uint8(b), uint8(a), thickness)

		L.Push(lua.LBool(true))
		return 1
	}
}

// 图像处理API - 释放处理器
func (m *Manager) luaImageReleaseProcessor(instance *LuaPluginInstance) func(*lua.LState) int {
	return func(L *lua.LState) int {
		processorTable := L.CheckTable(1)

		processorID := int(L.GetField(processorTable, "_processor_id").(lua.LNumber))

		instance.imageProcessorMu.Lock()
		delete(instance.imageProcessors, processorID)
		instance.imageProcessorMu.Unlock()

		L.Push(lua.LBool(true))
		return 1
	}
}

// 注册图像处理API
func (m *Manager) registerImageAPI(L *lua.LState, instance *LuaPluginInstance) {
	imageTable := L.NewTable()

	L.SetField(imageTable, "crop", L.NewFunction(m.luaImageCrop(instance)))
	L.SetField(imageTable, "resize", L.NewFunction(m.luaImageResize(instance)))
	L.SetField(imageTable, "rotate", L.NewFunction(m.luaImageRotate(instance)))
	L.SetField(imageTable, "grayscale", L.NewFunction(m.luaImageGrayscale(instance)))
	L.SetField(imageTable, "add_watermark", L.NewFunction(m.luaImageAddWatermark(instance)))
	L.SetField(imageTable, "blur", L.NewFunction(m.luaImageBlur(instance)))
	L.SetField(imageTable, "adjust_brightness", L.NewFunction(m.luaImageAdjustBrightness(instance)))
	L.SetField(imageTable, "adjust_contrast", L.NewFunction(m.luaImageAdjustContrast(instance)))
	L.SetField(imageTable, "adjust_saturation", L.NewFunction(m.luaImageAdjustSaturation(instance)))
	L.SetField(imageTable, "get_size", L.NewFunction(m.luaImageGetSize(instance)))
	L.SetField(imageTable, "save_png", L.NewFunction(m.luaImageSavePNG(instance)))
	L.SetField(imageTable, "save_jpeg", L.NewFunction(m.luaImageSaveJPEG(instance)))
	L.SetField(imageTable, "draw_circle", L.NewFunction(m.luaImageDrawCircle(instance)))
	L.SetField(imageTable, "draw_line", L.NewFunction(m.luaImageDrawLine(instance)))
	L.SetField(imageTable, "release", L.NewFunction(m.luaImageReleaseProcessor(instance)))

	L.SetGlobal("image", imageTable)
}


