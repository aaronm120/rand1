// PM2 process manager configuration
// Usage:
//   pm2 start deploy/ecosystem.config.js
//   pm2 save && pm2 startup   (auto-restart on reboot)
//   pm2 logs roc-portal       (view logs)
//   pm2 restart roc-portal    (reload after code change)

module.exports = {
  apps: [
    {
      name: 'roc-portal',
      script: 'server/index.js',
      cwd: '/opt/randolph-portal',   // Adjust to your actual deploy path

      instances: 1,                  // SQLite = single process only
      exec_mode: 'fork',

      watch: false,
      ignore_watch: ['node_modules', 'data', 'uploads', 'logs'],

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Logging
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto-restart settings
      max_memory_restart: '256M',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
