export type ComposeOptions = {
  mode: 'docker-deploy' | 'own-creds';
  dataDir: string;
  postgresVersion: string;
  redisVersion: string;
  appPort: number;
  apiPort: number;
};

export function generateCompose(opts: ComposeOptions): string {
  const { mode, dataDir, postgresVersion, redisVersion, appPort, apiPort } = opts;

  const dbService = mode === 'docker-deploy' ? `
  vencore-db:
    image: postgres:${postgresVersion}-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: vencore
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: vencore
    volumes:
      - ${dataDir}/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vencore"]
      interval: 10s
      retries: 5
` : '';

  const redisService = mode === 'docker-deploy' ? `
  vencore-redis:
    image: redis:${redisVersion}-alpine
    restart: unless-stopped
    volumes:
      - ${dataDir}/redis:/data
    command: redis-server --appendonly yes
` : '';

  const dbDepends = mode === 'docker-deploy' ? `
    depends_on:
      vencore-db:
        condition: service_healthy` : '';

  return `version: '3.9'

services:
  vencore-app:
    image: vencore/web:latest
    restart: unless-stopped
    ports:
      - "${appPort}:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://vencore-api:3001
      NEXT_PUBLIC_APP_URL: \${APP_URL}
    env_file: .env
    depends_on:
      - vencore-api

  vencore-api:
    image: vencore/api:latest
    restart: unless-stopped
    ports:
      - "${apiPort}:3001"
    environment:
      DATABASE_URL: \${DATABASE_URL}
      REDIS_URL: \${REDIS_URL}
    env_file: .env
    volumes:
      - ${dataDir}/uploads:/app/uploads${dbDepends}
${dbService}${redisService}
networks:
  default:
    name: vencore-network
`;
}
