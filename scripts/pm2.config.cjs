module.exports = {
  apps: [
    {
      name: 'promo-monitor',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      log_type: 'json'
    }
  ]
};
