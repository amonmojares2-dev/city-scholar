jest.mock("resend", () => ({
    Resend: jest.fn()
}));

const { Resend } = require("resend");
const {
    EmailDeliveryError,
    sendOtpEmail
} = require("../utils/email");


describe("Resend OTP email delivery", () => {
    const originalApiKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.EMAIL_FROM;
    const send = jest.fn();
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RESEND_API_KEY = "re_test_secret";
        process.env.EMAIL_FROM = "City Scholar <otp@verified.example>";
        Resend.mockImplementation(() => ({ emails: { send } }));
        send.mockResolvedValue({
            data: { id: "email_123" },
            error: null
        });
    });

    afterAll(() => {
        log.mockRestore();
        errorLog.mockRestore();

        if (originalApiKey === undefined) {
            delete process.env.RESEND_API_KEY;
        } else {
            process.env.RESEND_API_KEY = originalApiKey;
        }

        if (originalFrom === undefined) {
            delete process.env.EMAIL_FROM;
        } else {
            process.env.EMAIL_FROM = originalFrom;
        }
    });

    it("sends the OTP through the Resend HTTP API", async() => {
        const result = await sendOtpEmail(" Student@Example.EDU ", "123456");

        expect(Resend).toHaveBeenCalledWith("re_test_secret");
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            from: "City Scholar <otp@verified.example>",
            to: ["student@example.edu"],
            subject: "City Scholar - Email Verification Code",
            text: expect.stringContaining("123456"),
            html: expect.stringContaining("123456")
        }));
        expect(result).toEqual({ id: "email_123" });
    });

    it("requires both Resend environment variables", async() => {
        delete process.env.RESEND_API_KEY;

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toBeInstanceOf(EmailDeliveryError);
        expect(Resend).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();

        process.env.RESEND_API_KEY = "re_test_secret";
        delete process.env.EMAIL_FROM;

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toBeInstanceOf(EmailDeliveryError);
        expect(Resend).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it("converts a provider response error into a safe delivery error", async() => {
        send.mockResolvedValue({
            data: null,
            error: {
                name: "validation_error",
                message: "Invalid sender re_test_secret"
            }
        });

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toMatchObject({
                name: "EmailDeliveryError",
                message: "Unable to send verification email."
            });
        expect(errorLog).toHaveBeenCalledWith(
            "OTP email delivery failed:",
            {
                name: "validation_error",
                message: "Invalid sender [REDACTED]"
            }
        );
    });

    it("converts a thrown API request error into a safe delivery error", async() => {
        send.mockRejectedValue(new Error("network unavailable"));

        await expect(sendOtpEmail("student@example.edu", "123456"))
            .rejects.toBeInstanceOf(EmailDeliveryError);
        expect(errorLog).toHaveBeenCalledWith(
            "OTP email delivery request failed:",
            {
                name: "Error",
                message: "network unavailable"
            }
        );
    });
});