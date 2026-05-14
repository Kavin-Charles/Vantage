# vantage-agent

Lightweight monitoring agent for [Vantage](https://vantage.app). Runs on your servers and reports CPU, memory, disk, load average, network I/O, and database connectivity to your Vantage workspace every 30 seconds.

## Prerequisites

- Node.js 18 or later
- A Vantage account with at least one server registered (to get your agent token)

## Install

```bash
npm install -g vantage-agent
```

## Quick test (foreground)

```bash
VANTAGE_TOKEN=your_token_here vantage-agent
```

The agent will log each tick to stdout. Press Ctrl+C to stop.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VANTAGE_TOKEN` | ✅ | — | Agent token from the Vantage dashboard |
| `VANTAGE_API_URL` | ❌ | `https://api.vantage.app` | API endpoint (self-hosted only) |
| `VANTAGE_INTERVAL_MS` | ❌ | `30000` | Reporting interval in milliseconds |

Get your token from the Vantage dashboard: **Servers → Add Server** (or **Servers → [server name] → Regenerate token**).

## Production setup (systemd)

Create the service file:

```bash
sudo tee /etc/systemd/system/vantage-agent.service > /dev/null << 'EOF'
[Unit]
Description=Vantage Monitoring Agent
After=network.target

[Service]
ExecStart=/usr/bin/vantage-agent
Restart=always
RestartSec=10
Environment=VANTAGE_TOKEN=your_token_here
Environment=VANTAGE_API_URL=https://api.vantage.app

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vantage-agent
sudo systemctl status vantage-agent
```

To view logs:

```bash
journalctl -u vantage-agent -f
```

## Platform notes

| Metric | Linux | macOS | Windows |
|---|---|---|---|
| CPU % | ✅ | ✅ | ✅ |
| Memory % | ✅ | ✅ | ✅ |
| Uptime | ✅ | ✅ | ✅ |
| Load avg (1m) | ✅ | ✅ | ✅ |
| Disk % | ✅ | ❌ (0) | ❌ (0) |
| Network I/O | ✅ | ❌ (0) | ❌ (0) |

Disk and network metrics use Linux-specific interfaces (`df`, `/proc/net/dev`). All other metrics work on any platform.

## Database connectivity checks

The agent automatically checks for databases running on well-known local ports:

| Database | Port |
|---|---|
| PostgreSQL | 5432 |
| MySQL | 3306 |
| Redis | 6379 |
| ClickHouse | 9000 |
| MongoDB | 27017 |

Results (including failures) are included in each ping payload so Vantage can alert when a local database goes down.

## License

MIT
