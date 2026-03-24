// PM2 ecosystem file — inicie com: pm2 start ecosystem.config.cjs
// Documentação: https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: "painel-limpeza",
      script: "server/index.js",
      interpreter: "node",
      // Reinicia se usar > 400 MB (proteção contra memory leak)
      max_memory_restart: "400M",
      // Reinicia automaticamente em crashes
      autorestart: true,
      // Aguarda 2 s antes de reiniciar após crash para não fazer loop agressivo
      restart_delay: 2000,
      // Máximo de 10 restarts em 1 min; desabilita se exceder (evita loop infinito)
      max_restarts: 10,
      min_uptime: "10s",
      // Variáveis de ambiente de produção — sobrescrevem .env se pm2 start --env production
      env_production: {
        NODE_ENV: "production",
      },
      // Logs
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
