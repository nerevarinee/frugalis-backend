import { Router } from "express";
import mongoose from "mongoose";
import jwt from 'jsonwebtoken'
import { asyncHandler } from "../utils/asyncHandler.js";
import protectGuest from "../middleware/protectGuest.js";

const guestSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true },
  name: { type: String, default: '' },
  location: { type: String, default: '' },
  savedListings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }]
}, { timestamps: true })

export const Guest = mongoose.model("Guest", guestSchema);

const router = Router();

router.post("/auth", asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone || !phone.trim()) {
    return res.status(400).json({ message: "Phone number is required" });
  }

  const cleanPhone = phone.trim();
  let guest = await Guest.findOne({ phone: cleanPhone });
  let isNew = false;

  if (!guest) {
    guest = await Guest.create({ phone: cleanPhone });
    isNew = true;
  }

  const token = jwt.sign(
    { guestId: guest._id, phone: guest.phone, role: 'guest' },
    process.env.JWT_KEY,
    { expiresIn: '30d' }
  );

  return res
    .status(200)
    .cookie('guest_token', token, {
      expires: new Date(Date.now() + 30 * 24 * 3600000),
      httpOnly: false
    })
    .json({
      message: isNew ? "Guest account created" : "Welcome back",
      token,
      guest: { id: guest._id, phone: guest.phone, name: guest.name, location: guest.location },
      isNew
    })
}));

router.get("/me", protectGuest, asyncHandler(async (req, res) => {
  const guest = await Guest.findById(req.guestId);
  if (!guest) return res.status(404).json({ message: "Guest not found" });
  res.json({ id: guest._id, phone: guest.phone, name: guest.name, location: guest.location });
}));

router.put("/me", protectGuest, asyncHandler(async (req, res) => {
  const { name, location } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (location !== undefined) updates.location = location;

  const guest = await Guest.findByIdAndUpdate(req.guestId, updates, { new: true });
  if (!guest) return res.status(404).json({ message: "Guest not found" });
  res.json({ id: guest._id, phone: guest.phone, name: guest.name, location: guest.location });
}));

router.get("/orders", protectGuest, asyncHandler(async (req, res) => {
  const { Order } = await import("./orders.part.js");
  const orders = await Order.find({ buyer: req.guestId })
    .populate('listing')
    .sort({ createdAt: -1 });
  res.json(orders);
}));

router.get("/saved-listings", protectGuest, asyncHandler(async (req, res) => {
  const guest = await Guest.findById(req.guestId).populate('savedListings');
  if (!guest) return res.status(404).json({ message: "Guest not found" });
  res.json(guest.savedListings);
}));

router.post("/saved-listings", protectGuest, asyncHandler(async (req, res) => {
  const { listingId } = req.body;
  if (!listingId) return res.status(400).json({ message: "listingId is required" });

  const guest = await Guest.findById(req.guestId);
  if (!guest) return res.status(404).json({ message: "Guest not found" });

  if (!guest.savedListings.includes(listingId)) {
    guest.savedListings.push(listingId);
    await guest.save();
  }

  res.json({ message: "Listing saved", savedListings: guest.savedListings });
}));

router.delete("/saved-listings/:listingId", protectGuest, asyncHandler(async (req, res) => {
  const { listingId } = req.params;

  const guest = await Guest.findById(req.guestId);
  if (!guest) return res.status(404).json({ message: "Guest not found" });

  guest.savedListings = guest.savedListings.filter(
    id => id.toString() !== listingId
  );
  await guest.save();

  res.json({ message: "Listing unsaved", savedListings: guest.savedListings });
}));

router.post("/logout", protectGuest, asyncHandler(async (req, res) => {
  return res.clearCookie('guest_token').json({ message: "Guest logged out" });
}));

export default router
