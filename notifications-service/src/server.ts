import { createNotificationsApp } from './app.js';
import { logger } from './core/logger.js';

const { app, config } = createNotificationsApp();

app.listen(config.port, () => {
  logger.info('notifications-service escuchando', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    budgetsServiceUrl: config.budgetsServiceUrl,
  });
});
