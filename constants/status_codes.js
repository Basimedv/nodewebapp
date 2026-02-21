const HTTP_STATUS_CODES = {
    // ✅ SUCCESS RESPONSES
    OK: 200,                    // Request successful (fetch products, cart data)
    CREATED: 201,               // New resource created (signup, add address, create order)
    NO_CONTENT: 204,            // Success but nothing to return (delete item)

    // ❌ CLIENT ERRORS (User made mistake)
    BAD_REQUEST: 400,           // Invalid input / validation error
    UNAUTHORIZED: 401,          // User not logged in / token missing or invalid
    FORBIDDEN: 403,             // User logged in but no permission (not admin)
    NOT_FOUND: 404,             // Resource not found (product, order, coupon)
    METHOD_NOT_ALLOWED: 405,    // Wrong HTTP method used (GET instead of POST)
    CONFLICT: 409,              // Duplicate data (email exists, coupon already used)
    UNPROCESSABLE_ENTITY: 422,  // Logical error (invalid coupon, out-of-stock)
    TOO_MANY_REQUESTS: 429,     // Rate limit exceeded (too many attempts)

    // 💥 SERVER ERRORS (Backend problem)
    INTERNAL_SERVER_ERROR: 500, // Unexpected server crash / database issue
    NOT_IMPLEMENTED: 501,       // Feature not built yet
    SERVICE_UNAVAILABLE: 503,   // Server down / under maintenance
    GATEWAY_TIMEOUT: 504        // Server took too long to respond
};

module.exports = HTTP_STATUS_CODES;

   