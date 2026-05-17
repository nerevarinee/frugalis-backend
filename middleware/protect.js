import jwt from "jsonwebtoken";
import "dotenv/config";

const protect = async (req, res, next) => {
    const token = req.cookies.access_token || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
    if (!token) return res.status(401).json({message: "Unauthorized, No token provided."})

    jwt.verify(token, process.env.JWT_KEY, function(err, decoded) {
        if (err || !decoded || typeof decoded !== 'object') {
            return res.status(401).json({message: "Unauthorized, Invalid token."})
        }

        req.username = decoded.username
        req.userId = decoded.id
        next()
    });
}

export default protect