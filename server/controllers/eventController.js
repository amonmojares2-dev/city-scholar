const Event = require("../models/Event");

const listEvents = async(req, res, next) => {
    try {
        const events = await Event.find().sort({ startsAt: 1 });
        const result = events.map(event => ({...event.toObject(), attendanceStatus: event.attendees.some(attendee => attendee.toString() === req.user.id) ? "attended" : null }));
        res.json({ success: true, events: result });
    } catch (error) { next(error); }
};

const markAttendance = async(req, res, next) => {
    try {
        const event = await Event.findByIdAndUpdate(req.params.id, { $addToSet: { attendees: req.user.id } }, { new: true });
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        res.json({ success: true, event });
    } catch (error) { next(error); }
};

const createEvent = async(req, res, next) => {
    try {
        const { name, description, startsAt, endsAt, location, required = false } = req.body;
        if (!name || !startsAt || !location) return res.status(400).json({ success: false, message: "Name, start time, and location are required" });
        const event = await Event.create({ name, description, startsAt, endsAt, location, required });
        res.status(201).json({ success: true, event });
    } catch (error) { next(error); }
};

const updateEvent = async(req, res, next) => {
    try {
        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });
        res.json({ success: true, event });
    } catch (error) { next(error); }
};

module.exports = { listEvents, markAttendance, createEvent, updateEvent };