/**
 * 第三方授权插件 - JS客户端调用示例
 * 用于调用QQBot的第三方授权接口获取Cookie
 *
 * 使用方法:
 * 1. 修改配置区的参数
 * 2. 运行: node auth_client.js get pd.qq.com
 */

// ==================== 配置区 ====================
const CONFIG = {
    // 插件接口地址
    baseUrl: 'https://hanchat.成章.cn',
    // QQ账号ID（self_id）
    selfId: '123456789',
    // AES密钥（必须与插件config.json中的secret_key一致）
    secretKey: 'MySecretKey12345',
    // 请求的域名
    domain: 'pd.qq.com',
    // 请求超时时间（毫秒）
    timeout: 30000
};

// ==================== 加密工具 ====================

/**
 * Base64编码（与Lua端兼容）
 * @param {string} data - 原始字符串
 * @returns {string} - Base64编码
 */
function base64Encode(data) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';

    for (let i = 0; i < data.length; i += 3) {
        const b1 = data.charCodeAt(i);
        const b2 = i + 1 < data.length ? data.charCodeAt(i + 1) : 0;
        const b3 = i + 2 < data.length ? data.charCodeAt(i + 2) : 0;

        const combined = (b1 << 16) | (b2 << 8) | b3;

        result += chars[(combined >> 18) & 63];
        result += chars[(combined >> 12) & 63];
        result += (i + 1 < data.length) ? chars[(combined >> 6) & 63] : '=';
        result += (i + 2 < data.length) ? chars[combined & 63] : '=';
    }

    return result;
}

/**
 * Base64解码（与Lua端兼容）
 * @param {string} data - Base64字符串
 * @returns {string} - 解码后的字符串
 */
function base64Decode(data) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    data = data.replace(/[^A-Za-z0-9+/=]/g, '');

    let result = '';

    for (let i = 0; i < data.length; i += 4) {
        const c1 = chars.indexOf(data[i]);
        const c2 = chars.indexOf(data[i + 1]);
        const c3 = (data[i + 2] === '=') ? 0 : chars.indexOf(data[i + 2]);
        const c4 = (data[i + 3] === '=') ? 0 : chars.indexOf(data[i + 3]);

        const combined = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;

        result += String.fromCharCode((combined >> 16) & 255);
        if (data[i + 2] !== '=') result += String.fromCharCode((combined >> 8) & 255);
        if (data[i + 3] !== '=') result += String.fromCharCode(combined & 255);
    }

    return result;
}

/**
 * 密钥派生（确保16字节，与Lua端一致）
 * @param {string} key - 原始密钥
 * @returns {string} - 处理后的密钥
 */
function deriveKey(key) {
    const keyLen = key.length;
    if (keyLen === 16) {
        return key;
    } else if (keyLen < 16) {
        return key + '\0'.repeat(16 - keyLen);
    } else {
        return key.slice(0, 16);
    }
}

/**
 * PKCS7填充
 * @param {string} data - 原始数据
 * @param {number} blockSize - 块大小
 * @returns {string} - 填充后的数据
 */
function pkcs7Pad(data, blockSize = 16) {
    const padding = blockSize - (data.length % blockSize);
    return data + String.fromCharCode(padding).repeat(padding);
}

/**
 * PKCS7去填充
 * @param {string} data - 填充后的数据
 * @returns {string} - 原始数据
 */
function pkcs7Unpad(data) {
    const length = data.length;
    if (length === 0) return data;
    const padding = data.charCodeAt(length - 1);
    if (padding > 0 && padding <= 16) {
        return data.slice(0, length - padding);
    }
    return data;
}

/**
 * 字节异或（与Lua端一致）
 * @param {string} a - 数据A
 * @param {string} b - 数据B
 * @returns {string} - 异或结果
 */
function xorBytes(a, b) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
        const byteA = a.charCodeAt(i);
        const byteB = b.charCodeAt(i % b.length);
        result.push(String.fromCharCode(byteA ^ byteB));
    }
    return result.join('');
}

/**
 * 简化的AES加密（与Lua端兼容）
 * @param {string} plainText - 明文
 * @param {string} key - 密钥
 * @returns {string} - Base64编码的密文
 */
function aesEncrypt(plainText, key) {
    const derivedKey = deriveKey(key);
    const paddedData = pkcs7Pad(plainText);
    const encrypted = xorBytes(paddedData, derivedKey);
    return base64Encode(encrypted);
}

/**
 * 简化的AES解密（与Lua端兼容）
 * @param {string} cipherText - Base64编码的密文
 * @param {string} key - 密钥
 * @returns {string|null} - 明文或null
 */
function aesDecrypt(cipherText, key) {
    const derivedKey = deriveKey(key);
    const decoded = base64Decode(cipherText);
    if (!decoded || decoded.length === 0) {
        return null;
    }
    const decrypted = xorBytes(decoded, derivedKey);
    return pkcs7Unpad(decrypted);
}

// ==================== HTTP请求工具 ====================

/**
 * 发送HTTP POST请求
 * @param {string} url - 请求URL
 * @param {object} data - 请求数据
 * @param {number} timeout - 超时时间
 * @returns {Promise<object>} - 响应数据
 */
function postRequest(url, data, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const httpModule = isHttps ? require('https') : require('http');

        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'ThirdPartyAuth-Client/1.0'
            },
            timeout: timeout,
            rejectUnauthorized: false
        };

        const req = httpModule.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: responseData
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.write(postData);
        req.end();
    });
}

// ==================== 主要功能 ====================

/**
 * 生成签名token
 * 格式: domain_timestamp
 * @param {string} domain - 请求的域名
 * @returns {string} - 加密后的token
 */
function generateToken(domain) {
    const timestamp = Math.floor(Date.now() / 1000);
    const token = `${domain}_${timestamp}`;
    console.log(`生成token: ${token}`);

    const encryptedToken = aesEncrypt(token, CONFIG.secretKey);
    console.log(`加密后token: ${encryptedToken.substring(0, 30)}...`);

    return encryptedToken;
}

/**
 * 获取Cookie
 * @param {string} domain - 请求的域名
 * @returns {Promise<object>} - Cookie数据
 */
async function getCookie(domain) {
    try {
        const encryptedToken = generateToken(domain);
        const url = `${CONFIG.baseUrl}/plugins/${CONFIG.selfId}/auth`;
        const requestBody = { ok: encryptedToken };

        console.log(`\n正在请求: ${url}`);
        console.log(`请求体: ${JSON.stringify(requestBody, null, 2)}`);

        const response = await postRequest(url, requestBody, CONFIG.timeout);

        console.log(`\n响应状态: ${response.status}`);
        console.log(`响应数据: ${JSON.stringify(response.data, null, 2)}`);

        if (response.status === 200 && response.data.success) {
            if (response.data.data) {
                const decryptedData = aesDecrypt(response.data.data, CONFIG.secretKey);
                console.log(`\n解密后的数据: ${decryptedData}`);

                try {
                    const parsedData = JSON.parse(decryptedData);
                    return { success: true, data: parsedData };
                } catch (e) {
                    return { success: true, data: decryptedData };
                }
            }
            return { success: true, data: response.data };
        } else {
            return {
                success: false,
                message: response.data.message || '请求失败',
                status: response.status
            };
        }
    } catch (error) {
        console.error('请求失败:', error.message);
        return { success: false, message: error.message };
    }
}

// ==================== 命令行交互 ====================

function showHelp() {
    console.log(`
============================================
  第三方授权插件 - JS客户端
============================================

使用方法:
  node auth_client.js [命令] [参数]

命令:
  get <domain>     获取指定域名的Cookie
  token <domain>   生成并显示加密token
  help             显示此帮助信息

示例:
  node auth_client.js get pd.qq.com
  node auth_client.js get qzone.qq.com
  node auth_client.js token pd.qq.com

配置:
  修改文件顶部的 CONFIG 对象来配置参数
`);
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    switch (command.toLowerCase()) {
        case 'get': {
            const domain = args[1] || CONFIG.domain;
            console.log(`正在获取域名 "${domain}" 的Cookie...\n`);

            const result = await getCookie(domain);

            if (result.success) {
                console.log('\n============================================');
                console.log('  获取成功!');
                console.log('============================================');
                console.log(JSON.stringify(result.data, null, 2));
            } else {
                console.log('\n============================================');
                console.log('  获取失败!');
                console.log('============================================');
                console.log(`错误: ${result.message}`);
                if (result.status) {
                    console.log(`状态码: ${result.status}`);
                }
            }
            break;
        }

        case 'token': {
            const domain = args[1] || CONFIG.domain;
            console.log(`正在为域名 "${domain}" 生成token...\n`);

            const encryptedToken = generateToken(domain);

            console.log('\n============================================');
            console.log('  Token生成成功!');
            console.log('============================================');
            console.log(`原始格式: ${domain}_${Math.floor(Date.now() / 1000)}`);
            console.log(`加密结果: ${encryptedToken}`);
            console.log(`\n完整curl命令:`);
            console.log(`curl -X POST '${CONFIG.baseUrl}/plugins/${CONFIG.selfId}/auth' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"ok":"${encryptedToken}"}'`);
            break;
        }

        case 'help':
        default:
            showHelp();
            break;
    }
}

main().catch(console.error);
