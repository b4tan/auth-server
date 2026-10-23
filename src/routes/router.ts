import { Router } from 'express';
import type { RequestHandler } from 'express';

// Define HTTP methods
type RouteMethod = "get" | "post" | "put" | "delete" | "patch";

// Metadata for routes on the server
export interface RouteConfig {
    method: RouteMethod;            // HTTP method (GET, POST, etc.)
    path: string;                   // URL path for the route
    handler: RequestHandler;        // Request handler for the route (controller method)
    middleware?: RequestHandler[];  // Optional middlewares for this route
}
// Abstract base class for creating routes 
export default abstract class BaseRouter { // Cannot be instantiated directly, must be subclassed
    public router: Router;
    // Constructor that initializes the router
    constructor() {
        this.router = Router(); // create new router instance
        this.registerRoutes(); // register routes
    }
    // Abstract method that must be implemented by subclasses to define the routes
    protected abstract routes(): RouteConfig[]; // multiple routes one shot
    // Private method that registers all the routes defined in the `routes` method
    private registerRoutes(): void {
        this.routes().forEach(({method, path, handler, middleware = [] }) => {
        // Use the appropriate HTTP method to register the route, applying any middlewares before the handler
        this.router[method](path, ...middleware, handler);
        });
    }
}