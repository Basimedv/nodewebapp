const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

/**
 * Generates a random 4-digit OTP
 */
const generateOtp = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

/**
 * Hashes passwords for security
 */
const securePassword = async (password) => {
    try {
        const saltRounds = 10;
        return await bcrypt.hash(password, saltRounds);
    } catch (error) {
        console.error("Error hashing password:", error);
    }
};

/**
 * Sends OTP via Email
 */
const sendVerificationEmail = async (email, otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            },
        });

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Verify your account - OTP',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
                    <h2>Account Verification</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #198754;">${otp}</h1>
                    <p>This code expires in 1 minute.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        return info.accepted.length > 0;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = {
    generateOtp,
    securePassword,
    sendVerificationEmail
};