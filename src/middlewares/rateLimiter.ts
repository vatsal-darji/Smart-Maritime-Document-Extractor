import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 10,                // 10 requests per window per IP
  standardHeaders: true,  // sends RateLimit-* headers automatically
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfterMs = (req.rateLimit.resetTime?.getTime() ?? Date.now()) - Date.now();
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: `Too many requests. Max 10 per minute per IP.`,
      retryAfterMs: Math.max(0, retryAfterMs),
    });
  },
});