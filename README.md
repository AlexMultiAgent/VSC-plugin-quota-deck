# QuotaDeck CN

国产大模型额度监控 — MiniMax、DeepSeek、Qwen 的余额、用量与重置倒计时，直接显示在 VS Code 状态栏和左侧 Activity Bar。悬停即可查看摘要，需要图表和模型明细时再打开可选仪表盘。

## Features

- 状态栏显示各服务商的剩余额度、余额与重置倒计时；DeepSeek 同时标注忙时或闲时。
- 状态栏只显示已配置的服务商，避免未配置项占据空间。
- 状态栏默认每 5 分钟自动刷新，也可从仪表盘“立即刷新”或命令面板手动刷新。
- 单击状态栏打开仪表盘时会立即重新获取数据，并同步刷新状态栏、悬浮详情和仪表盘。
- MiniMax 状态栏优先显示 5 小时窗口；额度按剩余比例使用绿色、黄色、橙色、红色四阶段文字，仅剩余 5% 及以下使用红色警示背景。
- 历史用量区间与实时额度窗口分开展示，MiniMax 卡片显示所选区间的 Token 用量。
- 悬停提示展示完整摘要，并标注账户实时数据来源；不会重复展示 API Key / AccessKey 等凭据类型。
- 左侧 Activity Bar 提供额度概览：展开查看各服务商明细，点击服务商打开完整仪表盘；标题栏可刷新、打开仪表盘或进入插件设置。
- 可选仪表盘：时间范围切换、账户余额、能力状态与表格视图。
- MiniMax 国内版与国际版账号独立配置。
- DeepSeek 官方余额查询；详细用量与账单请前往 DeepSeek 官网。
- 取数失败时保留上一次的数据并标注“数据已过期”，而不是显示为未配置。
- 凭据只保存在 VS Code Secret Storage。
- 简体中文与英文界面。
- 时间默认按 `Asia/Shanghai` 显示，可在 `quotaDeck.timeZone` 改为任意 IANA 时区；金额默认使用人民币格式。

## What it does not do

- 不代理模型请求，不提供对话补全。
- 不把本地估算当成账户余额或官方额度。
- 不自动提取浏览器 Cookie。
- 不做货币换算，也不合并不同币种的金额。
- 不提供 DeepSeek 平台详细用量、费用或账户汇总；这部分请前往 `https://platform.deepseek.com` 查看。
- 当前不接入百炼公开 Usage API（`/usage/summary`、`/usage/trend`）和
  `bl quota show` CLI，因此不提供百炼模型级用量趋势或额度查询。

## Install

从 VS Code Marketplace 安装 `QuotaDeck CN — MiniMax DeepSeek Qwen`，或下载 `.vsix` 后执行：

```bash
code --install-extension quota-deck-<version>.vsix
```

## Configure

1. 点击左侧 Activity Bar 或状态栏的 QuotaDeck 图标。新安装可从额度概览直接进入配置流程；已配置后可展开明细或打开仪表盘。
2. 在仪表盘点击“配置服务商”，或在命令面板搜索 `QuotaDeck CN: 配置服务商` / `Configure Providers`。
3. 选择 MiniMax CN、MiniMax Global、DeepSeek 或 Qwen，输入对应凭据。
4. 再次点击状态栏图标查看额度。

DeepSeek 凭据获取方式：

- **API 密钥**：登录 `https://platform.deepseek.com`，进入 `API Keys` 创建并复制。

只配置 API 密钥即可查询余额。插件不再请求 DeepSeek 平台会话令牌或 Cookie，
详细用量、费用和账户汇总请前往 DeepSeek 官网查看。已有凭据会以掩码形式预填；
直接按 `Enter` 保留，按 `Ctrl+A` 后可重新输入并替换。

DeepSeek 忙时/闲时按官方规则判断：

- 忙时为 UTC 周一至周五 `01:00–04:00` 和 `06:00–10:00`，即北京时间
  周一至周五 `09:00–12:00` 和 `14:00–18:00`。
- 其他时段、周末和中国法定节假日全天均为闲时。
- 状态栏、悬浮详情和仪表盘共享同一次刷新算出的时段状态。

Qwen / 百炼余额获取方式：

- 在 [阿里云 RAM 控制台](https://ram.console.aliyun.com/manage/ak) 创建专用 RAM 用户，
  并只授予 `bss:QueryAccountBalance` 权限。
- 创建该 RAM 用户的 AccessKey，用途选择“本地开发环境中使用”，配置时分别填写
  AccessKey ID 和 Secret。
- 这里需要阿里云费用与成本 OpenAPI 的 AccessKey，不是百炼 API Key。
- 扩展调用账户级 `QueryAccountBalance`，显示可用余额、现金余额、信控额度和额度上限。
- 模型额度应在百炼控制台查看；消费明细应在阿里云费用与成本中查看。
- 当前版本未接入模型级额度接口。消费账单需要单独的 BSS 账单 API、额外权限和分页处理，
  因此不会用账户余额或本地估算值代替。
- 百炼还提供公开 Usage API（`/usage/summary`、`/usage/trend`）和
  `bl quota show` CLI。它们比当前仅查询账户余额的能力更强，已登记为候选数据源，
  但尚未完成鉴权、响应字段和分页契约验证；详见
  [Qwen / Model Studio contract inventory](docs/contracts/qwen.md)。

警告阈值可在 VS Code 设置中搜索 `QuotaDeck warning threshold`，或直接设置
`quotaDeck.statusBar.warningThresholdPercent`。默认值为 `20`，支持 `11` 到 `99`；
剩余额度严格低于该值时显示警告，低于或等于 `10%` 时显示严重警告。

额度窗口、重置倒计时与用量区间按 `quotaDeck.timeZone` 指定的 IANA 时区计算，
默认 `Asia/Shanghai`。修改设置后立即生效，无需重启窗口。

| 服务商 | 必需凭据 | 可选凭据 |
|---|---|---|
| MiniMax CN / Global | Token Plan Key | Web Session Cookie（用于积分） |
| DeepSeek | API Key | — |
| Qwen / 百炼 | Alibaba Cloud AccessKey ID、Secret | — |

凭据通过密码输入框填写，不会回显，也不会写入 settings、全局状态或日志。

## Privacy

扩展不采集遥测。除下列固定域名外，扩展不发起网络请求：

| 主机 | 用途 |
|---|---|
| `www.minimaxi.com` | MiniMax 国内账户 |
| `www.minimax.io` | MiniMax 国际账户 |
| `api.deepseek.com` | DeepSeek 余额 |
| `business.aliyuncs.com` | 阿里云账户余额（Qwen / 百炼） |

Cookie 只发送到对应厂商域名，并按各适配器声明的最小 Cookie 名称集合筛选。账户响应进入展示层前会被规范化和 HTML 转义；提交后的 fixture 还会经过凭据形状与财务金额匿名化检查。

## Commands

| Command | 说明 |
|---|---|
| `QuotaDeck CN: Open Dashboard` | 打开仪表盘 |
| `QuotaDeck CN: Refresh` | 立即刷新 |
| `QuotaDeck CN: Switch Provider` | 切换主服务商 |
| `QuotaDeck CN: Configure MiniMax` | 配置 MiniMax 国内版或国际版 |
| `QuotaDeck CN: Configure DeepSeek` | 配置 DeepSeek |
| `QuotaDeck CN: Configure Qwen` | 配置 Qwen / 百炼的阿里云 AccessKey |
| `QuotaDeck CN: Configure Providers` | 从仪表盘之外统一打开配置流程 |
| `QuotaDeck CN: Extension Settings` | 打开本插件的原生设置页 |
| `QuotaDeck CN: Show Help` | 查看帮助 |

## Known limitations

- MiniMax 的部分账户接口不是稳定的公共开发者 API，平台调整后可能暂时返回“不支持”或“获取失败”。
- DeepSeek 仅提供账户余额；详细用量与账单需前往 DeepSeek 官网。
- Qwen 余额来自阿里云账户级接口；公开 Usage API 与 `bl quota show` 已列入候选数据源，
  但在契约验证完成前不会发起请求或显示伪造的模型用量与额度。
- DeepSeek 节假日日历目前覆盖至 `2026-12-31`，超出覆盖范围时显示“时段未知”。

## License

MIT
