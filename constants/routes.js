const ROUTES = {
    USER: {
        // Auth
        HOME:                   "/",
        LOGIN:                  "/login",
        SIGNUP:                 "/signup",
        LOGOUT:                 "/logout",
        VERIFY_OTP:             "/verifyOtp",
        RESEND_OTP:             "/resendOtp",
        PAGE_ERROR:             "/pageNotFound",
        LANDING_PAGE:           "/landingPage",

        // Profile
        PROFILE:                "/profile",
        PROFILE_GET:            "/profile/getProfileEdit",
        PROFILE_UPDATE:         "/profile/update",
        PROFILE_DELETE_IMAGE:   "/profile/image",
        PROFILE_DELETE:         "/profile/delete",

        // Address
        ADDRESS:                "/address",
        ADD_ADDRESS:            "/addAddress",
        EDIT_ADDRESS:           "/editAddress",
        DELETE_ADDRESS:         "/deleteAddress/:id",

        // Forgot / Reset Password
        FORGOT_PASSWORD:        "/forgotPassword",
        FORGOT_EMAIL_VALID:     "/forgot-Email-valid",
        VERIFY_FORGOT_OTP:      "/verify-passForgot-otp",
        RESEND_FORGOT_OTP:      "/resend-otp",
        RESET_PASSWORD:         "/resetpassword",

        // Privacy & Password change
        PRIVACY:                "/privacy",
        CHANGE_EMAIL:           "/change-email",
        VERIFY_EMAIL_OTP_PAGE:  "/verify-email-change-otp",
        VERIFY_EMAIL_OTP:       "/verify-email-otp",
        RESEND_EMAIL_OTP:       "/resend-email-otp",
        VERIFY_CURRENT_PASSWORD:"/verify-current-password",
        CHANGE_PASSWORD_PAGE:   "/change-password",
        CHANGE_PASSWORD:        "/change-password",

        // Shop
        SHOP:                   "/shop",
        PRODUCT_LISTING:        "/productListing",
        PRODUCT_DETAILS:        "/productDetails/:id",
        PRODUCT_API:            "/api/products",
        ADD_REVIEW:             "/product/:productId/addReview",

        // Wishlist
        WISHLIST:               "/wishlist",
        ADD_TO_WISHLIST:        "/wishlist/add",
        REMOVE_FROM_WISHLIST:   "/wishlist/remove",
        MOVE_TO_CART:           "/wishlist/move-to-cart",

        // Cart
        CART:                   "/cart",
        ADD_TO_CART:            "/cart/add",
        UPDATE_CART:            "/cart/update",
        REMOVE_FROM_CART:       "/cart/remove",

        // Checkout
        CHECKOUT:               "/checkout",
        CHECKOUT_PLACE_ORDER:   "/checkout/place-order",
       
        CHECKOUT_COUPONS:       "/coupons",
        CHECKOUT_APPLY_COUPON:  "/checkout/apply-coupon",
        CHECKOUT_RAZORPAY_ORDER:"/checkout/razorpay-order",
        CHECKOUT_VERIFY_PAYMENT:"/checkout/verify-payment",
        CHECKOUT_PAYMENT_FAILED:"/checkout/payment-failed",
        ORDER_SUCCESS:          "/order-success/:id",

        // Orders
        ORDERS:                 "/orders",
        ORDER_DETAILS:          "/orders/:id",
        ORDER_CANCEL:           "/orders/:id/cancel",
        ORDER_RETURN:           "/orders/:id/return",

        // Wallet
        WALLET:                 "/wallet",
    },

    ADMIN: {
        LOGIN:                  "/admin/adminLogin",
        DASHBOARD:              "/admin/dashboard",
        CUSTOMERS:              "/admin/customers",
        CUSTOMERS_BLOCK:        "/admin/customers/:id",
        LOGOUT:                 "/admin/logout",
        PAGE_ERROR:             "/admin/pageerror",

        CATEGORIES:             "/admin/categories",
        CATEGORIES_ADD:         "/admin/addCategory",
        CATEGORIES_EDIT:        "/admin/categories",
        CATEGORIES_GET:         "/admin/Category",
        TOGGLE_CATEGORY_ROUTE:  "/admin/categories/:id/toggle",

        PRODUCTS:               "/admin/products",
        PRODUCTS_ADD:           "/admin/products/add",
        PRODUCTS_EDIT:          "/admin/products/edit/:id",
        PRODUCTS_API:           "/admin/products/api/:id",
        PRODUCTS_BLOCK:         "/admin/products/:id/block",
        PRODUCTS_LIST:          "/admin/products/:id/list",
        PRODUCTS_STATUS:        "/admin/products/:id/status",
        PRODUCTS_DELETE:        "/admin/products/:id",
        PRODUCTS_UPDATE:        "/admin/products/:id",

        OFFERS_ADD:             "/admin/offers/add",
        OFFERS_REMOVE_TARGET:   "/admin/offers/remove-by-target",
        ORDERS:                 "/admin/orders",
        ORDER_DETAIL:           "/admin/orders/:id",
        ORDER_UPDATE_STATUS:    "/admin/orders/:id/status",
        ORDER_HANDLE_RETURN:    "/admin/orders/:id/return",


        COUPONS:              "/admin/coupons",
COUPONS_ADD:          "/admin/coupons/add",
COUPONS_TOGGLE:       "/admin/coupons/:id/toggle",
COUPONS_DELETE:       "/admin/coupons/:id",
    }
};

module.exports = { ROUTES };