import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { User } from "./user.part.js";
import { Listing } from "./listing.part.js";
import protect from "../middleware/protect.js";
import upload from "../middleware/multer.js";

const router = Router();


const orderSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tel: { type: String, required: true },
    location: { type: String, required: true },
    deliveryType: { type: String, enum: ['pickup', 'delivery'], required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
})

const Order = mongoose.model("Order", orderSchema);

router.post('/create', async (req, res, next) => {
  try {
    const { listing, tel, location, deliveryType } = req.body

    const listingDoc = await Listing.findById(listing)
    if (!listingDoc) return res.status(404).json({ message: 'Listing not found' })

    const order = new Order({ listing: listing,
        seller:listingDoc.seller, tel: tel, location: location, deliveryType: deliveryType })
    await order.save()
    res.status(201).json(order)
  } catch (err) { console.error(err); next(err) }
})

router.get('/my', protect, async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.username })
    const orders = await Order.find({ seller: user._id })
      .populate('listing')
      .sort({ createdAt: -1 })
    res.json(orders)
  } catch (err) { next(err) }
})

router.patch('/:id/status', protect, async (req, res, next) => {
    try {
        const { status } = req.body
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true })
        res.json(order)
    } catch (err) { next(err) }
})

router.delete('/:id', protect, async (req, res, next) => {
    try {
        await Order.findByIdAndDelete(req.params.id)
        res.json({ message: 'Order deleted' })
    } catch (err) { next(err) }
})

export default router