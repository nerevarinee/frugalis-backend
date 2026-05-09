export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode ?? 500;
  const message    = err.message   ?? "Internal Server Error";

  if (process.env.NODE_ENV !== "production") {
    console.error(`[ERROR ${statusCode}] ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}