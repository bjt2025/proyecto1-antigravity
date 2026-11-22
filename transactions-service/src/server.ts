import { createTransactionsApp } from './app.js';
import { logger } from './core/logger.js';

const { app, config } = createTransactionsApp();

app.listen(config.port, () => {
  logger.info('transactions-service escuchando', {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
});
