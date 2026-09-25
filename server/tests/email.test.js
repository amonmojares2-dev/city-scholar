jest.mock("nodemailer", () => ({
    createTransport: jest.fn()
}));

const nodemailer = require("nodemailer");
const {
    EmailDeliveryError,
    sendOtpEmail
} = require("../utils/email");


describe("Gmail SMTP OTP email delivery", () => {
    const originalUser = process.env.EMAIL_USER;
    const originalPassword = process.env.EMAIL_PASSWORD;
    const originalFrom = process.env.EMAIL_FROM;
    const sendMail = jest.fn();
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.EMAIL_USER = "sender@gmail.com";
        process.env.EMAIL_PASSWORD = "gmail_app_password";
        process.env.EMAIL_FROM = "City Scholar <sender@gmail.com>";
        nodemailer.createTransport.mockReturnValue({
            sendMail
        });
        sendMail.mockResolvedValue({
            messageId: "message_123"
        });
    });

    afterAll(() => {
        log.mockRestore();
        errorLog.mockRestore();

        if (originalUser === undefined) {
            delete process.env.EMAIL_USER;
        } else {
            process.env.EMAIL_USER = originalUser;
        }

        if (originalPassword === undefined) {
            delete process.env.EMAIL_PASSWORD;
        } else {
            process.env.EMAIL_PASSWORD = originalPassword;
        }

        if (originalFrom === undefined) {
            delete process.env.EMAIL_FROM;
        } else {
            process.env.EMAIL_FROM = originalFrom;
        }
    });

    it("sends the OTP to any address through Gmail SMTP", async() => {
        const result = await sendOtpEmail(" Student@Example.EDU ", "123456");

        expect(nodemailer.createTransport).toHaveBeenCalledWith({
            service: "gmail",
            auth: {
                user: "sender@gmail.com",
                pass: "gmail_app_password"
            }
        });
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            from: "City Scholar <sender@gmail.com>",
            to: ["student@example.edu"],
            subject: "City Scholar - Email Verification Code",
            text: expect.stringContaining("123456"),
            html: expect.stringContaining("123456")
        }));
        expect(result).toEqual({ messageId: "message_123" });
    });

    it.each([
        ["EMAIL_USER", "EMAIL_PASSWORD"],
        ["EMAIL_PASSWORD", "EMAIL_USER"]
    ])("requires %s", async(missingVariable, presentVariable) => {
        process.env[presentVariable] = presentVariable === "EMAIL_USER" ?
            "sender@gmail.com" :
            "gmail_app_password";
        delete process.env[missingVariable];

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toBeInstanceOf(EmailDeliveryError);
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it.each([undefined, "   "])(
        "uses EMAIL_USER as the sender when EMAIL_FROM is %p",
        async(emptyFrom) => {
            if (emptyFrom === undefined) {
                delete process.env.EMAIL_FROM;
            } else {
                process.env.EMAIL_FROM = emptyFrom;
            }

            await sendOtpEmail("student@example.edu", "123456");

            expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
                from: "sender@gmail.com"
            }));
        }
    );

    it("converts an SMTP error into a safe delivery error", async() => {
        sendMail.mockRejectedValue(
            new Error("SMTP password gmail_app_password was rejected")
        );

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toMatchObject({
                name: "EmailDeliveryError",
                message: "Unable to send verification email."
            });
        expect(errorLog).toHaveBeenCalledWith(
            "OTP email delivery request failed:",
            {
                name: "Error",
                message: "SMTP password [REDACTED] was rejected"
            }
        );
    });
});