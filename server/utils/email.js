const nodemailer = require("nodemailer");

function getTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        throw new Error("Gmail SMTP is not configured");
    }

    return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });
}

async function sendOtpEmail(email, otp) {
    const recipient = String(email || "").trim().toLowerCase();

    if (!recipient.endsWith("@gmail.com")) {
        throw new Error("OTP emails can only be sent to Gmail addresses");
    }

    const from =
        process.env.EMAIL_FROM ||
        `City Scholar <${process.env.EMAIL_USER}>`;

    const result = await getTransporter().sendMail({
        from: from,
        to: [recipient],
        subject: "City Scholar - Email Verification Code",

        text: `
City Scholarship Management System

Your verification code is: ${otp}

This code will expire in 5 minutes.

If you did not request this verification code, you can ignore this email.
        `.trim(),

        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>City Scholar Verification</title>
</head>

<body style="
    margin: 0;
    padding: 0;
    background: #f4f6fb;
    font-family: Arial, Helvetica, sans-serif;
">

    <div style="
        max-width: 600px;
        margin: 40px auto;
        background: white;
        padding: 40px;
        border-radius: 12px;
    ">

        <h1 style="color: #1f2b6c;">
            City Scholar
        </h1>

        <p>
            City Scholarship Management System
        </p>

        <hr>

        <p>
            Your email verification code is:
        </p>

        <div style="
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #f0f2f8;
            border-radius: 10px;
        ">

            <h1 style="
                color: #1f2b6c;
                letter-spacing: 8px;
            ">
                ${otp}
            </h1>

        </div>

        <p>
            This verification code will expire in
            <strong>5 minutes</strong>.
        </p>

        <p>
            If you did not request this verification code,
            you can safely ignore this email.
        </p>

        <hr>

        <p style="
            text-align: center;
            color: #888;
            font-size: 12px;
        ">
            City Scholarship Management System
        </p>

    </div>

</body>
</html>
        `
    });

    console.log(
        `OTP email sent successfully to ${recipient}`
    );

    return result;
}

module.exports = {
    sendOtpEmail
};
