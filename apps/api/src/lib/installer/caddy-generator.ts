type CaddyOpts = { domain: string; appPort: number; apiPort: number; sslEmail: string };
type NginxOpts = { domain: string; appPort: number; apiPort: number };

export function generateCaddyfile(opts: CaddyOpts): string {
  const { domain, appPort, apiPort, sslEmail } = opts;
  return `{
  email ${sslEmail}
}

${domain} {
  handle /api/* {
    reverse_proxy localhost:${apiPort}
  }
  handle {
    reverse_proxy localhost:${appPort}
  }
}
`;
}

export function generateNginxConf(opts: NginxOpts): string {
  const { domain, appPort, apiPort } = opts;
  return `server {
    listen 80;
    server_name ${domain};

    location /api/ {
        proxy_pass http://localhost:${apiPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:${appPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`;
}
