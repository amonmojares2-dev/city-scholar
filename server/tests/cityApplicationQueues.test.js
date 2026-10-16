jest.mock("../models/Application", () => ({ find: jest.fn() }));

const Application = require("../models/Application");
const { listApplications } = require("../controllers/applicationController");

function response() {
    return {
        status: jest.fn(function(code) {
            this.statusCode = code;
            return this;
        }),
        json: jest.fn(function(body) {
            this.body = body;
            return this;
        })
    };
}

function queryWithNoResults() {
    const query = {
        populate: jest.fn(),
        sort: jest.fn().mockResolvedValue([])
    };
    query.populate.mockReturnValue(query);
    return query;
}

describe("City application queues", () => {
    beforeEach(() => jest.clearAllMocks());

    it("queries submitted, residency-approved applications without renewal records", async() => {
        Application.find.mockReturnValue(queryWithNoResults());
        const res = response();

        await listApplications({
            user: { id: "city-1", role: "city_admin" },
            query: { queue: "application" }
        }, res, jest.fn());

        expect(Application.find).toHaveBeenCalledWith({
            status: { $nin: ["draft", "renewal"] },
            barangayVerificationStatus: "approved"
        });
        expect(res.body.applications).toEqual([]);
    });

    it("queries only renewal records for the renewals queue", async() => {
        Application.find.mockReturnValue(queryWithNoResults());
        const res = response();

        await listApplications({
            user: { id: "city-1", role: "city_admin" },
            query: { queue: "renewal" }
        }, res, jest.fn());

        expect(Application.find).toHaveBeenCalledWith({ status: "renewal" });
        expect(res.body.applications).toEqual([]);
    });

    it("rejects unknown City queue types", async() => {
        const res = response();

        await listApplications({
            user: { id: "city-1", role: "city_admin" },
            query: { queue: "anything" }
        }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Application.find).not.toHaveBeenCalled();
    });
});
