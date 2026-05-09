import jwt from "jsonwebtoken";
import "dotenv/config";

const protect = async (req, res, next) => {
    const token = req.cookies.access_token;
    console.log(token)
    jwt.verify(token, process.env.JWT_KEY, function(err, decoded) {
        if(!decoded){
            return res.status(401).json({message: "Unauthorized, Invalid token."})
        }
        else {
            req.username = decoded
            next()
        }
    });
}

export default protect