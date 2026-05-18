import jwt from "jsonwebtoken";
import "dotenv/config";

const protectEither = async (req, res, next) => {
    const token = req.cookies.access_token || req.cookies.guest_token || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({message: "Authentication required"})

    jwt.verify(token, process.env.JWT_KEY, function(err, decoded) {
        if (err || !decoded || typeof decoded !== 'object') {
            return res.status(401).json({message: "Invalid token"})
        }

        if (decoded.role === 'guest') {
            req.userType = 'guest'
            req.userId = decoded.guestId
            req.guestId = decoded.guestId
            req.guestPhone = decoded.phone
        } else if (decoded.id) {
            req.userType = 'seller'
            req.userId = decoded.id
            req.username = decoded.username
        } else {
            return res.status(401).json({message: "Invalid token payload"})
        }

        next()
    });
}

export default protectEither
