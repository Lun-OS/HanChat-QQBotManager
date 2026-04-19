# QQBot Lua插件系统文档
## 目录
1. 系统概述
2. 插件基础结构
3. 全局变量和对象
4. API接口详解
5. 事件系统
6. 完整示例
7. 最佳实践
## 系统概述
QQBot Lua插件系统是一个基于沙箱环境的安全脚本执行系统，允许开发者使用Lua语言编写自定义功能来扩展QQ机器人的能力。

### 核心特性
- 沙箱安全 : 插件运行在受限环境中，无法访问危险的系统资源
- 多账号支持 : 每个QQ账号拥有独立的插件容器，插件实例完全隔离
- 事件驱动 : 基于消息、通知、请求等事件的响应机制
- 丰富API : 提供消息发送、群管理、文件操作、网络请求等多种API
- 定时任务 : 支持间隔、每日、每周、每月等多种定时任务
- 插件间通信 : 支持插件间的RPC调用和数据交换
### 插件目录结构
```
plugins/
├── {self_id}/              # QQ
账号ID目录
│   ├── {plugin_name}/      # 插
件目录
│   │   ├── main.lua        # 插
件入口文件（必需）
│   │   └── config.json     # 插
件配置文件（可选）
│   └── ...
└── blockly/                # 
Blockly可视化编辑器项目目录
```
## 插件基础结构
### 最小插件示例
```
-- 插件基本信息
plugin.name = "my_plugin"
plugin.version = "1.0.0"
plugin.description = "我的第一个
插件"

-- 初始化函数（可选）
function on_init()
    log.info("插件已启动")
end

-- 消息事件处理器
on_message(function(event)
    -- 处理消息逻辑
end)

-- 清理函数（可选）
function on_destroy()
    log.info("插件已停止")
end
```
### 插件生命周期
1. 加载阶段 : 系统读取main.lua，注册API，执行全局代码
2. 初始化阶段 : 调用 on_init() 函数（异步执行，不阻塞加载）
3. 运行阶段 : 插件接收并处理各种事件
4. 卸载阶段 : 调用 on_destroy() 函数，清理资源
## 全局变量和对象
### plugin - 当前插件信息
```
plugin.name         -- 插件名称
（字符串）
plugin.self_id      -- 绑定的QQ账
号ID（字符串）
plugin.reload()     -- 重新加载当
前插件
plugin.stop()       -- 停止当前插
件
plugin.unload_self() -- 卸载当前
插件
```
### PLUGIN_DIR - 插件工作目录
```
-- 插件专属的工作目录路径
-- 例如: plugins/123456789/
my_plugin/
local pluginDir = PLUGIN_DIR
```
## API接口详解
### 1. 日志API (log)
```
-- 记录信息级别日志
log.info("普通信息")

-- 记录警告级别日志
log.warn("警告信息")

-- 记录错误级别日志
log.error("错误信息")

-- 记录调试级别日志
log.debug("调试信息")

-- 支持表类型自动转换为JSON
log.info({key = "value", count 
= 10})
```
### 2. 配置API (config)
```
-- 获取配置项，如果不存在则返回默认值
local value = config.get("key", 
"default_value")

-- 获取所有配置
local allConfig = config.all()
```
### 3. 消息API (message) 发送消息
```
-- 发送群消息
-- 参数: group_id(群号), message
(消息内容)
-- 返回: success(是否成功), 
result(结果信息)
local success, result = message.
send_group(123456789, "你好")

-- 发送私聊消息
local success, result = message.
send_private(987654321, "你好")

-- 回复群消息（带引用）
-- 参数: group_id(群号), 
message_id(消息ID), message(消息
内容)
local success, result = message.
reply_group(123456789, "12345", 
"回复内容")

-- 回复私聊消息（带引用）
local success, result = message.
reply_private(987654321, 
"12345", "回复内容")

-- 发送群图片（base64编码）
local success, result = message.
send_group_image(123456789, 
"base64编码的图片数据")

-- 发送私聊图片（base64编码）
local success, result = message.
send_private_image(987654321, 
"base64编码的图片数据")
``` 消息操作
```
-- 撤回消息
local success, result = message.
delete_msg("消息ID")

-- 获取消息详情
local result = message.get_msg("
消息ID")

-- 获取合并转发消息
local result = message.
get_forward_msg("消息ID")

-- 标记消息已读
local result = message.
mark_msg_as_read("消息ID")

-- 设置精华消息
local result = message.
set_essence("消息ID")

-- 删除精华消息
local result = message.
delete_essence_msg("消息ID")

-- 获取精华消息列表
local result = message.
get_essence_list(123456789)

-- 设置消息表情回复
message.set_msg_emoji_like("消息
ID", "表情ID", true)

-- 取消消息表情回复
message.unset_msg_emoji_like("消
息ID", "表情ID")
``` 多媒体消息
```
-- 获取图片信息
local result = message.get_image
("图片文件名")

-- 从消息中获取图片
local result = message.
get_msg_image("消息ID")

-- 获取文件信息
local result = message.get_file
("文件ID")

-- 获取视频信息
local result = message.get_video
("视频文件名")

-- 获取语音信息
local result = message.
get_record("语音文件名")

-- 语音转文字
local result = message.
voice_to_text("消息ID")

-- OCR图片识别
local result = message.ocr_image
("图片文件名")

-- 扫描二维码
local result = message.
scan_qrcode("图片文件名")

-- 检查图片是否包含二维码
local hasQR = message.
image_has_qrcode("图片文件名")

-- 统计图片中二维码数量
local count = message.
image_count_qrcodes("图片文件名")

-- 获取图片中所有二维码
local qrcodes = message.
image_get_qrcodes("图片文件名")
``` 消息转发
```
-- 转发单条群消息
local success, result = message.
forward_group_single_msg("消息
ID", 目标群号)

-- 转发单条好友消息
local success, result = message.
forward_friend_single_msg("消息
ID", 目标用户ID)

-- 发送合并转发消息（群）
local success, result = message.
send_group_forward(群号, 消息段数
组)

-- 发送合并转发消息（私聊）
local success, result = message.
send_private_forward(用户ID, 消息
段数组)

-- 获取群消息历史
local result = message.
get_group_msg_history(群号, 消息
数量, 起始消息ID)

-- 获取好友消息历史
local result = message.
get_friend_msg_history(用户ID, 
消息数量, 起始消息ID)
``` 其他功能
```
-- 发送戳一戳
message.send_poke(群号, 用户ID)

-- 发送赞（点赞）
message.send_like(用户ID, 次数)

-- 检查URL安全性
local result = message.
check_url_safely("URL")

-- 获取AI语音角色列表
local result = message.
get_ai_characters()

-- 发送AI语音（群）
local success, result = message.
send_group_ai_record(群号, "角色
ID", "文本内容")
```
### 4. 用户API (user)
```
-- 获取用户信息
local result = user.get_info(用
户ID)

-- 获取好友列表
local result = user.get_friends
()
-- 或
local result = user.
get_friend_list()

-- 设置好友备注
local success = user.set_remark
(用户ID, "备注名")

-- 戳一戳好友
user.poke(用户ID)

-- 给好友点赞
user.send_like(用户ID, 次数)

-- 删除好友
user.delete_friend(用户ID)

-- 获取好友详细信息
local result = user.
get_friend_info(用户ID)

-- 获取陌生人信息
local result = user.
get_stranger_info(用户ID)

-- 上传私聊文件
local success = user.upload_file
(用户ID, "文件路径", "文件名")

-- 设置QQ资料
local success = user.
set_qq_profile("昵称", "公司", "
邮箱", "学校", "个人说明")
```
### 5. 群组API (group)
```
-- 获取群列表
local result = group.get_list()

-- 获取群信息
local result = group.get_info(群
号)

-- 获取群成员列表
local result = group.get_members
(群号)

-- 获取群成员信息
local result = group.
get_member_info(群号, 用户ID)

-- 设置群禁言
group.set_ban(群号, 用户ID, 禁言时
长秒数)

-- 设置全员禁言
group.set_whole_ban(群号, 
true)  -- 开启
group.set_whole_ban(群号, 
false) -- 关闭

-- 设置群管理员
group.set_admin(群号, 用户ID, 
true)  -- 设为管理员
group.set_admin(群号, 用户ID, 
false) -- 取消管理员

-- 设置群名片
group.set_card(群号, 用户ID, "名
片内容")

-- 踢出群成员
group.kick(群号, 用户ID, false) 
-- 不允许再次申请
group.kick(群号, 用户ID, true)  
-- 允许再次申请

-- 戳一戳群成员
group.poke(群号, 用户ID)

-- 设置群名称
group.set_name(群号, "新群名")

-- 设置群成员专属头衔
group.set_special_title(群号, 用
户ID, "头衔", 有效期秒数)

-- 退出群聊
group.set_leave(群号, false) -- 
不解散群
group.set_leave(群号, true)  -- 
解散群（需要权限）

-- 获取群文件系统信息
local result = group.
get_file_system_info(群号)

-- 获取群根目录文件列表
local result = group.
get_root_files(群号)

-- 获取文件夹内文件列表
local result = group.
get_files_by_folder(群号, "文件夹
ID")

-- 获取群文件下载链接
local result = group.
get_file_url(群号, "文件ID")

-- 上传群文件
local success = group.
upload_file(群号, "文件路径", "文
件夹ID", "文件名")

-- 获取群荣誉信息
local result = group.
get_honor_info(群号, 
"talkative") -- talkative/actor/
emotion
```
### 6. 存储API (storage)
```
-- 存储数据（持久化存储，插件重启后仍
然保留）
storage.set("key", "value")

-- 获取数据
local value = storage.get
("key", "默认值")

-- 删除数据
storage.delete("key")
```
### 7. 文件操作API (file)
```
-- 读取文件（相对于插件目录）
local content = file.read("data.
txt")

-- 写入文件
file.write("data.txt", "文件内容
")

-- 删除文件
file.delete("data.txt")

-- 列出插件目录下的文件
local files = file.list()

-- 检查文件是否存在
local exists = file.exists
("data.txt")

-- 创建目录
file.mkdir("subdir")

-- 读取文件（Base64编码）
local base64Content = file.
read_base64("image.png")

-- 写入文件（Base64编码）
file.write_base64("image.png", 
"base64编码内容")

-- 删除群文件
file.delete_group_file(群号, "文
件ID")

-- 创建群文件文件夹
file.create_group_file_folder(群
号, "文件夹名", "父文件夹ID")

-- 删除群文件夹
file.delete_group_folder(群号, "
文件夹ID")

-- 移动群文件
file.move_group_file(群号, "文件
ID", "原目录", "目标目录")

-- 重命名群文件
file.rename_group_file(群号, "文
件ID", "新文件名")

-- 下载文件到缓存
local result = file.
download_file("URL", "base64数据
", "文件名", {头信息})

-- 重新分享闪传文件
local result = file.
reshare_flash_file("分享链接或文件
集ID")
```
### 8. 网络请求API (http)
```
-- 发送HTTP请求
-- 参数: method, url, headers, 
body
local result = http.request
("GET", "https://api.example.
com", {["Content-Type"] = 
"application/json"}, "")

-- 下载文件并返回Base64
local base64Data = http.
download_base64("https://
example.com/image.png")

-- 发送GET请求（简化版）
local result = http.get
("https://api.example.com")

-- 发送POST请求（简化版）
local result = http.post
("https://api.example.com", "请
求体", {["Content-Type"] = 
"application/json"})
```
### 9. 请求处理API (request)
```
-- 同意好友请求
request.approve_friend("请求标识
", "备注名")

-- 同意群请求
request.approve_group("请求标识
", "备注名")

-- 设置好友添加请求
request.set_friend_add_request("
请求标识", true, "备注名")  -- 同
意
request.set_friend_add_request("
请求标识", false, "")       -- 拒
绝

-- 设置群添加请求
request.set_group_add_request("
请求标识", "add", true, "")   -- 
同意入群
request.set_group_add_request("
请求标识", "add", false, "")  -- 
拒绝入群

-- 获取可疑好友请求列表
local result = request.
get_doubt_friends()

-- 处理可疑好友请求
request.handle_doubt_friend("请
求标识", true)   -- 同意
request.handle_doubt_friend("请
求标识", false)  -- 拒绝
```
### 10. 系统API (system)
```
-- 获取当前时间戳（秒）
local timestamp = system.now()

-- 获取系统状态
local status = system.status()

-- 获取Cookies
local cookies = system.
get_cookies()

-- 调用自定义API
local result = system.call_api
("API端点", {参数表})

-- 获取时间戳（秒）
local seconds = system.
get_timestamp_seconds()

-- 获取时间戳（毫秒）
local milliseconds = system.
get_timestamp_milliseconds()

-- 获取登录信息
local info = system.
get_login_info()

-- 获取版本信息
local version = system.
get_version_info()
```
### 11. 工具API (utils)
```
-- URL编码
local encoded = utils.url_encode
("需要编码的字符串")

-- URL解码
local decoded = utils.url_decode
("需要解码的字符串")

-- Unicode转义
local escaped = utils.
unicode_escape("字符串")

-- Base64编码
local encoded = utils.
base64_encode("字符串")

-- Base64解码
local decoded = utils.
base64_decode("base64字符串")

-- HTML转义
local escaped = utils.
html_escape("<html>")

-- HTML反转义
local unescaped = utils.
html_unescape("&lt;html&gt;")
```
### 12. JSON API (json)
```
-- 编码表为JSON字符串
local jsonStr = json.encode
({key = "value"})

-- 解码JSON字符串为表
local table = json.decode('
{"key": "value"}')

-- 安全获取JSON字段（支持嵌套）
local value = json.get(json表, 
"field.nested")
```
### 13. 表操作API (table_utils)
```
-- 安全获取嵌套字段
local value = table_utils.get
(表, "key.subkey")

-- 设置嵌套字段
table_utils.set(表, "key.
subkey", "value")
```
### 14. 消息解析API (msg)
```
-- 检查是否@了机器人
local isAtBot = msg.is_at_bot
(event)

-- 获取纯文本内容
local text = msg.get_plain_text
(event)

-- 检查是否包含关键字
local contains = msg.
contains_keyword(event, "关键字
")

-- 获取消息中的图片列表
local images = msg.get_images
(event)

-- 获取消息中@的用户列表
local atUsers = msg.get_at_users
(event)

-- 检查是否包含图片
local hasImage = msg.has_image
(event)

-- 检查是否包含语音
local hasVoice = msg.has_voice
(event)

-- 获取回复的消息ID
local replyId = msg.get_reply_id
(event)

-- 获取发送者角色
local role = msg.get_sender_role
(event)  -- owner/admin/member

-- 检查发送者是否为群主
local isOwner = msg.
is_sender_owner(event)

-- 检查发送者是否为管理员
local isAdmin = msg.
is_sender_admin(event)

-- 检查发送者是否为普通成员
local isMember = msg.
is_sender_member(event)

-- 检查是否为回复消息
local hasReply = msg.has_reply
(event)

-- 检查是否为群消息
local isGroup = msg.
is_group_message(event)

-- 检查是否为私聊消息
local isPrivate = msg.
is_private_message(event)

-- 获取消息类型
local msgType = msg.get_type
(event)  -- group/private

-- 获取第一张图片的URL
local imageUrl = msg.
get_first_image(event)

-- 获取发送者ID
local senderId = msg.
get_sender_id(event)

-- 获取发送者昵称
local nickname = msg.
get_sender_nickname(event)

-- 获取群组ID
local groupId = msg.get_group_id
(event)

-- 获取消息时间
local time = msg.get_time(event)

-- 获取消息内容类型
local contentType = msg.
get_message_type(event)  -- 
text/image/face等

-- 检查是否包含视频
local hasVideo = msg.has_video
(event)

-- 检查是否包含表情
local hasFace = msg.has_face
(event)

-- 检查是否@全体成员
local isAtAll = msg.is_at_all
(event)

-- 检查是否包含URL
local hasUrl = msg.has_url
(event)

-- 统计URL数量
local count = msg.count_urls
(event)

-- 获取所有URL
local urls = msg.get_urls(event)

-- 检查是否包含JSON卡片
local hasJson = msg.has_json
(event)

-- 检查是否为联系人卡片
local isContact = msg.
is_contact_card(event)

-- 检查是否为群卡片
local isGroupCard = msg.
is_group_card(event)

-- 检查是否为频道卡片
local isChannel = msg.
is_channel_card(event)

-- 获取JSON数据
local jsonData = msg.
get_json_data(event)

-- 解析卡片信息
local cardInfo = msg.parse_card
(event)

-- 获取卡片详细信息
local cardDetail = msg.
get_card_info(event)

-- 检查JSON是否包含特定应用
local hasApp = msg.json_has_app
(event, "app名称")

-- 获取JSON应用类型
local appType = msg.
get_json_app_type(event)

-- 获取JSON字段
local field = msg.get_json_field
(event, "field.path")

-- 从URL解析卡片ID
local cardId = msg.
get_card_id_from_url("URL")

-- 完整解析卡片
local fullCard = msg.
parse_card_full(event)
```
### 15. 调度器API (scheduler)
```
-- 注册间隔任务（每N秒执行一次）
-- 参数: 秒数, 回调函数, 可选配置
{maxExec=最大执行次数}
local taskId = scheduler.
interval(60, function()
    log.info("每分钟执行一次")
end, {maxExec = 10})

-- 注册每日任务
-- 参数: 小时, 分钟, 秒, 回调函数
local taskId = scheduler.daily
(8, 0, 0, function()
    log.info("每天早上8点执行")
end)

-- 注册每周任务
-- 参数: 星期(0-6,0是周日), 小时, 
分钟, 秒, 回调函数
local taskId = scheduler.weekly
(1, 9, 0, 0, function()
    log.info("每周一早上9点执行")
end)

-- 注册每月任务
-- 参数: 日期(1-31), 小时, 分钟, 
秒, 回调函数
local taskId = scheduler.monthly
(1, 0, 0, 0, function()
    log.info("每月1号执行")
end)

-- 取消任务
scheduler.cancel(taskId)

-- 暂停任务
scheduler.pause(taskId)

-- 恢复任务
scheduler.resume(taskId)

-- 获取任务状态
local status = scheduler.
get_status(taskId)

-- 列出所有任务
local tasks = scheduler.list()
```
### 16. 机器人管理API (bot)
```
-- 获取所有机器人列表
local bots = bot.get_list()

-- 获取指定机器人信息
local info = bot.get_info("机器
人QQ号")

-- 获取机器人数量统计
local count = bot.get_count()  
-- {total=总数, online=在线数, 
offline=离线数}

-- 检查机器人是否在线
local online = bot.is_online()  
-- 检查当前插件绑定的机器人
local online = bot.is_online("机
器人QQ号")  -- 检查指定机器人

-- 断开机器人连接
bot.disconnect("机器人QQ号")

-- 获取机器人状态
local status = bot.get_status()

-- 获取版本信息
local version = bot.get_version
()
```
### 17. 插件间通信API (plugin_comm)
```
-- 连接到其他插件
local success = plugin_comm.
connect("目标机器人QQ", "目标插件名
", "连接备注")

-- 接受连接请求
local success = plugin_comm.
accept("来源机器人QQ", "来源插件名
")

-- 拒绝连接请求
local success = plugin_comm.
reject("来源机器人QQ", "来源插件名
")

-- 发送数据到已连接插件
local success = plugin_comm.send
("目标机器人QQ", "目标插件名", 
{key = "value"})

-- 接收数据（非阻塞）
local data = plugin_comm.receive
("来源机器人QQ", "来源插件名")

-- 获取待处理的连接请求
local pending = plugin_comm.
get_pending()

-- 关闭连接
plugin_comm.close("目标机器人
QQ", "目标插件名")
```
### 18. 插件RPC API (plugin_rpc)
```
-- 声明事件（注册可被其他插件调用的函
数）
plugin_rpc.declare_event("事件名
", function(args)
    -- 处理逻辑
    return {result = "success"}
end)

-- 调用函数（调用所有注册了该函数的插
件）
local results = plugin_rpc.
call_function("事件名", {参数})

-- 返回函数结果（在事件处理器中使用）
plugin_rpc.return_function(返回
值)
```
### 19. HTTP接口API (http_interface)
```
-- 注册HTTP接口
-- 参数: 路径, 方法(GET/POST), 处
理函数
http_interface.register("/api/
myplugin", "POST", function
(request)
    -- request包含: method, 
    path, headers, body, query
    return {
        status = 200,
        headers = 
        {["Content-Type"] = 
        "application/json"},
        body = json.encode
        ({success = true})
    }
end)

-- 注销HTTP接口
http_interface.unregister("/api/
myplugin")
```
### 20. 数据库API (db)
```
-- 打开数据库（CSV格式）
local database = db.open
("mydata")

-- 插入记录
local id = database:insert
({name = "张三", age = 20})

-- 查询记录
local records = database:query
({name = "张三"})  -- 条件查询
local records = database:query
()                  -- 查询所有

-- 查询单条记录
local record = 
database:query_one({id = 1})

-- 更新记录
database:update(1, {age = 21})

-- 删除记录
database:delete(1)

-- 获取记录数量
local count = database:count()

-- 清空数据库
database:clear()

-- 备份数据库
database:backup("backup_name")

-- 恢复数据库
database:restore("backup_name")

-- 简化版键值存储
db.set("dbname", "key", 
"value")        -- 存储
local value = db.get("dbname", 
"key")    -- 读取
db.delete("dbname", 
"key")               -- 删除
```
## 事件系统
### 事件类型
```
-- 消息事件
on_message(function(event)
    -- event包含:
    --   post_type: "message"
    --   message_type: "group"/
    "private"
    --   user_id: 发送者ID
    --   group_id: 群号（群消息）
    --   message: 消息内容（数组格
    式）
    --   raw_message: 原始消息字
    符串
    --   plain_text: 纯文本内容
    --   message_id: 消息ID
    --   time: 发送时间戳
    --   sender: 发送者信息表
end)

-- 通知事件
on_notice(function(event)
    -- 群文件上传、管理员变动、群成
    员变动、群禁言、好友添加等
end)

-- 请求事件
on_request(function(event)
    -- 好友添加请求、群添加请求
end)

-- 消息发送事件
on_message_sent(function(event)
    -- 机器人发送消息后的回调
end)

-- 机器人状态变化事件
on_bot_status_change(function
(event)
    -- 在线状态变化
end)
```
### 事件数据结构 群消息事件
```
{
    post_type = "message",
    message_type = "group",
    time = 1234567890,
    self_id = "123456789",
    user_id = "987654321",
    group_id = "123456789",
    message_id = "12345",
    message = {
        {type = "text", data = 
        {text = "你好"}},
        {type = "at", data = 
        {qq = "123456789"}},
        {type = "image", data = 
        {url = "http://...", 
        file = "..."}}
    },
    raw_message = "你好[CQ:at,
    qq=123456789]",
    plain_text = "你好",
    sender = {
        user_id = "987654321",
        nickname = "用户昵称",
        card = "群名片",
        role = "member",  -- 
        owner/admin/member
        title = "专属头衔"
    }
}
``` 私聊消息事件
```
{
    post_type = "message",
    message_type = "private",
    time = 1234567890,
    self_id = "123456789",
    user_id = "987654321",
    message_id = "12345",
    message = {...},
    raw_message = "...",
    plain_text = "...",
    sender = {
        user_id = "987654321",
        nickname = "用户昵称"
    }
}
```
## 完整示例
### 示例1: 简单的关键词回复插件
```
-- 插件信息
plugin.name = "keyword_reply"
plugin.version = "1.0.0"
plugin.description = "关键词自动
回复插件"

-- 配置
local replies = {
    ["你好"] = "你好呀！",
    ["帮助"] = "我可以帮你：查询天
    气、讲笑话、查资料",
    ["时间"] = function()
        return "当前时间: " .. 
        os.date("%Y-%m-%d 
        %H:%M:%S")
    end
}

function on_init()
    log.info("关键词回复插件已启动
    ")
end

on_message(function(event)
    local text = msg.
    get_plain_text(event)
    
    for keyword, reply in pairs
    (replies) do
        if text:find(keyword) 
        then
            local response
            if type(reply) == 
            "function" then
                response = reply
                ()
            else
                response = reply
            end
            
            if msg.
            is_group_message
            (event) then
                message.
                send_group
                (event.
                group_id, 
                response)
            else
                message.
                send_private
                (event.user_id, 
                response)
            end
            break
        end
    end
end)

function on_destroy()
    log.info("关键词回复插件已停止
    ")
end
```
### 示例2: 群管助手插件
```
plugin.name = "group_manager"
plugin.version = "2.0.0"
plugin.description = "群管助手 - 
提供禁言、踢人等功能"

-- 管理员QQ列表
local admins = {
    ["123456789"] = true,
    ["987654321"] = true
}

-- 检查是否为管理员
local function isAdmin(userId)
    return admins[userId] == 
    true or msg.is_sender_owner
    (__blc_var___) or msg.
    is_sender_admin
    (__blc_var___)
end

on_message(function(event)
    if not msg.is_group_message
    (event) then
        return
    end
    
    local text = msg.
    get_plain_text(event)
    local userId = tostring(msg.
    get_sender_id(event))
    
    -- 禁言命令
    if text:find("^禁言%s+%d+%s
    +%d+$") then
        if not isAdmin(userId) 
        then
            message.reply_group
            (event.group_id, 
            event.message_id, "
            你没有权限使用此命令")
            return
        end
        
        local targetId, 
        duration = text:match("^
        禁言%s+(%d+)%s+(%d+)$")
        group.set_ban(event.
        group_id, targetId, 
        tonumber(duration) * 60)
        message.reply_group
        (event.group_id, event.
        message_id, "已禁言 
        " .. duration .. " 分钟
        ")
    end
    
    -- 解除禁言命令
    if text:find("^解除禁言%s+%d
    +$") then
        if not isAdmin(userId) 
        then
            return
        end
        
        local targetId = 
        text:match("^解除禁言%s
        +(%d+)$")
        group.set_ban(event.
        group_id, targetId, 0)
        message.reply_group
        (event.group_id, event.
        message_id, "已解除禁言")
    end
    
    -- 踢人命令
    if text:find("^踢出%s+%d
    +$") then
        if not isAdmin(userId) 
        then
            return
        end
        
        local targetId = 
        text:match("^踢出%s+(%d
        +)$")
        group.kick(event.
        group_id, targetId, 
        false)
        message.reply_group
        (event.group_id, event.
        message_id, "已踢出该成员
        ")
    end
    
    -- 全员禁言
    if text == "全员禁言" then
        if not isAdmin(userId) 
        then
            return
        end
        group.set_whole_ban
        (event.group_id, true)
        message.send_group
        (event.group_id, "已开启
        全员禁言")
    end
    
    -- 解除全员禁言
    if text == "解除全员禁言" 
    then
        if not isAdmin(userId) 
        then
            return
        end
        group.set_whole_ban
        (event.group_id, false)
        message.send_group
        (event.group_id, "已解除
        全员禁言")
    end
end)
```
### 示例3: 定时任务插件
```
plugin.name = "scheduled_tasks"
plugin.version = "1.0.0"
plugin.description = "定时任务示
例"

function on_init()
    log.info("定时任务插件已启动")
    
    -- 每天早上8点发送问候
    scheduler.daily(8, 0, 0, 
    function()
        local groups = group.
        get_list()
        for _, g in ipairs
        (groups) do
            message.send_group
            (g.group_id, "早上
            好！新的一天开始了~")
        end
    end)
    
    -- 每周一早上9点发送周报提醒
    scheduler.weekly(1, 9, 0, 
    0, function()
        local groups = group.
        get_list()
        for _, g in ipairs
        (groups) do
            message.send_group
            (g.group_id, "周一早
            上好！记得提交周报哦~")
        end
    end)
    
    -- 每5分钟检查一次系统状态
    scheduler.interval(300, 
    function()
        log.info("系统状态检查...
        ")
        -- 执行检查逻辑
    end)
end

function on_destroy()
    log.info("定时任务插件已停止")
end
```
### 示例4: 使用数据库存储的签到插件
```
plugin.name = "check_in"
plugin.version = "1.0.0"
plugin.description = "群签到系统"

-- 打开数据库
local db = db.open
("checkin_data")

on_message(function(event)
    if not msg.is_group_message
    (event) then
        return
    end
    
    local text = msg.
    get_plain_text(event)
    local userId = msg.
    get_sender_id(event)
    local groupId = event.
    group_id
    
    if text == "签到" then
        -- 查询今日是否已签到
        local today = os.date
        ("%Y-%m-%d")
        local records = db:query
        ({
            user_id = userId,
            group_id = groupId,
            date = today
        })
        
        if #records > 0 then
            message.reply_group
            (groupId, event.
            message_id, "你今天已
            经签到过了！")
            return
        end
        
        -- 查询连续签到天数
        local allRecords = 
        db:query({user_id = 
        userId, group_id = 
        groupId})
        local streak = 1
        
        -- 插入签到记录
        db:insert({
            user_id = userId,
            group_id = groupId,
            date = today,
            time = os.time()
        })
        
        message.reply_group
        (groupId, event.
        message_id, 
            "签到成功！连续签到 
            " .. streak .. " 天
            ")
    end
    
    if text == "签到排行" then
        local records = db:query
        ({group_id = groupId})
        -- 统计每个人的签到次数
        local stats = {}
        for _, r in ipairs
        (records) do
            stats[r.user_id] = 
            (stats[r.user_id] 
            or 0) + 1
        end
        
        -- 排序并显示前10名
        local sorted = {}
        for uid, count in pairs
        (stats) do
            table.insert
            (sorted, {user_id = 
            uid, count = count})
        end
        table.sort(sorted, 
        function(a, b) return a.
        count > b.count end)
        
        local msg_text = "🏆 签
        到排行榜 TOP10\n"
        for i = 1, math.min(10, 
        #sorted) do
            msg_text = 
            msg_text .. i .. ". 
            " .. sorted[i].
            user_id .. " - " .. 
            sorted[i].count .. "
            次\n"
        end
        
        message.send_group
        (groupId, msg_text)
    end
end)
```
## 最佳实践
### 1. 错误处理
```
-- 始终检查API返回值
local success, result = message.
send_group(123456789, "消息")
if not success then
    log.error("发送消息失败: 
    " .. tostring(result))
end

-- 使用pcall保护危险操作
local ok, err = pcall(function()
    -- 可能出错的操作
end)
if not ok then
    log.error("操作失败: " .. 
    err)
end
```
### 2. 性能优化
```
-- 避免在事件处理器中执行耗时操作
-- 如需执行，使用异步方式

on_message(function(event)
    -- 快速响应
    message.reply_group(event.
    group_id, event.message_id, 
    "处理中...")
    
    -- 耗时操作放到后面或使用
    coroutine
    -- ...
end)
```
### 3. 安全配置
```
-- 始终验证操作权限
local function isAuthorized
(userId)
    -- 验证用户是否在白名单中
    return whitelist[userId] == 
    true
end

-- 限制操作频率
local lastOperation = {}
on_message(function(event)
    local userId = msg.
    get_sender_id(event)
    local now = os.time()
    
    if lastOperation[userId] 
    and now - lastOperation
    [userId] < 60 then
        message.reply_group
        (event.group_id, event.
        message_id, "操作太频繁，
        请稍后再试")
        return
    end
    
    lastOperation[userId] = now
    -- 执行操作
end)
```
### 4. 代码组织
```
-- 将功能模块化
local function handleCommand
(event, command)
    -- 命令处理逻辑
end

local function handleMessage
(event)
    -- 消息处理逻辑
end

on_message(function(event)
    local text = msg.
    get_plain_text(event)
    
    if text:sub(1, 1) == "/" 
    then
        handleCommand(event, 
        text)
    else
        handleMessage(event)
    end
end)
```
### 5. 日志记录
```
-- 记录关键操作
log.info("用户 " .. userId .. " 
执行了 " .. command)

-- 使用结构化日志
log.info({
    action = "send_message",
    target = groupId,
    content_length = #message
})
```