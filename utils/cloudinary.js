import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();
cloudinary.config({ 
        cloud_name: 'dle2a8u0y', 
        api_key: '558698169261273', 
        api_secret: process.env.CLOUDINARY_API_SECRET // Click 'View API Keys' above to copy your API secret
    });

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'thriftmarket', transformation: [{ width: 800, quality: 'auto', fetch_format: 'auto' }] },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    ).end(buffer)
  })
}

export { uploadToCloudinary }