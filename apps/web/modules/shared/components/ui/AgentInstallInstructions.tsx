interface AgentInstallInstructionsProps {
  token: string;
}

export function AgentInstallInstructions({ token }: AgentInstallInstructionsProps) {
  const serviceFile = `[Unit]
Description=Vencore Monitoring Agent
After=network.target

[Service]
ExecStart=/usr/bin/vencore-agent
Restart=always
RestartSec=10
Environment=VENCORE_TOKEN=${token}
Environment=VENCORE_API_URL=https://api.vencore.app

[Install]
WantedBy=multi-user.target`;

  const createServiceCmd = `sudo tee /etc/systemd/system/vencore-agent.service > /dev/null << 'EOF'\n${serviceFile}\nEOF`;

  const steps: { label: string; code: string }[] = [
    {
      label: 'Install the agent',
      code: 'npm install -g vencore-agent',
    },
    {
      label: 'Create the systemd service',
      code: createServiceCmd,
    },
    {
      label: 'Enable and start',
      code: 'sudo systemctl daemon-reload && sudo systemctl enable --now vencore-agent',
    },
  ];

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        Install the agent on your server:
      </p>
      {steps.map((step, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
            {i + 1}. {step.label}
          </div>
          <pre style={{
            margin: 0,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 11,
            fontFamily: 'monospace',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {step.code}
          </pre>
        </div>
      ))}
    </div>
  );
}
