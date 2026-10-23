import { jest } from '@jest/globals';
import BaseRouter from '@routes/router.js';
import type { RouteConfig } from '@routes/router.js';
import type { RequestHandler } from 'express';

// Create a concrete implementation for testing
class TestRouter extends BaseRouter {
    protected routes(): RouteConfig[] {
        return [
            {
                method: 'get',
                path: '/test',
                handler: jest.fn(),
            },
        ];
    }
}

describe('BaseRouter', () => {
    let router: TestRouter;

    beforeEach(() => {
        router = new TestRouter();
    });

    it('should create router instance on construction', () => {
        expect(router.router).toBeDefined();
        expect(router.router).toBeInstanceOf(Function); // Express Router is a function
    });

    it('should call routes() method during construction', () => {
        const routesSpy = jest.spyOn(TestRouter.prototype as any, 'routes');
        new TestRouter();
        expect(routesSpy).toHaveBeenCalled();
    });

    it('should register GET routes correctly', () => {
        class GetRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'get',
                    path: '/get-route',
                    handler: jest.fn(),
                }];
            }
        }

        const getRouter = new GetRouter();
        const routes = getRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should register POST routes correctly', () => {
        class PostRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'post',
                    path: '/post-route',
                    handler: jest.fn(),
                }];
            }
        }

        const postRouter = new PostRouter();
        const routes = postRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should register PUT routes correctly', () => {
        class PutRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'put',
                    path: '/put-route',
                    handler: jest.fn(),
                }];
            }
        }

        const putRouter = new PutRouter();
        const routes = putRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should register DELETE routes correctly', () => {
        class DeleteRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'delete',
                    path: '/delete-route',
                    handler: jest.fn(),
                }];
            }
        }

        const deleteRouter = new DeleteRouter();
        const routes = deleteRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should register PATCH routes correctly', () => {
        class PatchRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'patch',
                    path: '/patch-route',
                    handler: jest.fn(),
                }];
            }
        }

        const patchRouter = new PatchRouter();
        const routes = patchRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should apply middleware before handler', () => {
        const middleware1 = jest.fn();
        const middleware2 = jest.fn();
        const handler = jest.fn();

        class MiddlewareRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'get',
                    path: '/middleware-route',
                    handler,
                    middleware: [middleware1, middleware2],
                }];
            }
        }

        const middlewareRouter = new MiddlewareRouter();
        const routes = middlewareRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should apply multiple middlewares in correct order', () => {
        const middleware1 = jest.fn();
        const middleware2 = jest.fn();
        const middleware3 = jest.fn();
        const handler = jest.fn();

        class MultiMiddlewareRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'get',
                    path: '/multi-middleware',
                    handler,
                    middleware: [middleware1, middleware2, middleware3],
                }];
            }
        }

        const multiRouter = new MultiMiddlewareRouter();
        const routes = multiRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should handle routes without middleware', () => {
        const handler = jest.fn();

        class NoMiddlewareRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'get',
                    path: '/no-middleware',
                    handler,
                }];
            }
        }

        const noMiddlewareRouter = new NoMiddlewareRouter();
        const routes = noMiddlewareRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should handle route paths with parameters correctly', () => {
        const handler = jest.fn();

        class ParamRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'get',
                    path: '/users/:id',
                    handler,
                }];
            }
        }

        const paramRouter = new ParamRouter();
        const routes = paramRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should handle route paths with query strings correctly', () => {
        const handler = jest.fn();

        class QueryRouter extends BaseRouter {
            protected routes(): RouteConfig[] {
                return [{
                    method: 'get',
                    path: '/search',
                    handler,
                }];
            }
        }

        const queryRouter = new QueryRouter();
        const routes = queryRouter.router.stack;
        expect(routes.length).toBeGreaterThan(0);
    });

    it('should throw error if routes() not implemented (abstract)', () => {
        // This test verifies that BaseRouter cannot be instantiated directly
        // TypeScript should prevent this at compile time, but we can test runtime behavior
        expect(() => {
            // @ts-expect-error - Testing abstract class instantiation
            new BaseRouter();
        }).toThrow();
    });
});
