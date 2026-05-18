import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import protectEither from "../middleware/protectEither.js";
import { Guest } from "./guest.part.js";
import { User } from "./user.part.js";
import { Listing } from "./listing.part.js";
import { sendPush } from "../utils/push.js";

const conversationSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  guest:   { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
  seller:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  lastMessage: {
    text:       { type: String, default: '' },
    senderType: { type: String, enum: ['guest', 'seller'], default: 'guest' },
    createdAt:  { type: Date, default: Date.now }
  },
  unreadGuest:  { type: Number, default: 0 },
  unreadSeller: { type: Number, default: 0 }
}, { timestamps: true })

conversationSchema.index({ listing: 1, guest: 1 }, { unique: true })

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderType:   { type: String, enum: ['guest', 'seller'], required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, required: true },
  text:         { type: String, required: true }
}, { timestamps: true })

messageSchema.index({ conversation: 1, createdAt: 1 })

const Conversation = mongoose.model('Conversation', conversationSchema)
const Message = mongoose.model('Message', messageSchema)

const router = Router()

// ── create or find a conversation ──────────────────────────────
router.post('/conversations', protectEither, asyncHandler(async (req, res) => {
  const { listingId, orderId } = req.body
  if (!listingId) return res.status(400).json({ message: 'listingId is required' })

  const listing = await Listing.findById(listingId)
  if (!listing) return res.status(404).json({ message: 'Listing not found' })

  // guests create conversations; sellers can only find existing ones
  if (req.userType === 'guest') {
    const existing = await Conversation.findOne({ listing: listingId, guest: req.guestId })
    if (existing) return res.json(existing)

    const conversation = await Conversation.create({
      listing: listingId,
      guest: req.guestId,
      seller: listing.seller,
      order: orderId || null
    })
    return res.status(201).json(conversation)
  }

  // seller — find existing conversations for their listings
  const conv = await Conversation.findOne({ listing: listingId, seller: req.userId })
  if (!conv) return res.status(404).json({ message: 'Conversation not found' })
  return res.json(conv)
}))

// ── list conversations for the current user ─────────────────────
router.get('/conversations', protectEither, asyncHandler(async (req, res) => {
  let filter = {}
  if (req.userType === 'guest') {
    filter = { guest: req.guestId }
  } else {
    filter = { seller: req.userId }
  }

  const conversations = await Conversation.find(filter)
    .populate('listing', 'name images price status')
    .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })

  res.json(conversations)
}))

// ── get a single conversation + latest messages ─────────────────
router.get('/conversations/:id', protectEither, asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id)
    .populate('listing', 'name images price status')
    .populate('guest', 'phone')
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' })

  // verify access
  if (req.userType === 'guest' && conversation.guest._id.toString() !== req.guestId) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (req.userType === 'seller' && conversation.seller.toString() !== req.userId) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  const messages = await Message.find({ conversation: req.params.id })
    .sort({ createdAt: 1 })
    .limit(100)

  // mark unread as read
  if (req.userType === 'guest' && conversation.unreadGuest > 0) {
    conversation.unreadGuest = 0
    await conversation.save()
  }
  if (req.userType === 'seller' && conversation.unreadSeller > 0) {
    conversation.unreadSeller = 0
    await conversation.save()
  }

  res.json({ conversation, messages })
}))

// ── send a message ──────────────────────────────────────────────
router.post('/conversations/:id', protectEither, asyncHandler(async (req, res) => {
  const { text } = req.body
  if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required' })

  const conversation = await Conversation.findById(req.params.id)
    .populate('listing', 'name')
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' })

  // verify access
  if (req.userType === 'guest' && conversation.guest.toString() !== req.guestId) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (req.userType === 'seller' && conversation.seller.toString() !== req.userId) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  const message = await Message.create({
    conversation: req.params.id,
    senderType: req.userType,
    sender: req.userId,
    text: text.trim()
  })

  // update lastMessage + unread count
  conversation.lastMessage = {
    text: text.trim(),
    senderType: req.userType,
    createdAt: message.createdAt
  }
  if (req.userType === 'guest') {
    conversation.unreadSeller += 1
  } else {
    conversation.unreadGuest += 1
  }
  await conversation.save()

  // push notification to the other party
  if (req.userType === 'guest') {
    const sellerUser = await User.findById(conversation.seller)
    if (sellerUser) {
      const guest = await Guest.findById(req.guestId)
      await sendPush(
        sellerUser,
        'New Message',
        `Message from ${guest?.phone || 'a buyer'} about "${conversation.listing?.name || 'listing'}"`,
        { type: 'new_message', conversationId: conversation._id.toString() }
      )
    }
  }

  res.status(201).json(message)
}))

// ── poll for new messages ──────────────────────────────────────
router.get('/conversations/:id/poll', protectEither, asyncHandler(async (req, res) => {
  const after = req.query.after ? new Date(req.query.after) : new Date(0)

  const conversation = await Conversation.findById(req.params.id)
  if (!conversation) return res.status(404).json({ message: 'Conversation not found' })

  if (req.userType === 'guest' && conversation.guest.toString() !== req.guestId) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (req.userType === 'seller' && conversation.seller.toString() !== req.userId) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  const messages = await Message.find({
    conversation: req.params.id,
    createdAt: { $gt: after }
  }).sort({ createdAt: 1 })

  res.json(messages)
}))

// ── get unread count ──────────────────────────────────────────────
router.get('/unread-count', protectEither, asyncHandler(async (req, res) => {
  let filter = {}
  if (req.userType === 'guest') {
    filter = { guest: req.guestId }
  } else {
    filter = { seller: req.userId }
  }

  const conversations = await Conversation.find(filter).select('unreadGuest unreadSeller')

  let count = 0
  for (const c of conversations) {
    count += req.userType === 'guest' ? c.unreadGuest : c.unreadSeller
  }

  res.json({ count })
}))

export { Conversation, Message }
export default router
