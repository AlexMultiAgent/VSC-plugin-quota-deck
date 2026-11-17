# QuotaDeck CN

国产大模型额度监控 — MiniMax、DeepSeek、Qwen 的余额、用量与重置倒计时，直接显示在 VS Code 状态栏。悬停即可查看摘要，需要图表和模型明细时再打开可选仪表盘。

## Features

- 状态栏显示各服务商的剩余额度、余额与重置倒计时。
- 状态栏只显示已配置的服务商，避免未配置项占据空间。
- 状态栏默认每 5 分钟自动刷新，也可从仪表盘“立即刷新”或命令面板手动刷新。
- MiniMax 剩余额度低于可配置阈值（默认 20%）时使用警告色。
- 悬停提示展示完整摘要，并区分账户数据与 Web Session。
- 可选仪表盘：时间范围切换、图表、模型明细、Qwen 能力矩阵与表格视图。
- MiniMax 国内版与国际版账号独立配置。
- DeepSeek 官方余额与平台用量统计。
- 取数失败时保留上一次的数据并标注“数据已过期”，而不是显示为未配置。
- 凭据只保存在 VS Code Secret Storage。
- 简体中文与英文界面。
- 时间默认按 `Asia/Shanghai` 显示，可在 `quotaDeck.timeZone` 改为任意 IANA 时区；金额默认使用人民币格式。

## What it does not do

- 不代理模型请求，不提供对话补全。
- 不把本地估算当成账户余额或官方额度。
- 不自动提取浏览器 Cookie。
- 不做货币换算，也不合并不同币种的金额。
- V1 不接入 Qwen、阿里云百炼或其他模型厂商；Qwen 只显示诚实的能力矩阵。

## Install

从 VS Code Marketplace 安装 `QuotaDeck CN — MiniMax DeepSeek Qwen`，或下载 `.vsix` 后执行：

```bash
code --install-extension quota-deck-0.1.4.vsix
```

## Configure

1. 点击状态栏的 QuotaDeck 图标。没有配置任何凭据时会进入配置流程；已经配置过时直接打开仪表盘。
2. 在仪表盘点击“配置服务商”，或在命令面板搜索 `QuotaDeck CN: 配置服务商` / `Configure Providers`。
3. 选择 MiniMax CN、MiniMax Global 或 DeepSeek，输入对应凭据。
4. 再次点击状态栏图标查看额度。

DeepSeek 凭据获取方式：

- **API 密钥**：登录 `https://platform.deepseek.com`，进入 `API Keys` 创建并复制。
- **平台会话令牌**：登录后按 `F12` 打开开发者工具，进入 `Network → Fetch/XHR`，
  打开用量页面，在发往 `platform.deepseek.com/api/v0/...` 的请求头中复制
  `Authorization: Bearer` 后面的值。
- **平台 Cookie**：在同一请求头的 `Cookie` 中复制完整值。Cookie 必须与会话令牌同时配置。

余额只需 API 密钥。会话令牌与 Cookie 用于详细用量和账户汇总，属于可选项。
已有凭据会以掩码形式预填；直接按 `Enter` 保留，按 `Ctrl+A` 后可重新输入并替换。

警告阈值可在 VS Code 设置中搜索 `QuotaDeck warning threshold`，或直接设置
`quotaDeck.statusBar.warningThresholdPercent`。默认值为 `20`，支持 `11` 到 `99`；
剩余额度严格低于该值时显示警告，低于或等于 `10%` 时显示严重警告。

额度窗口、重置倒计时与用量区间按 `quotaDeck.timeZone` 指定的 IANA 时区计算，
默认 `Asia/Shanghai`。修改设置后立即生效，无需重启窗口。

| 服务商 | 必需凭据 | 可选凭据 |
|---|---|---|
| MiniMax CN / Global | Token Plan Key | Web Session Cookie（用于积分） |
| DeepSeek | API Key | Platform Session Token、Platform Cookie（用于用量明细） |

凭据通过密码输入框填写，不会回显，也不会写入 settings、全局状态或日志。
Qwen 在 V1 中没有接入适配器，因此不提供凭据配置；仪表盘仅展示其能力矩阵。

## Privacy

扩展不采集遥测。除下列固定域名外，扩展不发起网络请求：

| 主机 | 用途 |
|---|---|
| `www.minimaxi.com` | MiniMax 国内账户 |
| `www.minimax.io` | MiniMax 国际账户 |
| `api.deepseek.com` | DeepSeek 余额 |
| `platform.deepseek.com` | DeepSeek 用量明细 |

Cookie 只发送到对应厂商域名，并按各适配器声明的最小 Cookie 名称集合筛选。账户响应进入展示层前会被规范化和 HTML 转义；提交后的 fixture 还会经过凭据形状与财务金额匿名化检查。

## Commands

| Command | 说明 |
|---|---|
| `QuotaDeck CN: Open Dashboard` | 打开仪表盘 |
| `QuotaDeck CN: Refresh` | 立即刷新 |
| `QuotaDeck CN: Switch Provider` | 切换主服务商 |
| `QuotaDeck CN: Configure MiniMax` | 配置 MiniMax 国内版或国际版 |
| `QuotaDeck CN: Configure DeepSeek` | 配置 DeepSeek |
| `QuotaDeck CN: Configure Providers` | 从仪表盘之外统一打开配置流程 |
| `QuotaDeck CN: Show Help` | 查看帮助 |

## Known limitations

- MiniMax 与 DeepSeek 的部分账户接口不是稳定的公共开发者 API，平台调整后可能暂时返回“不支持”或“获取失败”。
- 本开发环境中只有 DeepSeek 余额完成了真实接口验证；MiniMax 和 DeepSeek 详细用量仍需使用自己的账户运行 `docs/contracts` 中的验证流程。
- DeepSeek 余额可用但详细接口未配置时，仪表盘会显示“部分可用”，并列出四项能力状态。
- Qwen 在 V1 中明确不支持，不显示任何伪造额度。

## License

MIT
