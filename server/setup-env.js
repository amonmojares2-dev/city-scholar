// Jest setup file - provides required environment variables for tests.
// This ensures the server module loads correctly in the test environment
// without requiring full production configuration.

process.env.CLIENT_ORIGIN = "http://localhost:5173";
process.env.MONGO_URI = "mongodb://localhost:27017/test";
process.env.JWT_SECRET = "test-jwt-secret-for-testing-only";
process.env.NODE_ENV = "test";
process.env.PORT = "5000";
process.env.CSP_REPORT_ONLY = "false";

console.log("[jest-setup] Set test environment variables (CLIENT_ORIGIN, MONGO_URI, JWT_SECRET, NODE_ENV=test)");