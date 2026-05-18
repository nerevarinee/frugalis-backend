import jwt from "jsonwebtoken";
import "dotenv/config";

const protectGuest = async (req, res, next) => {
    const token = req.cookies.guest_token || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({message: "Unauthorized, No guest token provided."})

    jwt.verify(token, process.env.JWT_KEY, function(err, decoded) {
        if (err || !decoded || typeof decoded !== 'object' || decoded.role !== 'guest') {
            return res.status(401).json({message: "Unauthorized, Invalid guest token."})
        }

        req.guestId = decoded.guestId
        req.guestPhone = decoded.phone
        next()
    });
}

export default protectGuest
