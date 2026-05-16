#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLBot 压力测试工具
模拟 LLBot 端连接管理器，支持消息接收和回复，可进行压力测试
"""

import asyncio
import json
import time
import random
import string
import signal
import sys
import ssl
import websockets
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from concurrent.futures import ThreadPoolExecutor
import statistics


@dataclass
class ConnectionConfig:
    """连接配置"""
    server_host: str = "localhost"
    server_port: int = 59178
    self_id: str = "1596534228"
    token: str = ""
    custom_name: str = "1232414"
    heartbeat_interval: float = 30.0
    reconnect_interval: float = 5.0
    max_reconnect_attempts: int = 10


@dataclass
class StressTestConfig:
    """压力测试配置"""
    message_count: int = 1000
    concurrency: int = 10
    message_interval: float = 0.01
    reply_delay: float = 0.1
    enable_reply: bool = True


@dataclass
class MessageRecord:
    """消息记录"""
    msg_id: str
    send_time: float
    reply_time: Optional[float] = None
    replied: bool = False


@dataclass
class TestResult:
    """测试结果"""
    total_sent: int = 0
    total_received: int = 0
    total_replied: int = 0
    errors: List[str] = field(default_factory=list)
    latencies: List[float] = field(default_factory=list)
    reply_latencies: List[float] = field(default_factory=list)  # 管理器回复延迟
    message_records: Dict[str, MessageRecord] = field(default_factory=dict)  # 消息记录
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time

    @property
    def avg_latency(self) -> float:
        return statistics.mean(self.latencies) if self.latencies else 0.0

    @property
    def max_latency(self) -> float:
        return max(self.latencies) if self.latencies else 0.0

    @property
    def min_latency(self) -> float:
        return min(self.latencies) if self.latencies else 0.0

    @property
    def messages_per_second(self) -> float:
        return self.total_sent / self.duration if self.duration > 0 else 0.0

    @property
    def reply_rate(self) -> float:
        """回复率（百分比）"""
        if self.total_sent == 0:
            return 0.0
        return (self.total_replied / self.total_sent) * 100

    @property
    def avg_reply_latency(self) -> float:
        """平均回复延迟（毫秒）"""
        if not self.reply_latencies:
            return 0.0
        return statistics.mean(self.reply_latencies) * 1000

    @property
    def lost_messages(self) -> int:
        """丢失的消息数（未收到回复）"""
        return self.total_sent - self.total_replied


class LLBotConnection:
    """LLBot WebSocket 连接管理器"""

    def __init__(self, config: ConnectionConfig, message_handler: Optional[Callable] = None, 
                 reply_callback: Optional[Callable] = None):
        self.config = config
        self.message_handler = message_handler
        self.reply_callback = reply_callback  # 回复回调函数
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self.reconnect_count = 0
        self.running = False
        self.pending_responses: Dict[str, asyncio.Future] = {}
        self.echo_counter = 0
        self.msg_counter = 0  # 消息计数器
        self.sent_messages: Dict[str, float] = {}  # 已发送消息的记录 {msg_id: send_time}
        self.received_replies: set = set()  # 已收到的回复
        self._lock = asyncio.Lock()
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._receive_task: Optional[asyncio.Task] = None

    def _generate_msg_id(self) -> str:
        """生成唯一的消息ID"""
        self.msg_counter += 1
        return f"msg_{self.config.self_id}_{int(time.time() * 1000)}_{self.msg_counter}"

    async def connect(self) -> bool:
        """建立 WebSocket 连接"""
        # 使用 custom_name 作为路径参数，如果没有则使用 self_id
        custom_name = self.config.custom_name or "llbot"
        uri = f"ws://{self.config.server_host}:{self.config.server_port}/ws/{custom_name}"

        headers = {
            "X-Self-ID": self.config.self_id,
        }

        if self.config.token:
            headers["Authorization"] = f"Bearer {self.config.token}"

        try:
            print(f"[*] 正在连接到 {uri}...")
            print(f"    Self-ID: {self.config.self_id}")
            print(f"    Custom-Name: {custom_name}")
            print(f"    Token: {'已设置' if self.config.token else '未设置'}")

            self.websocket = await websockets.connect(
                uri,
                extra_headers=headers,
                ping_interval=None,
                ping_timeout=None,
            )

            self.connected = True
            self.reconnect_count = 0
            print(f"[+] WebSocket 连接成功!")

            # 启动接收任务
            self.running = True
            self._receive_task = asyncio.create_task(self._receive_loop())

            # 发送 connect 消息完成认证
            await self._send_connect_message()

            # 启动心跳任务
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            return True

        except Exception as e:
            print(f"[-] 连接失败: {e}")
            return False

    async def _send_connect_message(self):
        """发送 connect 消息完成认证"""
        connect_msg = {
            "post_type": "meta_event",
            "meta_event_type": "lifecycle",
            "sub_type": "connect",
            "time": int(time.time()),
            "self_id": int(self.config.self_id),
            "status": {
                "online": True,
                "good": True
            }
        }

        print(f"[*] 发送 connect 消息进行认证...")
        await self._send_raw(connect_msg)

        # 等待一小段时间让服务器处理
        await asyncio.sleep(0.5)
        print(f"[+] 认证完成!")

    async def disconnect(self):
        """断开连接"""
        self.running = False

        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass

        if self.websocket:
            await self.websocket.close()
            self.websocket = None

        self.connected = False
        print("[*] 已断开连接")

    async def _heartbeat_loop(self):
        """心跳循环"""
        while self.running and self.connected:
            try:
                heartbeat_msg = {
                    "post_type": "meta_event",
                    "meta_event_type": "heartbeat",
                    "time": int(time.time()),
                    "self_id": self.config.self_id,
                    "status": {
                        "online": True,
                        "good": True
                    },
                    "interval": int(self.config.heartbeat_interval * 1000)
                }
                await self._send_raw(heartbeat_msg)
                await asyncio.sleep(self.config.heartbeat_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[-] 心跳发送失败: {e}")
                break

    async def _receive_loop(self):
        """接收消息循环"""
        while self.running and self.connected:
            try:
                message = await self.websocket.recv()
                data = json.loads(message)
                await self._handle_message(data)
            except asyncio.CancelledError:
                break
            except websockets.exceptions.ConnectionClosed:
                print("[-] 连接已关闭")
                self.connected = False
                break
            except Exception as e:
                print(f"[-] 接收消息错误: {e}")

    async def _handle_message(self, data: Dict[str, Any]):
        """处理接收到的消息"""
        # 检查是否是 API 响应
        if "echo" in data:
            echo = data["echo"]
            if echo in self.pending_responses:
                future = self.pending_responses.pop(echo)
                if not future.done():
                    future.set_result(data)
                return

        # 检查是否是 API 请求（来自管理器）- 这是管理器的回复
        if "action" in data:
            # 检查是否是回复消息的请求
            action = data.get("action", "")
            params = data.get("params", {})
            
            # 如果是发送消息的请求，检查是否包含原始消息ID
            if action in ["send_msg", "send_private_msg", "send_group_msg"]:
                # 尝试从参数中获取消息ID（如果管理器支持）
                msg_id = params.get("_test_msg_id")
                if msg_id and msg_id in self.sent_messages:
                    if msg_id not in self.received_replies:
                        self.received_replies.add(msg_id)
                        send_time = self.sent_messages.pop(msg_id)
                        reply_latency = time.time() - send_time
                        
                        # 调用回调通知压力测试器
                        if self.reply_callback:
                            await self.reply_callback(msg_id, reply_latency)
                        
                        print(f"[←] 收到管理器回复: msg_id={msg_id}, 延迟={reply_latency*1000:.2f}ms")
            
            await self._handle_api_request(data)
            return

        # 其他消息通过处理器处理
        if self.message_handler:
            try:
                reply = await self.message_handler(data)
                if reply:
                    await self.send_event(reply)
            except Exception as e:
                print(f"[-] 消息处理错误: {e}")

    async def _handle_api_request(self, data: Dict[str, Any]):
        """处理 API 请求"""
        action = data.get("action", "")
        params = data.get("params", {})
        echo = data.get("echo", "")

        print(f"[→] 收到 API 请求: {action}")

        # 模拟 API 响应
        response = {
            "status": "ok",
            "retcode": 0,
            "data": {},
            "echo": echo
        }

        # 根据 action 返回不同的数据
        if action == "get_version_info":
            response["data"] = {
                "app_name": "LLBot",
                "app_version": "1.0.0",
                "protocol_version": "v11"
            }
        elif action == "get_status":
            response["data"] = {
                "online": True,
                "good": True,
                "stat": {
                    "message_received": random.randint(100, 1000),
                    "message_sent": random.randint(50, 500)
                }
            }
        elif action == "get_login_info":
            response["data"] = {
                "user_id": int(self.config.self_id),
                "nickname": f"Bot_{self.config.self_id}"
            }
        elif action == "send_msg":
            response["data"] = {
                "message_id": random.randint(10000, 99999)
            }
        elif action == "send_private_msg":
            response["data"] = {
                "message_id": random.randint(10000, 99999)
            }
        elif action == "send_group_msg":
            response["data"] = {
                "message_id": random.randint(10000, 99999)
            }
        else:
            # 未知 action，返回空数据
            pass

        await self._send_raw(response)
        print(f"[←] 发送 API 响应: {action}")

    async def _send_raw(self, data: Dict[str, Any]):
        """发送原始消息"""
        if self.websocket and self.connected:
            await self.websocket.send(json.dumps(data, ensure_ascii=False))

    def _generate_echo(self) -> str:
        """生成唯一的 echo"""
        self.echo_counter += 1
        return f"echo_{self.config.self_id}_{int(time.time() * 1000)}_{self.echo_counter}"

    async def call_api(self, action: str, params: Dict[str, Any] = None, timeout: float = 30.0) -> Optional[Dict[str, Any]]:
        """调用 API 并等待响应"""
        if not self.connected:
            return None

        echo = self._generate_echo()
        request = {
            "action": action,
            "params": params or {},
            "echo": echo
        }

        # 创建 Future 等待响应
        future = asyncio.get_event_loop().create_future()
        self.pending_responses[echo] = future

        try:
            await self._send_raw(request)
            response = await asyncio.wait_for(future, timeout=timeout)
            return response
        except asyncio.TimeoutError:
            print(f"[-] API 调用超时: {action}")
            return None
        except Exception as e:
            print(f"[-] API 调用错误: {e}")
            return None
        finally:
            self.pending_responses.pop(echo, None)

    async def send_event(self, event_data: Dict[str, Any]):
        """发送事件"""
        await self._send_raw(event_data)

    async def send_private_message(self, user_id: int, message: str, auto_reply: bool = False, track_reply: bool = True) -> str:
        """发送私聊消息事件，返回消息ID用于追踪回复"""
        msg_id = self._generate_msg_id()
        
        event = {
            "post_type": "message",
            "message_type": "private",
            "time": int(time.time()),
            "self_id": int(self.config.self_id),
            "user_id": user_id,
            "message_id": random.randint(10000, 99999),
            "message": [{"type": "text", "data": {"text": message}}],
            "raw_message": message,
            "font": 0,
            "sender": {
                "user_id": user_id,
                "nickname": f"User_{user_id}",
                "sex": "unknown",
                "age": 0
            },
            "auto_reply": auto_reply,
            "_test_msg_id": msg_id  # 用于追踪回复的消息ID
        }
        
        # 记录发送时间
        if track_reply:
            self.sent_messages[msg_id] = time.time()
        
        await self.send_event(event)
        return msg_id

    async def send_group_message(self, group_id: int, user_id: int, message: str, auto_reply: bool = False, track_reply: bool = True) -> str:
        """发送群消息事件，返回消息ID用于追踪回复"""
        msg_id = self._generate_msg_id()
        
        event = {
            "post_type": "message",
            "message_type": "group",
            "time": int(time.time()),
            "self_id": int(self.config.self_id),
            "group_id": group_id,
            "user_id": user_id,
            "message_id": random.randint(10000, 99999),
            "anonymous": None,
            "message": [{"type": "text", "data": {"text": message}}],
            "raw_message": message,
            "font": 0,
            "sender": {
                "user_id": user_id,
                "nickname": f"User_{user_id}",
                "card": "",
                "sex": "unknown",
                "age": 0,
                "area": "",
                "level": 1,
                "role": "member",
                "title": ""
            },
            "auto_reply": auto_reply,
            "_test_msg_id": msg_id  # 用于追踪回复的消息ID
        }
        
        # 记录发送时间
        if track_reply:
            self.sent_messages[msg_id] = time.time()
        
        await self.send_event(event)
        return msg_id


class StressTester:
    """压力测试器"""

    def __init__(self, connection: LLBotConnection, config: StressTestConfig):
        self.connection = connection
        self.config = config
        self.result = TestResult()
        self._stop_event = asyncio.Event()
        self._reply_lock = asyncio.Lock()
        
        # 设置回复回调
        self.connection.reply_callback = self._on_reply_received

    async def _on_reply_received(self, msg_id: str, latency: float):
        """当收到管理器回复时调用"""
        async with self._reply_lock:
            self.result.total_replied += 1
            self.result.reply_latencies.append(latency)
            
            # 记录消息
            if msg_id not in self.result.message_records:
                self.result.message_records[msg_id] = MessageRecord(
                    msg_id=msg_id,
                    send_time=time.time() - latency,
                    reply_time=time.time(),
                    replied=True
                )

    async def run(self) -> TestResult:
        """运行压力测试"""
        print(f"\n{'='*60}")
        print("开始压力测试")
        print(f"{'='*60}")
        print(f"消息总数: {self.config.message_count}")
        print(f"并发数: {self.config.concurrency}")
        print(f"消息间隔: {self.config.message_interval}s")
        print(f"回复延迟: {self.config.reply_delay}s")
        print(f"启用回复: {self.config.enable_reply}")
        print(f"{'='*60}\n")

        self.result.start_time = time.time()

        # 创建并发任务
        tasks = []
        messages_per_worker = self.config.message_count // self.config.concurrency

        for i in range(self.config.concurrency):
            task = asyncio.create_task(
                self._worker(i, messages_per_worker)
            )
            tasks.append(task)

        # 等待所有任务完成或被停止
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

        self.result.end_time = time.time()
        return self.result

    async def _worker(self, worker_id: int, message_count: int):
        """工作线程"""
        for i in range(message_count):
            if self._stop_event.is_set():
                break

            try:
                start_time = time.time()

                # 随机选择消息类型
                if random.random() < 0.5:
                    msg_id = await self.connection.send_private_message(
                        user_id=random.randint(100000000, 999999999),
                        message=f"测试消息 #{worker_id}-{i}",
                        auto_reply=self.config.enable_reply,
                        track_reply=True
                    )
                else:
                    msg_id = await self.connection.send_group_message(
                        group_id=random.randint(100000000, 999999999),
                        user_id=random.randint(100000000, 999999999),
                        message=f"测试消息 #{worker_id}-{i}",
                        auto_reply=self.config.enable_reply,
                        track_reply=True
                    )

                self.result.total_sent += 1
                
                # 记录消息
                self.result.message_records[msg_id] = MessageRecord(
                    msg_id=msg_id,
                    send_time=start_time
                )

                # 计算发送延迟
                latency = time.time() - start_time
                self.result.latencies.append(latency)

                # 每100条消息打印一次进度
                if (i + 1) % 100 == 0:
                    reply_rate = (self.result.total_replied / self.result.total_sent * 100) if self.result.total_sent > 0 else 0
                    print(f"\n  Worker {worker_id}: 已发送 {i + 1}/{message_count} | 总回复: {self.result.total_replied}/{self.result.total_sent} ({reply_rate:.1f}%)")

                # 消息间隔
                if self.config.message_interval > 0:
                    await asyncio.sleep(self.config.message_interval)

            except Exception as e:
                error_msg = f"Worker {worker_id} msg {i}: {str(e)}"
                self.result.errors.append(error_msg)
                print(f"\n[-] {error_msg}")

    def stop(self):
        """停止测试"""
        self._stop_event.set()

    def print_report(self):
        """打印测试报告"""
        print(f"\n{'='*60}")
        print("压力测试报告")
        print(f"{'='*60}")
        print(f"测试时长: {self.result.duration:.2f} 秒")
        print(f"\n[发送统计]")
        print(f"  发送消息: {self.result.total_sent}")
        print(f"  收到回复: {self.result.total_replied}")
        print(f"  丢失消息: {self.result.lost_messages}")
        print(f"  回复率: {self.result.reply_rate:.2f}%")
        print(f"\n[性能统计]")
        print(f"  吞吐量: {self.result.messages_per_second:.2f} 消息/秒")
        print(f"  发送平均延迟: {self.result.avg_latency*1000:.2f} ms")
        print(f"  发送最小延迟: {self.result.min_latency*1000:.2f} ms")
        print(f"  发送最大延迟: {self.result.max_latency*1000:.2f} ms")
        if self.result.reply_latencies:
            print(f"\n[回复延迟统计]")
            print(f"  平均回复延迟: {self.result.avg_reply_latency:.2f} ms")
            print(f"  最小回复延迟: {min(self.result.reply_latencies)*1000:.2f} ms")
            print(f"  最大回复延迟: {max(self.result.reply_latencies)*1000:.2f} ms")
        print(f"\n[错误统计]")
        print(f"  错误数: {len(self.result.errors)}")
        if self.result.errors:
            print(f"  错误示例: {self.result.errors[0]}")
            if len(self.result.errors) > 1:
                print(f"  ... 还有 {len(self.result.errors)-1} 个错误")
        print(f"{'='*60}\n")
        
        # 如果回复率低于90%，给出警告
        if self.result.reply_rate < 90 and self.result.total_sent > 0:
            print(f"[!] 警告: 回复率低于 90%，可能存在消息丢失或管理器处理延迟过高")
            print(f"[!] 建议检查管理器日志，查看是否有错误或被拒绝的消息\n")


class InteractiveShell:
    """交互式命令行"""

    def __init__(self, connection: LLBotConnection):
        self.connection = connection
        self.stress_tester: Optional[StressTester] = None

    async def run(self):
        """运行交互式命令行"""
        print("\n" + "="*60)
        print("LLBot 压力测试工具 - 交互模式")
        print("="*60)
        print("可用命令:")
        print("  help     - 显示帮助")
        print("  status   - 显示连接状态")
        print("  api      - 调用 API")
        print("  msg      - 发送测试消息")
        print("  stress   - 开始压力测试")
        print("  stop     - 停止压力测试")
        print("  report   - 显示测试报告")
        print("  quit     - 退出")
        print("="*60 + "\n")

        while True:
            try:
                cmd = input("> ").strip().lower()

                if cmd == "quit" or cmd == "exit":
                    break
                elif cmd == "help":
                    self._show_help()
                elif cmd == "status":
                    self._show_status()
                elif cmd == "api":
                    await self._call_api()
                elif cmd == "msg":
                    await self._send_message()
                elif cmd == "stress":
                    await self._start_stress_test()
                elif cmd == "stop":
                    self._stop_stress_test()
                elif cmd == "report":
                    self._show_report()
                else:
                    print("未知命令，输入 'help' 查看帮助")

            except Exception as e:
                print(f"[-] 错误: {e}")

    def _show_help(self):
        """显示帮助"""
        print("\n命令说明:")
        print("  help   - 显示此帮助信息")
        print("  status - 显示当前连接状态")
        print("  api    - 调用 OneBot API (如 get_version_info)")
        print("  msg    - 发送测试消息到管理器")
        print("  stress - 配置并启动压力测试")
        print("  stop   - 停止正在运行的压力测试")
        print("  report - 显示最后一次测试报告")
        print("  quit   - 退出程序\n")

    def _show_status(self):
        """显示连接状态"""
        status = "已连接" if self.connection.connected else "未连接"
        print(f"\n连接状态: {status}")
        print(f"Self ID: {self.connection.config.self_id}")
        print(f"服务器: {self.connection.config.server_host}:{self.connection.config.server_port}")
        print(f"待处理响应: {len(self.connection.pending_responses)}\n")

    async def _call_api(self):
        """调用 API"""
        print("\n可用 API:")
        apis = [
            "get_version_info",
            "get_status",
            "get_login_info",
            "send_msg",
            "send_private_msg",
            "send_group_msg"
        ]
        for i, api in enumerate(apis, 1):
            print(f"  {i}. {api}")
        print("  0. 自定义")

        try:
            choice = int(input("\n选择 API (0-6): "))
            if choice == 0:
                action = input("输入 API 名称: ").strip()
            elif 1 <= choice <= len(apis):
                action = apis[choice - 1]
            else:
                print("无效选择")
                return

            params_str = input("输入参数 (JSON格式，可选): ").strip()
            params = json.loads(params_str) if params_str else {}

            print(f"[*] 调用 API: {action}")
            response = await self.connection.call_api(action, params)

            if response:
                print(f"[+] 响应:\n{json.dumps(response, indent=2, ensure_ascii=False)}\n")
            else:
                print("[-] 未收到响应\n")

        except json.JSONDecodeError:
            print("[-] JSON 格式错误\n")
        except Exception as e:
            print(f"[-] 错误: {e}\n")

    async def _send_message(self):
        """发送测试消息"""
        print("\n消息类型:")
        print("  1. 私聊消息")
        print("  2. 群消息")

        try:
            msg_type = int(input("选择类型 (1-2): "))
            message = input("输入消息内容: ").strip()

            if not message:
                message = "测试消息"

            if msg_type == 1:
                user_id = int(input("输入用户ID (默认随机): ") or random.randint(100000000, 999999999))
                await self.connection.send_private_message(user_id, message)
                print(f"[+] 已发送私聊消息到 {user_id}\n")
            elif msg_type == 2:
                group_id = int(input("输入群ID (默认随机): ") or random.randint(100000000, 999999999))
                user_id = int(input("输入用户ID (默认随机): ") or random.randint(100000000, 999999999))
                await self.connection.send_group_message(group_id, user_id, message)
                print(f"[+] 已发送群消息到群 {group_id}\n")
            else:
                print("无效选择\n")

        except ValueError:
            print("[-] 输入格式错误\n")
        except Exception as e:
            print(f"[-] 错误: {e}\n")

    async def _start_stress_test(self):
        """启动压力测试"""
        if self.stress_tester:
            print("[-] 压力测试已在运行\n")
            return

        print("\n配置压力测试:")

        try:
            message_count = int(input("消息总数 (默认1000): ") or 1000)
            concurrency = int(input("并发数 (默认10): ") or 10)
            message_interval = float(input("消息间隔秒数 (默认0.01): ") or 0.01)
            reply_delay = float(input("回复延迟秒数 (默认0.1): ") or 0.1)
            enable_reply = input("启用自动回复? (y/n, 默认y): ").lower() != "n"

            config = StressTestConfig(
                message_count=message_count,
                concurrency=concurrency,
                message_interval=message_interval,
                reply_delay=reply_delay,
                enable_reply=enable_reply
            )

            self.stress_tester = StressTester(self.connection, config)

            # 直接运行测试（阻塞等待完成）
            await self._run_stress_test()

        except ValueError:
            print("[-] 输入格式错误\n")

    async def _run_stress_test(self):
        """运行压力测试"""
        try:
            # 创建进度显示任务
            progress_task = asyncio.create_task(self._show_progress())
            
            # 运行测试
            await self.stress_tester.run()
            
            # 停止进度显示
            progress_task.cancel()
            try:
                await progress_task
            except asyncio.CancelledError:
                pass
            
            # 打印报告
            self.stress_tester.print_report()
        except Exception as e:
            print(f"[-] 压力测试错误: {e}\n")
        finally:
            self.stress_tester = None
            
    async def _show_progress(self):
         """显示测试进度"""
         while self.stress_tester and not self.stress_tester._stop_event.is_set():
             result = self.stress_tester.result
             if result.start_time > 0:
                 elapsed = time.time() - result.start_time
                 sent = result.total_sent
                 replied = result.total_replied
                 reply_rate = (replied / sent * 100) if sent > 0 else 0
                 print(f"\r[*] 进度: {sent} 已发送 | {replied} 已回复 ({reply_rate:.1f}%) | 运行: {elapsed:.1f}s", end="", flush=True)
             await asyncio.sleep(0.5)

    def _stop_stress_test(self):
        """停止压力测试"""
        if self.stress_tester:
            self.stress_tester.stop()
            print("[*] 正在停止压力测试...\n")
        else:
            print("[-] 没有正在运行的压力测试\n")

    def _show_report(self):
        """显示测试报告"""
        if self.stress_tester and self.stress_tester.result:
            self.stress_tester.print_report()
        else:
            print("[-] 没有可用的测试报告\n")


# ============================================
# 默认配置 - 修改这里来配置连接参数
# ============================================
DEFAULT_CONFIG = ConnectionConfig(
    server_host="localhost",      # 服务器地址
    server_port=59178,             # 服务器端口
    self_id="1596534228",         # QQ号（必填）
    token="",                     # Token（可选）
    custom_name="llbot",          # 自定义名称
    heartbeat_interval=30.0,      # 心跳间隔（秒）
)


def get_user_config() -> ConnectionConfig:
    """获取用户配置 - 使用默认配置或交互式输入"""
    import sys
    
    # 如果有 --default 参数，直接使用默认配置
    if "--default" in sys.argv:
        print("\n[*] 使用默认配置")
        return DEFAULT_CONFIG
    
    print("\n" + "="*60)
    print("LLBot 连接配置")
    print("="*60)
    print("提示: 使用 --default 参数可直接使用默认配置")
    print("="*60)

    config = ConnectionConfig()

    # 服务器地址
    host = input(f"服务器地址 (默认 {DEFAULT_CONFIG.server_host}): ").strip()
    config.server_host = host if host else DEFAULT_CONFIG.server_host

    # 端口
    port_str = input(f"服务器端口 (默认 {DEFAULT_CONFIG.server_port}): ").strip()
    config.server_port = int(port_str) if port_str else DEFAULT_CONFIG.server_port

    # Self ID
    self_id = input(f"Self ID (默认 {DEFAULT_CONFIG.self_id}): ").strip()
    config.self_id = self_id if self_id else DEFAULT_CONFIG.self_id
    if not config.self_id:
        print("[-] Self ID 不能为空，使用默认值")
        config.self_id = DEFAULT_CONFIG.self_id

    # Token
    token = input(f"Token (默认 {DEFAULT_CONFIG.token or '无'}): ").strip()
    config.token = token if token else DEFAULT_CONFIG.token

    # Custom Name
    custom_name = input(f"自定义名称 (默认 {DEFAULT_CONFIG.custom_name}): ").strip()
    config.custom_name = custom_name if custom_name else DEFAULT_CONFIG.custom_name

    # 心跳间隔
    heartbeat = input(f"心跳间隔秒数 (默认 {DEFAULT_CONFIG.heartbeat_interval}): ").strip()
    config.heartbeat_interval = float(heartbeat) if heartbeat else DEFAULT_CONFIG.heartbeat_interval

    print("="*60 + "\n")
    return config


async def quick_stress_test(connection: LLBotConnection):
    """快速压力测试模式"""
    print("\n" + "="*60)
    print("快速压力测试模式")
    print("="*60)
    
    config = StressTestConfig(
        message_count=1000,
        concurrency=10,
        message_interval=0.01,
        reply_delay=0.1,
        enable_reply=True
    )
    
    tester = StressTester(connection, config)
    await tester.run()
    tester.print_report()


async def main():
    """主函数"""
    print("\n" + "="*60)
    print("LLBot 压力测试工具")
    print("="*60)
    print("用于模拟 LLBot 端连接管理器并进行压力测试")
    print("="*60)
    
    # 检查命令行参数
    import sys
    quick_mode = "--quick" in sys.argv or "-q" in sys.argv

    # 获取配置
    config = get_user_config()

    # 创建连接
    connection = LLBotConnection(config)

    # 连接服务器
    if not await connection.connect():
        print("[-] 无法连接到服务器，退出")
        return

    try:
        if quick_mode:
            # 快速测试模式
            await quick_stress_test(connection)
        else:
            # 启动交互式命令行
            shell = InteractiveShell(connection)
            await shell.run()
    finally:
        # 断开连接
        await connection.disconnect()
        print("[*] 程序已退出")


if __name__ == "__main__":
    asyncio.run(main())
