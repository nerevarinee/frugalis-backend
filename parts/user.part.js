import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import { asyncHandler } from "../utils/asyncHandler.js";
import { loginValidate, validate }     from "../middleware/validate.js";
import protect from "../middleware/protect.js";
import upload from "../middleware/multer.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { Listing } from "./listing.part.js";



const userSchema = new mongoose.Schema(
  {
    username:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true},
    avatar: { type: String },
    bio: { type: String, default: '' },
    location: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    sponsored: { type: Boolean, default: false },
    role:  { type: String, enum: ["user", "admin"], default: "user" },
    devices: [{ token: String, platform: { type: String, enum: ["android", "ios"] } }]
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);


const router = Router();

router.get('/me/stats', protect, async (req, res, next) => {
  try {
    const user = await User.findOne({username: req.username})
    const [active, sold, totalViews] = await Promise.all([
      
      Listing.countDocuments({ seller: user._id, status: 'active' }),
      Listing.countDocuments({ seller: user._id, status: 'sold' }),
      Listing.aggregate([
        { $match: { seller: user._id } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ])
    ])

    res.json({
      activeListings: active,
      soldListings: sold,
      totalViews: totalViews[0]?.total ?? 0
    })
  } catch (err) { next(err) }
})

router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findOne({username: req.username})
    res.json(user)
  } catch (err) { next(err) }
})

router.put('/me', protect, upload.single('avatar'), async (req, res, next) => {
  try {
    const user = await User.findOne({username: req.username})
    if (!user) return res.status(404).json({ message: 'User not found' })

    const updates = {}
    if (req.body.username) updates.username = req.body.username
    if (req.body.bio !== undefined) updates.bio = req.body.bio
    if (req.body.location !== undefined) updates.location = req.body.location
    if (req.body.whatsapp !== undefined) updates.whatsapp = req.body.whatsapp

    if (req.file) {
      const image = await uploadToCloudinary(req.file.buffer)
      if (image) updates.avatar = image.secure_url
    }

    const updated = await User.findByIdAndUpdate(user._id, updates, { new: true })
    res.json(updated)
  } catch (err) { next(err) }
})

router.get("/token_check", protect, asyncHandler(async (req, res) => {
      console.log(req.username)
      return res.status(666).end("TOKEN GOOD")
}));

router.get("/profile/:id", asyncHandler(async (req, res) => {
      const user = await User.findById(req.params.id).lean();
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
      return res.status(200).json(user)
}));

router.get("/profile/username/:username", asyncHandler(async (req, res, next) => {
      try {
        const user = await User.findOne({ username: req.params.username }).lean();
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        const [active, sold, totalViews] = await Promise.all([
          Listing.countDocuments({ seller: user._id, status: 'active' }),
          Listing.countDocuments({ seller: user._id, status: 'sold' }),
          Listing.aggregate([
            { $match: { seller: user._id } },
            { $group: { _id: null, total: { $sum: '$views' } } }
          ])
        ]);

        return res.status(200).json({
          username: user.username,
          avatar: user.avatar,
          bio: user.bio,
          location: user.location,
          whatsapp: user.whatsapp,
          sponsored: user.sponsored,
          createdAt: user.createdAt,
          activeListings: active,
          soldListings: sold,
          totalViews: totalViews[0]?.total ?? 0
        });
      } catch (err) { next(err) }
}));

router.post("/register", asyncHandler(async (req, res) => {
      const { username, email, password } = req.body;

      try {
      const usedEmail = await User.findOne({ email });
      if (usedEmail) {
            return res.status(400).json({message: 'Email already used'});
      }

      const usedUser = await User.findOne({username: username});
      if (usedUser) {
            return res.status(400).json({message: 'Username already taken'});
      }

      if (!usedUser || !usedEmail){
            const hash = await bcrypt.hash(password, 10);
            const userObj = await User.create({username: username, email: email, password:hash});
            console.log(userObj)
            if(userObj){
                  console.log(userObj)
                  return res.status(201).json({message: `User ${userObj.username} has been created succesfully`})
            }
            
      }} 
      catch (error) {
            return res.status(500).json({message: `ERROR, user was not saved succesfully`})
      }
      
}));

router.post("/login", asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const exist = await User.findOne({email: email});
      if (exist){
            const hash = exist.password;
            const compare = await bcrypt.compare(password, hash);
            if(compare){
                  const token = await jwt.sign({ id: exist._id, username: exist.username }, process.env.JWT_KEY, {
                        expiresIn: '8h'
                  });
                  return res
                        .status(202)
                        .cookie('access_token', token, {
                              expires: new Date(Date.now() + 8 * 3600000),
                              httpOnly: false
                        })
                        .json({message: `User has been Logged on succesfully`, token, user: { id: exist._id, username: exist.username, email: exist.email, avatar: exist.avatar }})
            }
            else {
                  return res.status(400).json({message: `ERROR,username or password are incorrect`})
            }
      } 
      else {
            return res.status(400).json({message: `ERROR,username or password are incorrect`})
      }
      
}));

/*router.put("/:id", asyncHandler(async (req, res) => {
      const user = await User.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      }).lean();
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
}));
router.delete("/:id", asyncHandler(async (req, res) => {
      const user = await User.findByIdAndDelete(req.params.id).lean();
      if (!user) return res.status(404).json({ success: false, error: "User not found" });
}));
*/

router.post("/avatar", protect, upload.single("avatar"), asyncHandler(async (req, res) => {
      const user = await User.findOne({username: req.username});
      const image = await uploadImage(req.file.buffer, 'avatars');
      if(!image){
            return res.status(500).json({message: "image upload was unsuccessful"});
      }
      const update = await User.updateOne({_id: user._id}, {avatar: image.secure_url});
      if (!update){
            return res.status(500).json({message: "avatar update was unsuccessful"})
      }
      return res.status(200).json({message: "avatar was updated successfully"})
}));

router.post("/device-token", protect, asyncHandler(async (req, res) => {
      const { token, platform } = req.body;
      if (!token || !platform) return res.status(400).json({ message: "token and platform are required" });
      if (!["android", "ios"].includes(platform)) return res.status(400).json({ message: "platform must be android or ios" });

      const user = await User.findOne({ username: req.username });
      if (!user) return res.status(404).json({ message: "User not found" });

      const existing = user.devices.find(d => d.token === token);
      if (!existing) {
        user.devices.push({ token, platform });
        await user.save();
      }
      res.json({ message: "Device token registered" });
}));

router.delete("/device-token", protect, asyncHandler(async (req, res) => {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "token is required" });

      const user = await User.findOne({ username: req.username });
      if (!user) return res.status(404).json({ message: "User not found" });

      user.devices = user.devices.filter(d => d.token !== token);
      await user.save();
      res.json({ message: "Device token removed" });
}));

router.post("/logout", protect, asyncHandler(async (req, res) => {
      return res.clearCookie('access_token').json({message: "User has been logged out"})
}));

export default router;