# vencore-agent

Lightweight monitoring agent for [Vencore](https://vencore.app). Runs on your servers and reports CPU, memory, disk, load average, network I/O, and database connectivity to your Vencore workspace every 30 seconds.

## Prerequisites

- Node.js 18 or later
- A Vencore account with at least one server registered (to get your agent token)

## Install

```bash
npm install -g vencore-agent
```

## Quick test (foreground)

```bash
VENCORE_TOKEN=your_token_here vencore-agent
```

The agent will log each tick to stdout. Press Ctrl+C to stop.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VENCORE_TOKEN` | ✅ | — | Agent token from the Vencore dashboard |
| `VENCORE_API_URL` | ❌ | `https://api.vencore.app` | API endpoint (self-hosted only) |
| `VENCORE_INTERVAL_MS` | ❌ | `30000` | Reporting interval in milliseconds |

Get your token from the Vencore dashboard: **Servers → Add Server** (or **Servers → [server name] → Regenerate token**).

## Production setup (systemd)

Create the service file:

```bash
sudo tee /etc/systemd/system/vencore-agent.service > /dev/null << 'EOF'
[Unit]
Description=Vencore Monitoring Agent
After=network.target

[Service]
ExecStart=/usr/bin/vencore-agent
Restart=always
RestartSec=10
Environment=VENCORE_TOKEN=your_token_here
Environment=VENCORE_API_URL=https://api.vencore.app

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vencore-agent
sudo systemctl status vencore-agent
```

To view logs:

```bash
journalctl -u vencore-agent -f
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

Results (including failures) are included in each ping payload so Vencore can alert when a local database goes down.

## License

MIT
