const OTPVerification = require("../models/OTPVerification");
const bcrypt = require("bcryptjs");
jest.mock("../utils/email", () => ({
  sendOtpEmail: jest.fn().mockResolvedValue({}),
  EmailDeliveryError: class EmailDeliveryError extends Error {}
}));
const { sendOtpEmail } = require("../utils/email");
const { verifyOtp, resendOtp } = require("../controllers/userController");

function response() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn((code) => { res.statusCode = code; return res; }),
    json: jest.fn((body) => { res.body = body; return res; })
  };
  return res;
}

function challenge(overrides = {}) {
  return {
    _id: "challenge-1",
    purpose: "registration",
    otpHash: "hashed-otp",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    lastSentAt: new Date(Date.now() - 31 * 1000),
    attempts: 5,
    resendCount: 0,
    blockedUntil: null,
    verified: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  sendOtpEmail.mockReset();
  sendOtpEmail.mockResolvedValue({});
});

describe("OTP attempt lock", () => {
  it("locks registration verification for 60 seconds on the sixth incorrect code", async() => {
    const record = challenge();
    jest.spyOn(OTPVerification, "findById").mockResolvedValue(record);
    jest.spyOn(bcrypt, "compare").mockResolvedValue(false);
    const res = response();

    await verifyOtp({ body: { challengeId: record._id, otp: "123456" } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual(expect.objectContaining({
      blocked: true,
      remainingSeconds: 60,
      attemptsRemaining: 0
    }));
    expect(record.attempts).toBe(6);
    expect(record.blockedUntil.getTime()).toBeGreaterThan(Date.now() + 59 * 1000);
    expect(record.save).toHaveBeenCalled();
  });

  it("rejects verification while the 60-second lock is active", async() => {
    const record = challenge({
      attempts: 6,
      blockedUntil: new Date(Date.now() + 45 * 1000)
    });
    jest.spyOn(OTPVerification, "findById").mockResolvedValue(record);
    const compare = jest.spyOn(bcrypt, "compare");
    const res = response();

    await verifyOtp({ body: { challengeId: record._id, otp: "123456" } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.remainingSeconds).toBeGreaterThan(0);
    expect(compare).not.toHaveBeenCalled();
  });

  it("rejects resend while the 60-second lock is active", async() => {
    const record = challenge({
      attempts: 6,
      blockedUntil: new Date(Date.now() + 45 * 1000)
    });
    jest.spyOn(OTPVerification, "findById").mockResolvedValue(record);
    const res = response();

    await resendOtp({ body: { challengeId: record._id } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.blocked).toBe(true);
    expect(record.save).not.toHaveBeenCalled();
  });

  it("persists the replacement OTP before sending the email", async() => {
    const record = challenge({ attempts: 1 });
    const order = [];
    record.save.mockImplementation(async() => { order.push("saved"); });
    sendOtpEmail.mockImplementation(async() => { order.push("emailed"); });
    jest.spyOn(OTPVerification, "findById").mockResolvedValue(record);
    jest.spyOn(bcrypt, "hash").mockResolvedValue("replacement-hash");
    const res = response();

    await resendOtp({ body: { challengeId: record._id } }, res);

    expect(res.statusCode).toBe(200);
    expect(order).toEqual(["saved", "emailed"]);
    expect(record.otpHash).toBe("replacement-hash");
    expect(record.attempts).toBe(0);
  });

  it("requires a new code after the lock expires", async() => {
    const record = challenge({
      attempts: 6,
      blockedUntil: new Date(Date.now() - 1000)
    });
    jest.spyOn(OTPVerification, "findById").mockResolvedValue(record);
    const compare = jest.spyOn(bcrypt, "compare");
    const res = response();

    await verifyOtp({ body: { challengeId: record._id, otp: "123456" } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.mustResend).toBe(true);
    expect(compare).not.toHaveBeenCalled();
  });
});
