import { Router, type NextFunction, type Request, type Response } from 'express';
import type { TransactionService } from '../services/transactionService.js';

export interface TransactionRouterDeps {
  transactionService: TransactionService;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

/** Exposes transaction creation, listing, detail, and update routes. */
export function createTransactionRouter({
  transactionService,
}: TransactionRouterDeps): Router {
  const router = Router();

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const transaction = await transactionService.create(req.body ?? {});
      res.status(201).json({ transaction });
    })
  );

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const result = await transactionService.list({
        category: req.query.category,
        type: req.query.type,
        from: req.query.from,
        to: req.query.to,
      });
      res.status(200).json(result);
    })
  );

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const transaction = await transactionService.getById(String(req.params.id ?? ''));
      res.status(200).json({ transaction });
    })
  );

  router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
      const transaction = await transactionService.update(
        String(req.params.id ?? ''),
        req.body ?? {}
      );
      res.status(200).json({ transaction });
    })
  );

  return router;
}
