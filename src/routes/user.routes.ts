import BaseRouter from '@routes/router.js';
import type { RouteConfig } from '@routes/router.js';
import { userController, authMiddleware } from '@container.js';

class UserRouter extends BaseRouter {
    protected routes(): RouteConfig[] {
        return [
            {
                method: 'get',
                path: '/me',
                middleware: [
                    authMiddleware.verifyAccessToken
                ],
                handler: userController.getUser.bind(userController) 
            }
        ]
    }
}

export default new UserRouter().router;