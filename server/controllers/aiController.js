const getEligibility = async(req, res) => {
    const { income, residency, enrollment } = req.body;
    const eligible = Number(income) <= 250000 && residency === "yes" && enrollment === "yes";
    res.json({ success: true, eligible, reasons: eligible ? ["The supplied information meets the basic screening criteria."] : ["Applicants must be a city resident, currently enrolled, and within the income limit."], disclaimer: "This is a preliminary screening only. Final eligibility is determined during application review." });
};

const askAssistant = async(req, res) => {
    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ success: false, message: "Question is required" });
    res.json({ success: true, answer: "Please review the scholarship guidelines or contact the City Scholarship Office for case-specific assistance.", question });
};

module.exports = { getEligibility, askAssistant };