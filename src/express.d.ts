import { JwtPayload } from './auth/authUtils';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
