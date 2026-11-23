# Security Policy

## Reporting a vulnerability

QuotaDeck CN is a read-only VS Code extension: it reads quota, balance and usage data for
MiniMax, DeepSeek and Qwen and renders it in the status bar, a hover tooltip and the Activity
Bar overview. It never proxies model requests and only contacts the vendor hosts listed in the
README. It does handle API credentials, so credential handling is what we most want audited.

If you have found a vulnerability, please report it privately through GitHub's private
vulnerability reporting page for this repository:

**https://github.com/AlexMultiAgent/VSC-plugin-quota-deck/security/advisories/new**

Please do not open a public issue, pull request or chat message for a vulnerability. Those
channels disclose the report to everyone before a fix exists.

### What to include

- The extension version, your VS Code version and the provider involved.
- Steps to reproduce, and the expected result versus what actually happened.
- The output of the `QuotaDeck CN: 检查连接` command when relevant, with credentials redacted.

### What counts as a vulnerability

In scope:

- A credential leaving VS Code Secret Storage — into `settings.json`, global state, a log file, the webview HTML or a command output.
- A credential being sent to a host that is not one of the vendor hosts listed in the README.
- A crafted vendor response injecting HTML, script or text into the dashboard webview, the
  status bar, the tooltip or the Activity Bar tree.
- The extension reading a local file it has no reason to read.

Out of scope:

- A quota or balance value that the vendor itself reports incorrectly.
- A vendor endpoint being unavailable, slow or rate limited.
- Anything that needs an already compromised machine or a modified build of the extension.
- Hardening suggestions with no exploitable effect.

We welcome reports of any of the vulnerabilities above, including ones that only affect the MCP
server under `mcp/`. Please file multiple vulnerabilities separately so each can be triaged.

## Disclosure timeline

We aim to acknowledge a report within 7 days and to publish a fix or an advisory within 90 days.

We keep the disclosure confidential until a fix or an advisory is published, and we credit the
reporter unless they ask not to be named. The advisory always states the disclosure timeline.

## Supported versions

Security fixes are published for the current released version.

| Version | Supported |
| --- | --- |
| 0.4.2 | Yes |
| < 0.4.2 | No |

Older versions are not patched. Please update before reporting a vulnerability.
