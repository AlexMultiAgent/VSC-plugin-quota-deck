# QuotaDeck CN

国产大模型额度监控 — MiniMax、DeepSeek、Qwen 的余额、用量与重置倒计时，直接显示在 VS Code 状态栏。悬停即可查看摘要，需要图表和模型明细时再打开可选仪表盘。

## Features

- 状态栏显示各服务商的剩余额度、余额与重置倒计时。
- 悬停提示展示完整摘要，并区分账户数据与 Web Session。
- 可选仪表盘：时间范围切换、图表、模型明细、Qwen 能力矩阵与表格视图。
- MiniMax 国内版与国际版账号独立配置。
- DeepSeek 官方余额与平台用量统计。
- 凭据只保存在 VS Code Secret Storage。
- 简体中文与英文界面。
- 时间默认按 `Asia/Shanghai` 显示，金额默认使用人民币格式。

## What it does not do

- 不代理模型请求，不提供对话补全。
- 不把本地估算当成账户余额或官方额度。
- 不自动提取浏览器 Cookie。
- 不做货币换算，也不合并不同币种的金额。
- V1 不接入 Qwen、阿里云百炼或其他模型厂商；Qwen 只显示诚实的能力矩阵。

## Install

从 VS Code Marketplace 安装 `QuotaDeck CN — MiniMax DeepSeek Qwen`，或下载 `.vsix` 后执行：

```bash
code --install-extension quota-deck-0.1.0.vsix
```

## Configure

1. 点击状态栏的 QuotaDeck 图标。没有配置任何凭据时会进入配置流程；已经配置过时直接打开仪表盘。
2. 选择服务商，输入对应凭据。
3. 再次点击状态栏图标查看额度；右键可刷新、切换主服务商或打开帮助。

| 服务商 | 必需凭据 | 可选凭据 |
|---|---|---|
| MiniMax CN / Global | Token Plan Key | Web Session Cookie（用于积分） |
| DeepSeek | API Key | Platform Session Token、Platform Cookie（用于用量明细） |

凭据通过密码输入框填写，不会回显，也不会写入 settings、全局状态或日志。

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
| `QuotaDeck CN: Show Help` | 查看帮助 |

## Known limitations

- MiniMax 与 DeepSeek 的部分账户接口不是稳定的公共开发者 API，平台调整后可能暂时返回“不支持”或“获取失败”。
- 本开发环境中只有 DeepSeek 余额完成了真实接口验证；MiniMax 和 DeepSeek 详细用量仍需使用自己的账户运行 `docs/contracts` 中的验证流程。
- Qwen 在 V1 中明确不支持，不显示任何伪造额度。

## License

MIT
