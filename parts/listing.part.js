import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { User } from "./user.part.js";
import protect from "../middleware/protect.js";
import upload from "../middleware/multer.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const listingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: {type: String},
    status: { type: String,enum: ["active", "sold", "hidden"], default: "active" },
    size: { type: String, size: 3, default: "" },
    brand: { type: String, default: "" },
    condition: {type: String, enum: ["new", "like-new", "good", "well-worn", "poor"], default: "good"},
    isSponsored: { type: Boolean, default: false },
    views: { type: Number, default: 0, increment: 1 },
    images: [{type: String}]
  },
  { timestamps: true }
);


listingSchema.index({ title: 'text', description: 'text', brand: 'text' })

export const Listing = mongoose.model("Listing", listingSchema);

const router = Router();

router.get('/search', async (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.json([]);
  }

  const listings = await Listing.find(
    {
      $text: { $search: q }
    },
    {
      score: { $meta: 'textScore' }
    }
  ).sort({
    score: { $meta: 'textScore' }
  });

  res.json(listings);
});

router.get('/featured', async (req, res, next) => {
  try {
    const base = { status: 'active' }
    const limit = 10

    // Find users with account-level sponsorship
    const sponsoredUsers = await User.find({ sponsored: true }).select('_id')
    const sponsoredUserIds = sponsoredUsers.map(u => u._id)

    const [sponsored, mostViewed, lowestPrice, newest, highestPrice] = await Promise.all([
      Listing.find({
        ...base,
        $or: [
          { isSponsored: true },
          { seller: { $in: sponsoredUserIds } }
        ]
      }).populate('seller', 'username location')
        .sort({ views: -1 }).limit(limit),

      Listing.find(base).populate('seller', 'username location')
      .sort({ views: -1 }).limit(limit),

      Listing.find(base).populate('seller', 'username location')
        .sort({ price: 1 }).limit(limit),

      Listing.find(base).populate('seller', 'username location')
        .sort({ createdAt: -1 }).limit(limit),

      Listing.find(base).populate('seller', 'username location')
        .sort({ price: -1 }).limit(limit),
    ])

    res.json({sponsored, mostViewed, lowestPrice, newest, highestPrice })
  } catch (err) { next(err) }
})

router.get('/user/:username', async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    const listings = await Listing.find({ seller: user._id, status: 'active' })
      .populate('seller', 'username avatar location')
      .sort({ createdAt: -1 });
    res.json(listings);
  } catch (err) { next(err) }
});

router.get('/my', protect, async (req, res, next) => {
  try {
    const user = await User.findOne({username: req.username})
    const listings = await Listing.find({ seller: user._id })
      .sort({ createdAt: -1 })
    res.json(listings)
  } catch (err) { next(err) }
})

router.get("/listings",
  async (req, res, next) => {
  try {
    const { search, category, size, condition, minPrice, maxPrice, page = 1 } = req.query
    const query = { status: 'active' }

    if (search) query.$text = { $search: search }
    if (category) query.category = category
    if (size) query.size = size
    if (condition) query.condition = condition
    if (minPrice || maxPrice) {
      query.price = {}
      if (minPrice) query.price.$gte = Number(minPrice)
      if (maxPrice) query.price.$lte = Number(maxPrice)
    }

    const limit = 20
    const skip = (page - 1) * limit
    const [listings, total] = await Promise.all([
      Listing.find(query).populate('seller', 'username avatar location').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Listing.countDocuments(query)
    ])

    res.json({ listings, total, pages: Math.ceil(total / limit), page: Number(page) })
  } catch (err) { next(err) }
}
);

router.get("/listing/:id", 
  asyncHandler(async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate('seller', 'username avatar location bio').lean();
    if (!listing) {
      return res.status(404).json({ success: false, error: "Listing not found" });
    }
    return res.status(200).json(listing)
  })
);

router.post("/create", protect, upload.array('images'), asyncHandler(async (req, res) => {
    const { name, description, size, category, condition, brand } = req.body;
    const seller = await User.findOne({username: req.username});

    if (req.body.price) req.body.price = Number(req.body.price)
    
    const imageUrls = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer)))

    const listing = await Listing.create({ name: name, seller: seller._id, description: description, 
      price: req.body.price, category: category, size: size, 
      brand: brand, condition: condition, images: imageUrls});
    
    if(!listing){
      return res.status(500).json({message: "ERROR, enable to post listing."})
    }
    else {
      console.log(listing)
      listing.save()
      return res.status(201).json({message: "Successfull, Listing was created"})
    }
  })
);


router.put("/update/:id", 
  asyncHandler(async (req, res) => {
    const Listing = await Listing.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).lean();
  if (!Listing) return res.status(404).json({ success: false, error: "Listing not found" });
  })
);

router.delete("/delete/:id", protect,
  asyncHandler(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, error: "Listing not found" });

    const user = await User.findOne({username: req.username})

    if(user._id.toString() == listing.seller.toString()){
      const deleted = await Listing.deleteOne({_id: listing._id})
      if (deleted.deletedCount === 0) {
      return res.status(500).json({message: "ERROR, unable to delete listing."})
      }
      return res.status(200).json({message: "listing deleted successfully"})
    } else {
      return res.status(403).json({ error: "Not authorized" });
    }
  })
);

router.patch("/:id/sold", protect,
  asyncHandler(async (req, res) => {
    const listing = await Listing.findById(req.params.id).lean();
    if (!listing) return res.status(404).json({ success: false, error: "Listing not found" });

    const user = await User.findOne({username: req.username})

    if(user._id.toString() === listing.seller.toString()){
      const sold = await Listing.updateOne({_id: listing._id}, {status: 'sold'});
      return res.status(200).json({message: "listing marked as sold successfully", listing: sold})
    }
    else {
      return res.status(400).json({message: "unsuccessful"})
    }
  })
);

export default router;