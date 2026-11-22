import { Router, type NextFunction, type Request, type Response } from 'express';
import type {
  AuthenticatedRequest,
  SessionValidator,
} from '../core/sessionValidator.js';
import type { AuthService } from '../services/authService.js';

export interface AuthRouterDeps {
  authService: AuthService;
  sessionValidator: SessionValidator;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

/** Exposes registration, login, central session verification, and logout routes. */
export function createAuthRouter({ authService, sessionValidator }: AuthRouterDeps): Router {
  const router = Router();

  router.post(
    '/register',
    asyncRoute(async (req, res) => {
      const result = await authService.register(req.body ?? {});
      res.status(201).json(result);
    })
  );

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const result = await authService.login(req.body ?? {});
      res.status(200).json(result);
    })
  );

  const respondVerifiedSession = (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json(req.auth);
  };

  router.get('/verify', sessionValidator.requireAuth, respondVerifiedSession);
  router.get('/session', sessionValidator.requireAuth, respondVerifiedSession);

  router.post(
    '/logout',
    sessionValidator.requireAuth,
    asyncRoute(async (req: AuthenticatedRequest, res) => {
      await authService.logout(req.auth!.session.id);
      res.status(200).json({ ok: true });
    })
  );

  return router;
}
