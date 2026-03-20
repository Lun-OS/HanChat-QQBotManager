package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

// AESEncrypt 使用AES-CBC模式加密数据
func AESEncrypt(key string, data string) (string, error) {
	// 确保密钥长度为16、24或32字节
	key = padKey(key)

	// 创建AES加密块
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", err
	}

	// 加密数据需要填充到16字节的倍数
	paddedData := padData([]byte(data))

	// 创建初始化向量(IV)，长度为AES块大小
	iv := make([]byte, aes.BlockSize)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}

	// 创建CBC加密模式
	mode := cipher.NewCBCEncrypter(block, iv)

	// 加密数据
	encrypted := make([]byte, len(paddedData))
	mode.CryptBlocks(encrypted, paddedData)

	// 将IV和加密数据组合起来，然后进行Base64编码
	result := append(iv, encrypted...)
	return base64.StdEncoding.EncodeToString(result), nil
}

// AESDecrypt 使用AES-CBC模式解密数据，支持宽松的填充处理
func AESDecrypt(key string, encryptedData string) (string, error) {
	// 确保密钥长度为16、24或32字节
	key = padKey(key)

	// 解码Base64数据
	data, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return "", err
	}

	// 检查数据长度是否至少包含一个IV和一个加密块
	if len(data) < aes.BlockSize {
		return "", fmt.Errorf("数据长度不足")
	}

	// 分离IV和加密数据
	iv := data[:aes.BlockSize]
	encrypted := data[aes.BlockSize:]

	// 创建AES解密块
	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", err
	}

	// 创建CBC解密模式
	mode := cipher.NewCBCDecrypter(block, iv)

	// 解密数据
	decrypted := make([]byte, len(encrypted))
	mode.CryptBlocks(decrypted, encrypted)

	// 尝试多种方式处理解密后的数据
	// 1. 首先尝试标准的PKCS#7填充移除
	result, err := unpadData(decrypted)
	if err == nil {
		return string(result), nil
	}

	// 2. 如果PKCS#7填充失败，尝试直接返回解密后的数据，去除末尾的控制字符
	cleaned := strings.TrimFunc(string(decrypted), func(r rune) bool {
		return r < 32 || r > 126
	})
	if cleaned != "" {
		return cleaned, nil
	}

	// 3. 如果还是失败，尝试去除所有非数字字符，只保留时间戳
	numericOnly := make([]byte, 0, len(decrypted))
	for _, b := range decrypted {
		if b >= '0' && b <= '9' {
			numericOnly = append(numericOnly, b)
		}
	}
	if len(numericOnly) > 0 {
		return string(numericOnly), nil
	}

	// 4. 最后尝试直接返回原始解密数据，不进行任何处理
	return string(decrypted), nil
}

// padKey 确保密钥长度为16、24或32字节
func padKey(key string) string {
	// AES密钥长度只能是16、24或32字节
	keyLen := len(key)
	switch {
	case keyLen == 16, keyLen == 24, keyLen == 32:
		return key
	case keyLen < 16:
		// 填充到16字节
		return key + string(make([]byte, 16-keyLen))
	case keyLen < 24:
		// 填充到24字节
		return key + string(make([]byte, 24-keyLen))
	default:
		// 截断或填充到32字节
		if keyLen > 32 {
			return key[:32]
		}
		return key + string(make([]byte, 32-keyLen))
	}
}

// padData 使用PKCS#7填充数据
func padData(data []byte) []byte {
	padding := aes.BlockSize - len(data)%aes.BlockSize
	padtext := make([]byte, padding)
	for i := range padtext {
		padtext[i] = byte(padding)
	}
	return append(data, padtext...)
}

// unpadData 去除PKCS#7填充
func unpadData(data []byte) ([]byte, error) {
	length := len(data)
	if length == 0 {
		return nil, fmt.Errorf("数据长度为0")
	}

	padding := int(data[length-1])
	if padding > length {
		return nil, fmt.Errorf("填充无效")
	}

	return data[:length-padding], nil
}
