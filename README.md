# Oh My SSH

> **用户只打开网页，本机不下载、不安装任何东西。**  
> 在浏览器里填 IP + 密码，像 WebSSH / Xshell 一样管理远程 VPS。

```text
  用户电脑
  ────────
  只开浏览器访问 https://你的站点
           │
           │  HTTPS + WebSocket（网页自带）
           ▼
  你部署的 Oh My SSH 服务器（一台即可）
  ─ 网页 UI
  ─ WebSSH 网关（替用户拨 TCP/22）
           │
           ▼
      用户的 VPS
```

**最终用户：零下载、零安装、零命令行。**  
需要部署的是**站点运营方**（你自己的服务器 / Docker / 云主机），不是每个用户。

---

## 用户怎么用（无需下载）

1. 打开你提供的网址  
2. 点「快速连接」  
3. 输入 `root@1.2.3.4:22` 和密码  
4. 在浏览器里操作远程 Shell  

---

## 运营方怎么部署（一次性）

### 方式 A：一条命令（推荐）

```bash
git clone https://github.com/tianrking/oh_myssh.git
cd oh_myssh
npm install
npm run build
npm start
# 浏览器打开 http://服务器IP:8080
```

`npm start` = **网页 + WebSSH 网关** 一体服务，用户只访问这个地址。

### 方式 B：Docker

```bash
docker compose up -d --build
# http://服务器IP:8080
```

### 方式 C：开发机自己用

```bash
npm install
npm run dev    # http://localhost:3000  （同样是网页，不是让最终用户装东西）
```

---

## 和「本地要跑东西」的区别

| 角色 | 要不要下载/安装 |
|------|------------------|
| **最终用户** | **不要**。只开浏览器 |
| **你（部署站点的人）** | 在**服务器上**跑 `npm start` 或 Docker 一次 |

这和 [webssh2](https://github.com/billchurch/webssh2) 等产品一样：  
网站背后有服务帮你 SSH；用户侧永远只是网页。

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | 一体服务端口，默认 `8080` |
| `OMS_GATEWAY_PORT` | 仅网关模式端口，默认 `3922` |
| `VITE_SSH_GATEWAY` | 构建前端时指定外网网关 `wss://...`（一般同域可不设） |

---

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run build && npm start` | **生产：用户只开网址** |
| `npm run dev` | 本地开发 |
| `npm run gateway` | 只跑网关 |
| `npm test` | 单元测试 |
| `npm run test:webssh` | 网关 E2E |

---

## 安全（公网必读）

- 密码会经过**你部署的服务器**再连到目标 VPS（所有 WebSSH 皆如此）  
- 公网请上 HTTPS（Nginx/Caddy 反代）  
- 建议限制来源 IP、加登录墙、勿裸奔在公网  
- 不要把密码提交到 Git  

---

## License

Apache-2.0
