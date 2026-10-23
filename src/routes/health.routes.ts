import BaseRouter, { type RouteConfig } from "@routes/router.js";
import { healthController } from '@container.js';

class HealthRouter extends BaseRouter {
  protected routes(): RouteConfig[] {
    return [
      {
        method: "get",
        path: "/",
        handler: healthController.getRoot
      },
      {
        method: "get",
        path: "/health",
        handler: healthController.getHealth
      },
    ];
  }
}

export default new HealthRouter().router;

