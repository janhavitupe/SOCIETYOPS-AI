import type { Actor, Identity } from './auth/actor';

declare global {
  namespace Express {
    interface Request {
      /** Whoever is signed in. */
      identity?: Identity;
      /** The signed-in person in their active society; absent if they have none. */
      user?: Actor;
    }
  }
}
