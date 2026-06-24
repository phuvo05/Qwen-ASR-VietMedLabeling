module.exports = {
  apps: [
    {
      name: 'asr-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/home/ubuntu/asr-labeling',
      env: { PORT: 3000, NODE_ENV: 'production' },
    },
    {
      name: 'asr-backend',
      script: 'uvicorn',
      args: 'backend.main:app --host 0.0.0.0 --port 8000',
      cwd: '/home/ubuntu/asr-labeling',
      interpreter: 'python3',
    },
  ],
}
