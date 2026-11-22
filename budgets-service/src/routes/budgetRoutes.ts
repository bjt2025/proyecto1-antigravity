import { Router, type NextFunction, type Request, type Response } from 'express';
import type { BudgetService } from '../services/budgetService.js';

export interface BudgetRouterDeps {
  budgetService: BudgetService;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

/** Exposes budget creation, listing, and detail routes. */
export function createBudgetRouter({ budgetService }: BudgetRouterDeps): Router {
  const router = Router();

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const budget = await budgetService.create(req.body ?? {});
      res.status(201).json({ budget });
    })
  );

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const result = await budgetService.list({
        category: req.query.category,
        period: req.query.period,
      });
      res.status(200).json(result);
    })
  );

  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const budget = await budgetService.getById(String(req.params.id ?? ''));
      res.status(200).json({ budget });
    })
  );

  return router;
}
