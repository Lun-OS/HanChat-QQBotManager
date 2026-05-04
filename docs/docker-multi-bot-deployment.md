# 机器人 Docker 多机器人部署方法文档

## 目录

1. [概述](#概述)
2. [环境准备](#环境准备)
3. [镜像下载](#镜像下载)
4. [创建容器](#创建容器)
5. [端口规划](#端口规划)
6. [容器管理](#容器管理)

---

## 概述

本文档说明使用 Docker 容器技术部署多个机器人实例的方法，仅包含镜像下载和容器创建操作。

---

## 环境准备

- 已安装 Docker 和 Docker Compose
- 宿主机防火墙放行对应端口

---

## 镜像下载

### LLBot 镜像

```bash
docker pull initialencounter/llonebot:latest
```

### Napcat 镜像

```bash
docker pull lmq8267/napcat:latest
```

---

## 创建容器

### LLBot 容器

```bash
docker run -d \
  --name llbot-1 \
  -p 外部映射的端口:3080 \
  initialencounter/llonebot:latest
```

| 参数 | 说明 |
|------|------|
| `-d` | 后台运行 |
| `--name llbot-1` | 容器名称 |
| `-p 外部映射的端口:3080` | 宿主机端口映射到容器内 3080 端口 |

**多实例部署时，每个实例需使用不同的外部映射端口和容器名称：**

```bash
# 实例 1
docker run -d \
  --name llbot-1 \
  -p 3001:3080 \
  initialencounter/llonebot:latest

# 实例 2
docker run -d \
  --name llbot-2 \
  -p 3002:3080 \
  initialencounter/llonebot:latest
```

### Napcat 容器

```bash
docker run -d \
  --name napcat-2 \
  --privileged \
  --restart=always \
  -e TZ=Asia/Shanghai \
  -p 外部映射的端口:6099/tcp \
  -v ./napcat:/app/napcat/data \
  lmq8267/napcat:latest
```

| 参数 | 说明 |
|------|------|
| `-d` | 后台运行 |
| `--name napcat-2` | 容器名称 |
| `--privileged` | 授予扩展权限 |
| `--restart=always` | 自动重启 |
| `-e TZ=Asia/Shanghai` | 设置时区 |
| `-p 外部映射的端口:6099/tcp` | 宿主机端口映射到容器内 6099 端口 |
| `-v ./napcat:/app/napcat/data` | 数据持久化挂载 |

**多实例部署时，每个实例需使用不同的外部映射端口、容器名称和数据卷：**

```bash
# 实例 1
docker run -d \
  --name napcat-1 \
  --privileged \
  --restart=always \
  -e TZ=Asia/Shanghai \
  -p 6101:6099/tcp \
  -v ./napcat-1:/app/napcat/data \
  lmq8267/napcat:latest

# 实例 2
docker run -d \
  --name napcat-2 \
  --privileged \
  --restart=always \
  -e TZ=Asia/Shanghai \
  -p 6102:6099/tcp \
  -v ./napcat-2:/app/napcat/data \
  lmq8267/napcat:latest
```

---

## 端口规划

| 实例类型 | 容器名称 | 外部映射端口 | 容器内端口 |
|---------|---------|-------------|-----------|
| LLBot-1 | llbot-1 | 3001 | 3080 |
| LLBot-2 | llbot-2 | 3002 | 3080 |
| LLBot-N | llbot-n | 3000+N | 3080 |
| Napcat-1 | napcat-1 | 6101 | 6099 |
| Napcat-2 | napcat-2 | 6102 | 6099 |
| Napcat-N | napcat-n | 6100+N | 6099 |

---

## 容器管理

### 查看运行中的容器

```bash
docker ps
```

### 查看容器日志

```bash
docker logs <容器名称>
```

### 停止容器

```bash
docker stop <容器名称>
```

### 启动容器

```bash
docker start <容器名称>
```

### 删除容器

```bash
docker rm <容器名称>
```

---

**文档版本**: v1.0  
**最后更新**: 2026-05-03
