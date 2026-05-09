/**
 * Wraps an async route handler and forwards errors to the next() error handler.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);