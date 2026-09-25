jest.mock("@getbrevo/brevo", () => ({
    BrevoClient: jest.fn()
}));

const { BrevoClient } = require("@getbrevo/brevo");
const {
    EmailDeliveryError,
    sendOtpEmail
} = require("../utils/email");

describe("Brevo HTTPS OTP email delivery", () => {
    const originalApiKey = process.env.BREVO_API_KEY;
    const originalFrom = process.env.EMAIL_FROM;
    const sendTransacEmail = jest.fn();
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.BREVO_API_KEY = "brevo_test_key";
        process.env.EMAIL_FROM = "City Scholar <sender@example.com>";
        BrevoClient.mockImplementation(() => ({
            transactionalEmails: {
                sendTransacEmail
            }
        }));
        sendTransacEmail.mockResolvedValue({
            data: { messageId: "message_123" }
        });
    });

    afterAll(() => {
        log.mockRestore();
        errorLog.mockRestore();

        if (originalApiKey === undefined) {
            delete process.env.BREVO_API_KEY;
        } else {
            process.env.BREVO_API_KEY = originalApiKey;
        }

        if (originalFrom === undefined) {
            delete process.env.EMAIL_FROM;
        } else {
            process.env.EMAIL_FROM = originalFrom;
        }
    });

    it("sends the OTP to any address through the Brevo HTTPS API", async() => {
        const result = await sendOtpEmail(" Student@Example.EDU ", "123456");

        expect(BrevoClient).toHaveBeenCalledWith({
            apiKey: "brevo_test_key"
        });
        expect(sendTransacEmail).toHaveBeenCalledWith({
            sender: {
                name: "City Scholar",
                email: "sender@example.com"
            },
            to: [{ email: "student@example.edu" }],
            subject: "City Scholar - Email Verification Code",
            textContent: expect.stringContaining("123456"),
            htmlContent: expect.stringContaining("123456")
        });
        expect(result).toEqual({ data: { messageId: "message_123" } });
    });

    it("accepts a sender address without a display name", async() => {
        process.env.EMAIL_FROM = "sender@example.com";

        await sendOtpEmail("student@example.edu", "123456");

        expect(sendTransacEmail).toHaveBeenCalledWith(expect.objectContaining({
            sender: {
                name: "City Scholar",
                email: "sender@example.com"
            }
        }));
    });

    it.each(["BREVO_API_KEY", "EMAIL_FROM"])("requires %s", async(variable) => {
        delete process.env[variable];

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toBeInstanceOf(EmailDeliveryError);
        expect(BrevoClient).not.toHaveBeenCalled();
        expect(sendTransacEmail).not.toHaveBeenCalled();
    });

    it("logs the Brevo HTTP status and response message", async() => {
        const apiError = new Error("Request failed");
        apiError.statusCode = 400;
        apiError.body = { message: "Invalid sender address" };
        sendTransacEmail.mockRejectedValue(apiError);

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toMatchObject({
                name: "EmailDeliveryError",
                message: "Unable to send verification email."
            });
        expect(errorLog).toHaveBeenCalledWith(
            "OTP email delivery request failed:",
            {
                name: "Error",
                message: "Invalid sender address",
                statusCode: 400
            }
        );
    });
});
