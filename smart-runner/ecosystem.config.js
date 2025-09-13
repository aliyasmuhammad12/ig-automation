module.exports = {
  apps: [
    {
      name: 'smart-runner-podA',
      script: 'smart-runner.js',
      args: '--pod podA',
      cwd: './smart-runner',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      log_file: './logs/smart-runner-podA.log',
      out_file: './logs/smart-runner-podA-out.log',
      error_file: './logs/smart-runner-podA-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
