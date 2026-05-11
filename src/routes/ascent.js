const express = require("express");

const Ascent = require("../models/Ascent");
const Route = require("../models/Route");
const Climber = require("../models/Climber");

const router = express.Router();

router.post("/new", async (req, res) => {
  try {
    const { routeID, date, type, notes, climberIDs } = req.body;

    if (!routeID || !date || !type || !Array.isArray(climberIDs)) {
      return res
        .status(400)
        .json({ error: "routeID, date, type, and climberIDs are required" });
    }

    if (!["normal", "topRope", "solo"].includes(type)) {
      return res.status(400).json({ error: "Invalid ascent type" });
    }

    const route = await Route.findById(routeID);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }

    const ascentDate = new Date(date);
    if (Number.isNaN(ascentDate.getTime())) {
      return res.status(400).json({ error: "Invalid date" });
    }

    const dayStart = new Date(ascentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(ascentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const existingAscents = await Ascent.find({
      date: { $gte: dayStart, $lte: dayEnd },
    }).select("date");

    const nextMillisecond =
      existingAscents.reduce(
        (highestMillisecond, ascent) =>
          Math.max(highestMillisecond, new Date(ascent.date).getMilliseconds()),
        0,
      ) + 1;

    if (nextMillisecond > 999) {
      return res
        .status(409)
        .json({ error: "Too many ascents already exist for this day" });
    }

    if (climberIDs.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one climberID is required" });
    }

    const climbers = await Climber.find({ _id: { $in: climberIDs } }).select(
      "_id",
    );
    if (climbers.length !== climberIDs.length) {
      return res.status(404).json({ error: "One or more climbers not found" });
    }

    const ascent = new Ascent({
      route: route._id,
      date: ascentDate.setMilliseconds(nextMillisecond),
      climbers: climberIDs.map((climberID) => ({
        climber: climberID,
        isAborted: false,
      })),
      leadClimber: type === "normal" ? climberIDs[0] : null,
      isAborted: false,
      isWithoutSupport: false,
      isTopRope: type === "topRope",
      isSolo: type === "solo",
      notes: notes === "" ? null : (notes ?? null),
    });

    if (Number.isNaN(ascent.date?.getTime())) {
      return res.status(400).json({ error: "Invalid date" });
    }

    await ascent.save();

    return res.status(201).json({ data: ascent });
  } catch (error) {
    console.error("Error creating ascent:", error);
    return res.status(500).json({ error: "Error creating ascent" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedAscent = await Ascent.findByIdAndDelete(id);
    if (!deletedAscent) {
      return res.status(404).json({ error: "Ascent not found" });
    }

    return res.status(200).json({ message: "Ascent deleted successfully" });
  } catch (error) {
    console.error("Error deleting ascent:", error);
    return res.status(500).json({ error: "Error deleting ascent" });
  }
});

module.exports = router;
