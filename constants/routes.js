

const ROUTES = {
    USER: {
        HOME: "/",
        LOGIN: "/login",
        SIGNUP: "/signup",
        LOGOUT: "/logout",
        CART: "/cart",
        CHECKOUT: "/checkout",
        ORDERS: "/orders",
        ORDER_DETAILS: "/orders/:id",
        PAGE_ERROR: "/pageNotFound",
        VERIFY_OTP: "/verifyOtp",
        RESEND_OTP: "/resendOtp",
        LANDING_PAGE: "/landingPage",
        PROFILE: "/profile",
        PROFILE_GET: "/profile/getProfileEdit",
        PROFILE_UPDATE: "/profile/update",
        PROFILE_DELETE_IMAGE: "/profile/image",
        PROFILE_DELETE: '/profile/delete',
        ADDRESS: "/address",
        ADD_ADDRESS: "/addAddress",
        EDIT_ADDRESS: "/editAddress",
        DELETE_ADDRESS: "/deleteAddress/:id",
        FORGOT_PASSWORD: "/forgotPassword",
        FORGOT_EMAIL_VALID: "/forgot-Email-valid",
        VERIFY_FORGOT_OTP: "/verify-passForgot-otp",
        RESEND_FORGOT_OTP: "/resend-otp",
        RESET_PASSWORD: "/resetpassword",
        PRIVACY: "/privacy",
        CHANGE_EMAIL: "/change-email",
        VERIFY_EMAIL_OTP_PAGE: "/verify-email-change-otp",
        VERIFY_EMAIL_OTP: "/verify-email-otp",
        RESEND_EMAIL_OTP: "/resend-email-otp",
        VERIFY_CURRENT_PASSWORD: "/verify-current-password",
        CHANGE_PASSWORD_PAGE: "/change-password",
        CHANGE_PASSWORD: "/change-password",
        SHOP: "/shop",
        PRODUCT_LISTING: "/productListing",
        PRODUCT_DETAILS: "/productDetails/:id",
        PRODUCT_API: "/api/products",
    },


  ADMIN: {
    LOGIN: "/admin/adminLogin",
    DASHBOARD: "/admin/dashboard",
    CUSTOMERS: "/admin/customers",
    CUSTOMERS_BLOCK: '/admin/customers/:id',
    LOGOUT: "/admin/logout",
    PAGE_ERROR: "/admin/pageerror",

    PRODUCTS: "/admin/products",
    PRODUCTS_ADD: "/admin/products/add",
    PRODUCTS_EDIT: "/admin/products/edit/:id",
    PRODUCTS_API: "/admin/products/api/:id",
    PRODUCTS_BLOCK: "/admin/products/:id/block",
    PRODUCTS_LIST: "/admin/products/:id/list",
    PRODUCTS_STATUS: "/admin/products/:id/status",
    PRODUCTS_DELETE: "/admin/products/:id",
    PRODUCTS_UPDATE: "/admin/products/:id",
}
}
module.exports = {
    ROUTES
}