const nodemailer = require("nodemailer");

class EmailDeliveryError extends Error {
    constructor(message = "Unable to send verification email.") {
        super(message);
        this.name = "EmailDeliveryError";
    }
}

function getEmailConfiguration() {
    const user = String(process.env.EMAIL_USER || "").trim();
    const password = String(process.env.EMAIL_PASSWORD || "").trim();
    const from =
        String(process.env.EMAIL_FROM || "").trim() || user;

    if (!user || !password) {
        throw new EmailDeliveryError();
    }

    return { user, password, from };
}

function getProviderErrorDetails(error) {
    if (!error) {
        return "Email provider returned an unknown error.";
    }

    const rawName = typeof error.name === "string" ? error.name : "Error";
    const rawMessage = typeof error.message === "string" ?
        error.message :
        "Email provider request failed.";

    // Provider errors are logged without the full request object. Redact the
    // configured password defensively in case a client includes it in an error.
    const password = String(process.env.EMAIL_PASSWORD || "").trim();
    const redact = (value) => password ?
        value.split(password).join("[REDACTED]") :
        value;

    return {
        name: redact(rawName),
        message: redact(rawMessage)
    };
}

async function sendOtpEmail(email, otp) {
    const recipient = String(email || "").trim().toLowerCase();
    const { user, password, from } = getEmailConfiguration();

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass: password }
        });
        const result = await transporter.sendMail({
        from: from,
        to: [recipient],
        subject: "City Scholar - Email Verification Code",

        text: `
City Scholarship Management System

Your verification code is: ${otp}

This code will expire shortly.

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
            This verification code will
            <strong>expire shortly</strong>.
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

            console.log(`OTP email sent successfully to ${recipient}`);
            return result;
        } catch (error) {
            if (error instanceof EmailDeliveryError) {
                throw error;
            }

            console.error(
                "OTP email delivery request failed:",
                getProviderErrorDetails(error)
            );
            throw new EmailDeliveryError();
        }
}

module.exports = {
    EmailDeliveryError,
    sendOtpEmail
};
