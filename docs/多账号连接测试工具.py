#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLBot 多账号连接测试工具
模拟多个 LLBot 端同时连接管理器，支持消息接收和回复
"""

import asyncio
import json
import time
import random
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
    """单个连接配置"""
    server_host: str = "localhost"
    server_port: int = 59178
    self_id: str = ""
    token: str = ""
    custom_name: str = ""
    heartbeat_interval: float = 30.0
    reconnect_interval: float = 5.0
    max_reconnect_attempts: int = 10


@dataclass
class MultiAccountConfig:
    """多账号配置"""
    connections: List[ConnectionConfig] = field(default_factory=list)
    enable_stress_test: bool = False
    message_count: int = 100
    concurrency_per_account: int = 1
    message_interval: float = 0.1
    enable_reply: bool = True
    ramp_up_seconds: float = 0.0
    stagger_connections: bool = False


@dataclass
class TestResult:
    """单个账号测试结果"""
    self_id: str = ""
    connected: bool = False
    total_sent: int = 0
    total_received: int = 0
    total_replied: int = 0
    errors: List[str] = field(default_factory=list)
    latencies: List[float] = field(default_factory=list)
    reply_latencies: List[float] = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0


@dataclass
class AggregatedResult:
    """聚合测试结果"""
    accounts: List[TestResult] = field(default_factory=list)
    total_accounts: int = 0
    connected_accounts: int = 0
    start_time: float = 0.0
    end_time: float = 0.0


class LLBotConnection:
    """LLBot WebSocket 连接管理器"""

    def __init__(self, config: ConnectionConfig, message_handler: Optional[Callable] = None, 
                 reply_callback: Optional[Callable] = None):
        self.config = config
        self.message_handler = message_handler
        self.reply_callback = reply_callback
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self.reconnect_count = 0
        self.running = False
        self.pending_responses: Dict[str, asyncio.Future] = {}
        self.echo_counter = 0
        self.msg_counter = 0
        self.sent_messages: Dict[str, float] = {}
        self.received_replies: set = set()
        self._lock = asyncio.Lock()
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._receive_task: Optional[asyncio.Task] = None
        self.result = TestResult(self_id=config.self_id)

    def _generate_msg_id(self) -> str:
        """生成唯一的消息ID"""
        self.msg_counter += 1
        return f"msg_{self.config.self_id}_{int(time.time() * 1000)}_{self.msg_counter}"

    async def connect(self) -> bool:
        """建立 WebSocket 连接"""
        custom_name = self.config.custom_name or f"llbot_{self.config.self_id}"
        uri = f"ws://{self.config.server_host}:{self.config.server_port}/ws/{custom_name}"

        headers = {
            "X-Self-ID": self.config.self_id,
        }

        if self.config.token:
            headers["Authorization"] = f"Bearer {self.config.token}"

        try:
            print(f"[*] [{self.config.self_id}] 正在连接到 {uri}...")
            self.websocket = await websockets.connect(
                uri,
                extra_headers=headers,
                ping_interval=None,
                ping_timeout=None,
            )

            self.connected = True
            self.reconnect_count = 0
            self.result.connected = True
            print(f"[+] [{self.config.self_id}] WebSocket 连接成功!")

            self.running = True
            self._receive_task = asyncio.create_task(self._receive_loop())

            await self._send_connect_message()
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

            return True

        except Exception as e:
            print(f"[-] [{self.config.self_id}] 连接失败: {e}")
            self.result.errors.append(f"连接失败: {e}")
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

        await self._send_raw(connect_msg)
        await asyncio.sleep(0.5)
        print(f"[+] [{self.config.self_id}] 认证完成!")

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
        self.result.connected = False
        print(f"[*] [{self.config.self_id}] 已断开连接")

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
                print(f"[-] [{self.config.self_id}] 心跳发送失败: {e}")
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
                print(f"[-] [{self.config.self_id}] 连接已关闭")
                self.connected = False
                self.result.connected = False
                break
            except Exception as e:
                print(f"[-] [{self.config.self_id}] 接收消息错误: {e}")
                self.result.errors.append(f"接收错误: {e}")

    async def _handle_message(self, data: Dict[str, Any]):
        """处理接收到的消息"""
        self.result.total_received += 1

        if "echo" in data:
            echo = data["echo"]
            if echo in self.pending_responses:
                future = self.pending_responses.pop(echo)
                if not future.done():
                    future.set_result(data)
                return

        if "action" in data:
            action = data.get("action", "")
            params = data.get("params", {})
            
            if action in ["send_msg", "send_private_msg", "send_group_msg"]:
                msg_id = params.get("_test_msg_id")
                if msg_id and msg_id in self.sent_messages:
                    if msg_id not in self.received_replies:
                        self.received_replies.add(msg_id)
                        send_time = self.sent_messages.pop(msg_id)
                        reply_latency = time.time() - send_time
                        
                        if self.reply_callback:
                            await self.reply_callback(self.config.self_id, msg_id, reply_latency)
                        
                        self.result.total_replied += 1
                        self.result.reply_latencies.append(reply_latency)
            
            await self._handle_api_request(data)
            return

        if self.message_handler:
            try:
                reply = await self.message_handler(data)
                if reply:
                    await self.send_event(reply)
            except Exception as e:
                print(f"[-] [{self.config.self_id}] 消息处理错误: {e}")

    async def _handle_api_request(self, data: Dict[str, Any]):
        """处理 API 请求"""
        action = data.get("action", "")
        echo = data.get("echo", "")

        response = {
            "status": "ok",
            "retcode": 0,
            "data": {},
            "echo": echo
        }

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
        elif action in ["send_msg", "send_private_msg", "send_group_msg"]:
            response["data"] = {
                "message_id": random.randint(10000, 99999)
            }

        await self._send_raw(response)

    async def _send_raw(self, data: Dict[str, Any]):
        """发送原始消息"""
        if self.websocket and self.connected:
            await self.websocket.send(json.dumps(data, ensure_ascii=False))

    def _generate_echo(self) -> str:
        """生成唯一的 echo"""
        self.echo_counter += 1
        return f"echo_{self.config.self_id}_{int(time.time() * 1000)}_{self.echo_counter}"

    async def send_private_message(self, user_id: int, message: str, track_reply: bool = True) -> str:
        """发送私聊消息"""
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
            "_test_msg_id": msg_id
        }
        
        if track_reply:
            self.sent_messages[msg_id] = time.time()
        
        await self.send_event(event)
        self.result.total_sent += 1
        return msg_id

    async def send_group_message(self, group_id: int, user_id: int, message: str, track_reply: bool = True) -> str:
        """发送群消息"""
        msg_id = self._generate_msg_id()
        
        event = {
            "post_type": "message",
            "message_type": "group",
            "time": int(time.time()),
            "self_id": int(self.config.self_id),
            "group_id": group_id,
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
            "_test_msg_id": msg_id
        }
        
        if track_reply:
            self.sent_messages[msg_id] = time.time()
        
        await self.send_event(event)
        self.result.total_sent += 1
        return msg_id

    async def send_event(self, event_data: Dict[str, Any]):
        """发送事件"""
        await self._send_raw(event_data)


class MultiAccountTester:
    """多账号测试器"""

    def __init__(self, config: MultiAccountConfig):
        self.config = config
        self.connections: List[LLBotConnection] = []
        self.aggregated_result = AggregatedResult()
        self._stop_event = asyncio.Event()
        self._progress_task: Optional[asyncio.Task] = None

    async def setup_connections(self):
        """设置所有连接"""
        print(f"\n{'='*60}")
        print("开始建立多账号连接")
        print(f"{'='*60}")
        print(f"账号总数: {len(self.config.connections)}")
        if self.config.stagger_connections:
            print(f"交错连接: 启用")
        print(f"{'='*60}\n")

        tasks = []
        for idx, conn_config in enumerate(self.config.connections):
            connection = LLBotConnection(conn_config)
            self.connections.append(connection)
            
            if self.config.stagger_connections and idx > 0:
                await asyncio.sleep(0.5)
            
            tasks.append(connection.connect())

        await asyncio.gather(*tasks)

        self.aggregated_result.total_accounts = len(self.config.connections)
        self.aggregated_result.connected_accounts = sum(1 for c in self.connections if c.connected)
        
        print(f"\n{'='*60}")
        print(f"连接完成: {self.aggregated_result.connected_accounts}/{self.aggregated_result.total_accounts}")
        print(f"{'='*60}\n")

    async def run_stress_test(self):
        """运行压力测试"""
        if not self.config.enable_stress_test:
            return

        print(f"\n{'='*60}")
        print("开始压力测试")
        print(f"{'='*60}")
        print(f"账号数量: {self.aggregated_result.connected_accounts}")
        print(f"每个账号发送: {self.config.message_count} 条")
        print(f"每账号并发数: {self.config.concurrency_per_account}")
        print(f"消息间隔: {self.config.message_interval}s")
        print(f"总消息数: {self.aggregated_result.connected_accounts * self.config.message_count}")
        if self.config.ramp_up_seconds > 0:
            print(f"预热时间: {self.config.ramp_up_seconds}s")
        print(f"{'='*60}\n")

        self.aggregated_result.start_time = time.time()
        for conn in self.connections:
            conn.result.start_time = time.time()

        # 启动进度显示
        self._progress_task = asyncio.create_task(self._show_progress())

        # 预热期（如果配置）
        if self.config.ramp_up_seconds > 0:
            print(f"[*] 预热中 ({self.config.ramp_up_seconds}s)...")
            await asyncio.sleep(self.config.ramp_up_seconds)
            print(f"[+] 预热完成，开始发送消息\n")

        tasks = []
        for connection in self.connections:
            if connection.connected:
                task = asyncio.create_task(self._account_worker(connection))
                tasks.append(task)

        await asyncio.gather(*tasks)

        # 停止进度显示
        if self._progress_task:
            self._progress_task.cancel()
            try:
                await self._progress_task
            except asyncio.CancelledError:
                pass

        self.aggregated_result.end_time = time.time()
        for conn in self.connections:
            conn.result.end_time = time.time()
            self.aggregated_result.accounts.append(conn.result)

    async def _account_worker(self, connection: LLBotConnection):
        """单个账号的工作线程"""
        messages_per_worker = self.config.message_count // self.config.concurrency_per_account
        
        worker_tasks = []
        for i in range(self.config.concurrency_per_account):
            worker_task = asyncio.create_task(
                self._message_worker(connection, i, messages_per_worker)
            )
            worker_tasks.append(worker_task)
        
        await asyncio.gather(*worker_tasks)

    async def _message_worker(self, connection: LLBotConnection, worker_id: int, count: int):
        """消息发送工作线程"""
        for i in range(count):
            if self._stop_event.is_set():
                break

            try:
                start_time = time.time()

                if random.random() < 0.5:
                    await connection.send_private_message(
                        user_id=random.randint(100000000, 999999999),
                        message=f"测试消息 [{connection.config.self_id}]-{worker_id}-{i}",
                        track_reply=self.config.enable_reply
                    )
                else:
                    await connection.send_group_message(
                        group_id=random.randint(100000000, 999999999),
                        user_id=random.randint(100000000, 999999999),
                        message=f"测试消息 [{connection.config.self_id}]-{worker_id}-{i}",
                        track_reply=self.config.enable_reply
                    )

                latency = time.time() - start_time
                connection.result.latencies.append(latency)

                if self.config.message_interval > 0:
                    await asyncio.sleep(self.config.message_interval)

            except Exception as e:
                error_msg = f"[{connection.config.self_id}] Worker {worker_id} msg {i}: {str(e)}"
                connection.result.errors.append(error_msg)
                print(f"\n[-] {error_msg}")

    async def _show_progress(self):
        """显示测试进度"""
        while not self._stop_event.is_set():
            total_sent = sum(c.result.total_sent for c in self.connections)
            total_replied = sum(c.result.total_replied for c in self.connections)
            total_expected = self.aggregated_result.connected_accounts * self.config.message_count
            elapsed = time.time() - self.aggregated_result.start_time
            
            progress = (total_sent / total_expected * 100) if total_expected > 0 else 0
            throughput = total_sent / elapsed if elapsed > 0 else 0
            
            print(f"\r[进度] {total_sent}/{total_expected} ({progress:.1f}) | 回复: {total_replied} | 吞吐量: {throughput:.1f}/s | 运行: {elapsed:.1f}s", end="", flush=True)
            await asyncio.sleep(0.5)

    async def run_monitor(self, duration: Optional[float] = None):
        """运行监控模式（持续连接，不发送消息）"""
        print(f"\n{'='*60}")
        print("监控模式 - 保持连接")
        print(f"{'='*60}")
        
        if duration:
            print(f"持续时间: {duration} 秒")
            print(f"{'='*60}\n")
            
            self.aggregated_result.start_time = time.time()
            await asyncio.sleep(duration)
            self.aggregated_result.end_time = time.time()
        else:
            print("按 Ctrl+C 停止")
            print(f"{'='*60}\n")
            
            self.aggregated_result.start_time = time.time()
            try:
                while not self._stop_event.is_set():
                    await asyncio.sleep(1)
            except KeyboardInterrupt:
                pass
            self.aggregated_result.end_time = time.time()

    async def disconnect_all(self):
        """断开所有连接"""
        print(f"\n[*] 正在断开所有连接...")
        tasks = [conn.disconnect() for conn in self.connections]
        await asyncio.gather(*tasks)

    def print_report(self):
        """打印测试报告"""
        print(f"\n{'='*60}")
        print("多账号测试报告")
        print(f"{'='*60}")
        
        duration = self.aggregated_result.end_time - self.aggregated_result.start_time
        print(f"测试时长: {duration:.2f} 秒")
        print(f"账号总数: {self.aggregated_result.total_accounts}")
        print(f"连接成功: {self.aggregated_result.connected_accounts}")
        
        total_sent = sum(a.total_sent for a in self.aggregated_result.accounts)
        total_received = sum(a.total_received for a in self.aggregated_result.accounts)
        total_replied = sum(a.total_replied for a in self.aggregated_result.accounts)
        total_errors = sum(len(a.errors) for a in self.aggregated_result.accounts)
        
        # 收集所有延迟数据
        all_latencies = []
        all_reply_latencies = []
        for account in self.aggregated_result.accounts:
            all_latencies.extend(account.latencies)
            all_reply_latencies.extend(account.reply_latencies)
        
        print(f"\n[整体统计]")
        print(f"  发送消息: {total_sent}")
        print(f"  接收消息: {total_received}")
        print(f"  收到回复: {total_replied}")
        print(f"  错误总数: {total_errors}")
        
        if total_sent > 0:
            print(f"  吞吐量: {total_sent/duration:.2f} 消息/秒")
            reply_rate = (total_replied / total_sent * 100) if total_sent > 0 else 0
            print(f"  回复率: {reply_rate:.2f}%")
        
        if all_latencies:
            avg_latency = statistics.mean(all_latencies) * 1000
            max_latency = max(all_latencies) * 1000
            min_latency = min(all_latencies) * 1000
            print(f"\n[发送延迟统计]")
            print(f"  平均延迟: {avg_latency:.2f} ms")
            print(f"  最小延迟: {min_latency:.2f} ms")
            print(f"  最大延迟: {max_latency:.2f} ms")
        
        if all_reply_latencies:
            avg_reply = statistics.mean(all_reply_latencies) * 1000
            max_reply = max(all_reply_latencies) * 1000
            min_reply = min(all_reply_latencies) * 1000
            print(f"\n[回复延迟统计]")
            print(f"  平均延迟: {avg_reply:.2f} ms")
            print(f"  最小延迟: {min_reply:.2f} ms")
            print(f"  最大延迟: {max_reply:.2f} ms")
        
        print(f"\n[单账号详情]")
        for account in self.aggregated_result.accounts:
            print(f"  [{account.self_id}] 连接: {'是' if account.connected else '否'} | 发送: {account.total_sent} | 接收: {account.total_received} | 回复: {account.total_replied} | 错误: {len(account.errors)}")
        
        print(f"{'='*60}\n")


# ============================================
# 默认配置 - 修改这里来配置连接参数
# ============================================

async def main():
    """主函数"""
    print("\n" + "="*60)
    print("LLBot 多账号连接测试工具")
    print("="*60)
    print("模拟多个 LLBot 端同时连接管理器")
    print("="*60)
    
    import sys
    
    if "--help" in sys.argv or "-h" in sys.argv:
        print_help()
        return
    
    # 解析命令行参数
    account_count = 5
    enable_stress = False
    monitor_duration = None
    message_count = 100
    concurrency_per_account = 1
    message_interval = 0.1
    enable_reply = True
    ramp_up_seconds = 0.0
    stagger_connections = False
    server_host = "localhost"
    server_port = 59178
    
    if "--count" in sys.argv:
        try:
            idx = sys.argv.index("--count")
            account_count = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass
    
    if "--messages" in sys.argv:
        try:
            idx = sys.argv.index("--messages")
            message_count = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass
    
    if "--concurrency" in sys.argv:
        try:
            idx = sys.argv.index("--concurrency")
            concurrency_per_account = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass
    
    if "--interval" in sys.argv:
        try:
            idx = sys.argv.index("--interval")
            message_interval = float(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass
    
    if "--ramp-up" in sys.argv:
        try:
            idx = sys.argv.index("--ramp-up")
            ramp_up_seconds = float(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass
    
    if "--host" in sys.argv:
        try:
            idx = sys.argv.index("--host")
            server_host = sys.argv[idx + 1]
        except (IndexError, ValueError):
            pass
    
    if "--port" in sys.argv:
        try:
            idx = sys.argv.index("--port")
            server_port = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            pass
    
    if "--no-reply" in sys.argv:
        enable_reply = False
    
    if "--stagger" in sys.argv:
        stagger_connections = True
    
    if "--stress" in sys.argv:
        enable_stress = True
    
    if "--monitor" in sys.argv:
        try:
            idx = sys.argv.index("--monitor")
            if idx + 1 < len(sys.argv) and sys.argv[idx + 1].replace(".", "").isdigit():
                monitor_duration = float(sys.argv[idx + 1])
            else:
                monitor_duration = None
        except (IndexError, ValueError):
            monitor_duration = None
    
    # 生成账号配置
    accounts = generate_default_accounts(account_count, server_host, server_port)
    
    # 创建配置
    config = MultiAccountConfig(
        connections=accounts,
        enable_stress_test=enable_stress,
        message_count=message_count,
        concurrency_per_account=concurrency_per_account,
        message_interval=message_interval,
        enable_reply=enable_reply,
        ramp_up_seconds=ramp_up_seconds,
        stagger_connections=stagger_connections
    )
    
    # 创建测试器
    tester = MultiAccountTester(config)
    
    try:
        # 建立连接
        await tester.setup_connections()
        
        if enable_stress:
            await tester.run_stress_test()
        else:
            await tester.run_monitor(monitor_duration)
        
        tester.print_report()
        
    finally:
        await tester.disconnect_all()
        print("[*] 程序已退出")


def print_help():
    """打印帮助信息"""
    print("""
使用方法:
    python 多账号连接测试工具.py [选项]

选项:
    -h, --help              显示帮助信息
    --count N               账号数量 (默认: 5)
    --host HOST             服务器地址 (默认: localhost)
    --port PORT             服务器端口 (默认: 59178)
    --stress                启用压力测试模式
    --monitor [SECS]        启用监控模式，可选持续时间(秒)
    --messages N            每个账号发送的消息数 (默认: 100)
    --concurrency N         每个账号的并发数 (默认: 1)
    --interval SECS         消息间隔(秒) (默认: 0.1)
    --ramp-up SECS          预热时间(秒) (默认: 0)
    --no-reply              不追踪回复
    --stagger               交错建立连接，避免同时连接

示例:
    # 10个账号监控模式
    python 多账号连接测试工具.py --count 10 --monitor
    
    # 20个账号压力测试，每个账号发送500条消息
    python 多账号连接测试工具.py --count 20 --stress --messages 500
    
    # 带预热和交错连接的压力测试
    python 多账号连接测试工具.py --count 30 --stress --messages 200 --ramp-up 5 --stagger
""")


def generate_default_accounts(count: int = 5, host: str = "localhost", port: int = 59178) -> List[ConnectionConfig]:
    """生成默认账号配置"""
    accounts = []
    base_id = 1000000000
    for i in range(count):
        self_id = str(base_id + i + 1)
        accounts.append(ConnectionConfig(
            server_host=host,
            server_port=port,
            self_id=self_id,
            token="",
            custom_name=f"llbot_{self_id}",
            heartbeat_interval=30.0
        ))
    return accounts


if __name__ == "__main__":
    asyncio.run(main())
