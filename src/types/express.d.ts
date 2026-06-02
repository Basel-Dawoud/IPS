// Augment Express's Request with our optional-auth user payload.
// Picked up automatically by tsc thanks to `"include": ["src/**/*"]`.
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

export {};
