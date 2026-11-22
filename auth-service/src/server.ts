import { createAuthApp } from './app.js';
import { logger } from './core/logger.js';

const { app, config } = createAuthApp();

app.listen(config.port, () => {
  logger.info('auth-service escuchando', {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
});
