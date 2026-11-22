import { createBudgetsApp } from './app.js';
import { logger } from './core/logger.js';

const { app, config } = createBudgetsApp();

app.listen(config.port, () => {
  logger.info('budgets-service escuchando', {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
});
