import { Router } from "express";
import mongoose from "mongoose";
import jwt from 'jsonwebtoken'
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { User } from "./user.part.js";
import { Guest } from "./guest.part.js";
import { Listing } from "./listing.part.js";
import protect from "../middleware/protect.js";
import upload from "../middleware/multer.js";
import { sendPush } from "../utils/push.js";

const router = Router();


const orderSchema = new mongoose.Schema({
  listing:       { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  seller:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyer:         { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', default: null },
  tel:           { type: String, required: true },
  location:      { type: String, required: true },
  deliveryType:  { type: String, enum: ['pickup', 'delivery'], required: true },

  // ── new fields ──────────────────────────────
  type:          { type: String, enum: ['order', 'offer'], default: 'order' },
  proposedPrice: { type: Number, default: null },   // buyer's offer price
  counterPrice:  { type: Number, default: null },   // seller's counter price
  // ─────────────────────────────────────────────

  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'countered'],  // add 'countered'
    default: 'pending'
  }
}, { timestamps: true })

const Order = mongoose.model('Order', orderSchema)

router.post('/create', async (req, res, next) => {
  try {
    const { listing, tel, location, deliveryType, type, proposedPrice } = req.body

    const listingDoc = await Listing.findById(listing)
    if (!listingDoc) return res.status(404).json({ message: 'Listing not found' })
    if (listingDoc.status !== 'active')
      return res.status(400).json({ message: 'Listing is not available' })

    // if it's an offer, proposedPrice is required and must be less than listing price
    if (type === 'offer') {
      if (!proposedPrice)
        return res.status(400).json({ message: 'Proposed price is required for offers' })
      if (proposedPrice <= 0)
        return res.status(400).json({ message: 'Offer price must be greater than 0' })
      if (proposedPrice >= listingDoc.price)
        return res.status(400).json({ message: `Offer must be less than $${listingDoc.price}` })
    }

    // duplicate check — one active offer/order per tel per listing
    const duplicate = await Order.findOne({
      listing,
      tel,
      status: { $in: ['pending', 'countered'] }
    })
    if (duplicate)
      return res.status(429).json({ message: 'You already have an active offer on this item' })

    // try to link guest buyer if guest token is present
    let buyerId = null
    const guestToken = req.cookies.guest_token || req.body.guestToken || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1])
    if (guestToken) {
      try {
        const decoded = jwt.verify(guestToken, process.env.JWT_KEY)
        if (decoded && decoded.role === 'guest' && decoded.guestId) {
          buyerId = decoded.guestId
        }
      } catch {}
    }

    const order = new Order({
      listing,
      seller: listingDoc.seller,
      buyer: buyerId,
      tel,
      location,
      deliveryType,
      type:          type === 'offer' ? 'offer' : 'order',
      proposedPrice: type === 'offer' ? proposedPrice : null
    })

    await order.save()

    // Direct orders hide the listing (reserve); offers keep it active
    if (type !== 'offer') {
      await Listing.findByIdAndUpdate(listing, { status: 'hidden' })
    }

    // Send push notification to the seller
    const sellerUser = await User.findById(listingDoc.seller)
    if (sellerUser) {
      const orderType = type === 'offer' ? 'Offer' : 'Order'
      await sendPush(
        sellerUser,
        `New ${orderType}`,
        `${orderType} placed on "${listingDoc.name}" by ${tel}`,
        { type: 'new_order', orderId: order._id.toString() }
      )
    }

    res.status(201).json(order)
  } catch (err) { next(err) }
})

router.patch('/:id/counter', protect, async (req, res, next) => {
  try {
    const { counterPrice } = req.body
    const order = await Order.findById(req.params.id).populate('listing')

    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (order.seller.toString() !== req.user.id)
      return res.status(403).json({ message: 'Forbidden' })
    if (order.type !== 'offer')
      return res.status(400).json({ message: 'Can only counter offers, not direct orders' })
    if (order.status !== 'pending')
      return res.status(400).json({ message: 'Can only counter pending offers' })
    if (!counterPrice || counterPrice <= 0)
      return res.status(400).json({ message: 'Counter price must be greater than 0' })
    if (counterPrice >= order.listing.price)
      return res.status(400).json({ message: 'Counter price must be less than original price' })

    order.counterPrice = counterPrice
    order.status = 'countered'
    await order.save()

    res.json(order)
  } catch (err) { next(err) }
})

// buyer accepts or rejects a counter offer
router.patch('/:id/respond', async (req, res, next) => {
  try {
    const { tel, decision } = req.body  // decision: 'accepted' | 'rejected'

    if (!['accepted', 'rejected'].includes(decision))
      return res.status(400).json({ message: 'Decision must be accepted or rejected' })

    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Not found' })

    // use tel as buyer identity — no account needed
    if (order.tel !== tel)
      return res.status(403).json({ message: 'Phone number does not match this order' })

    if (order.status !== 'countered')
      return res.status(400).json({ message: 'This offer is not awaiting your response' })

    order.status = decision
    await order.save()

    // Buyer accepted a counter → listing becomes hidden (reserved)
    if (decision === 'accepted') {
      await Listing.findByIdAndUpdate(order.listing, { status: 'hidden' })
    }

    res.json(order)
  } catch (err) { next(err) }
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

    // countered status is only set via the /counter route
    if (status === 'countered')
      return res.status(400).json({ message: 'Use the /counter endpoint instead' })

    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Order not found' })

    const prevStatus = order.status

    // Update listing status based on order type + transition
    if (status === 'accepted') {
      if (order.type === 'order') {
        await Listing.findByIdAndUpdate(order.listing, { status: 'sold' })
      } else {
        // offer accepted → listing hidden
        await Listing.findByIdAndUpdate(order.listing, { status: 'hidden' })
      }
    } else if (status === 'rejected') {
      if (order.type === 'order') {
        // Release the reservation
        await Listing.findByIdAndUpdate(order.listing, { status: 'active' })
      }
      // rejected offers don't affect listing
    } else if (status === 'pending') {
      // Undo / refund — restore listing based on what it was before
      if (prevStatus === 'accepted') {
        // Refund: listing goes back to active
        await Listing.findByIdAndUpdate(order.listing, { status: 'active' })
      } else if (prevStatus === 'rejected') {
        // Reconsider: reserving again
        if (order.type === 'order') {
          await Listing.findByIdAndUpdate(order.listing, { status: 'hidden' })
        }
        // offers stay active when reconsidered
      }
    }

    order.status = status
    await order.save()

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