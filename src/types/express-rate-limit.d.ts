import 'express-serve-static-core';
import type { ClientRateLimitInfo } from 'express-rate-limit';

declare module 'express-serve-static-core' {
  interface Request {
    rateLimit?: ClientRateLimitInfo;
  }
}
