import { Router, type NextFunction, type Request, type Response } from 'express';
import type { NotificationService } from '../services/notificationService.js';

export interface NotificationRouterDeps {
  notificationService: NotificationService;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

/** Exposes transaction event evaluation and alert management routes. */
export function createNotificationRouter({
  notificationService,
}: NotificationRouterDeps): Router {
  const router = Router();

  router.post(
    '/events/transaction',
    asyncRoute(async (req, res) => {
      const result = await notificationService.processTransactionEvent(req.body ?? {});
      res.status(result.alertGenerated ? 201 : 200).json(result);
    })
  );

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const result = await notificationService.list({
        category: req.query.category,
        period: req.query.period,
        status: req.query.status,
      });
      res.status(200).json(result);
    })
  );

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const alert = await notificationService.getById(String(req.params.id ?? ''));
      res.status(200).json({ alert });
    })
  );

  router.patch(
    '/:id/read',
    asyncRoute(async (req, res) => {
      const alert = await notificationService.markAsRead(String(req.params.id ?? ''));
      res.status(200).json({ alert });
    })
  );

  return router;
}
