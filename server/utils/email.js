const { BrevoClient } = require("@getbrevo/brevo");

class EmailDeliveryError extends Error {
    constructor(message = "Unable to send verification email.") {
        super(message);
        this.name = "EmailDeliveryError";
    }
}

function getEmailConfiguration() {
    const apiKey = String(process.env.BREVO_API_KEY || "").trim();
    const emailFrom = String(process.env.EMAIL_FROM || "").trim();

    if (!apiKey || !emailFrom) {
        throw new EmailDeliveryError();
    }

    return {
        apiKey,
        sender: parseSender(emailFrom)
    };
}

function parseSender(value) {
    const namedSender = String(value || "").match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);

    if (namedSender) {
        return {
            name: namedSender[1].trim() || "City Scholar",
            email: namedSender[2].trim()
        };
    }

    return {
        name: "City Scholar",
        email: String(value || "").trim()
    };
}

function getProviderErrorDetails(error) {
    if (!error) {
        return "Email provider returned an unknown error.";
    }

    const rawName = typeof error.name === "string" ? error.name : "Error";
    const rawMessage = typeof error.message === "string" ?
        error.message :
        "Email provider request failed.";

    const responseBody = error?.body || error?.response?.body;
    const statusCode = error?.statusCode ||
        error?.response?.status ||
        error?.rawResponse?.status;

    return {
        name: rawName,
        message: responseBody?.message ||
            responseBody?.error?.message ||
            (typeof responseBody === "string" ? responseBody : rawMessage),
        statusCode: statusCode || "unknown"
    };
}

async function sendOtpEmail(email, otp) {
    const recipient = String(email || "").trim().toLowerCase();
    const { apiKey, sender } = getEmailConfiguration();

    try {
        const brevo = new BrevoClient({ apiKey });
        const result = await brevo.transactionalEmails.sendTransacEmail({
        sender,
        to: [{ email: recipient }],
        subject: "City Scholar - Email Verification Code",
        textContent: `
City Scholarship Management System

Your verification code is: ${otp}

This code will expire shortly.

If you did not request this verification code, you can ignore this email.
        `.trim(),

        htmlContent: `
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
