

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
        RESET_PASSWORD: "/resetpassword",
        PRIVACY: "/privacy",
        CHANGE_EMAIL: "/change-email",
        CHANGE_PASSWORD: "/change-password"
    },


ADMIN: {
     
        LOGIN: "/admin/adminLogin",   
        DASHBOARD: "/admin/dashboard",
        CUSTOMERS: "/admin/customers",
        CUSTOMERS_BLOCK: '/admin/customers/:id',
        LOGOUT: "/admin/logout",
        PAGE_ERROR: "/admin/pageerror"
    }
}
module.exports = {
    ROUTES
}