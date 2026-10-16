const { isEventAttendanceAccess } = require("../shared/eventAttendanceAccess");

describe("shared Events attendance access rule", () => {
    it.each([
        [{ scholarType: "existing_scholar", scholarVerificationStatus: "pending" }, true],
        [{ scholarType: "existing_scholar", scholarVerificationStatus: "approved" }, true],
        [{ scholarType: "new_applicant", applicationApproved: true }, true],
        [{ scholarType: "new_applicant", applicationApproved: false }, false],
        [{ scholarType: "existing_scholar", scholarVerificationStatus: "rejected" }, false],
        [null, false]
    ])("evaluates account access %j", (account, expected) => {
        expect(isEventAttendanceAccess(account)).toBe(expected);
    });
});
