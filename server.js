const express = require("express");
const cors = require("cors");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB cap, matches the size check below
});

// Cloudinary config — set these three as environment variables in Render
// (Dashboard -> your service -> Environment). Get the values from
// cloudinary.com/console, right at the top of the dashboard.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

initializeApp({
  credential: cert(serviceAccount),
});
const db = getFirestore();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home route
app.get("/", (req, res) => {
  res.send("Post Your Thoughts API is running 🚀");
});

// Uploads a Buffer to Cloudinary using its upload_stream API and
// resolves with the result (which includes secure_url).
function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "posts",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// Create post
app.post("/posts", upload.single("image"), async (req, res) => {
  try {
    const { name, text } = req.body;
    const file = req.file; // populated by multer when an "image" file is sent

    // Validate text
    if (!text || typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Text is required",
      });
    }

    let imageUrl = null;

    // Validate image (optional)
    if (file) {
      const allowedMimeTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Only PNG, JPG, JPEG and WEBP images are allowed.",
        });
      }
      if (file.size > 20 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "Image size must be less than 20 MB.",
        });
      }

      // Upload the original file buffer directly to Cloudinary —
      // no Base64 conversion, no re-encoding on our side.
      const result = await uploadBufferToCloudinary(file.buffer);
      imageUrl = result.secure_url;
    }

    const doc = await db.collection("posts").add({
      name:
        typeof name === "string" && name.trim()
          ? name.trim()
          : "Anonymous",
      text: text.trim(),
      image: imageUrl,
      ts: FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      success: true,
      id: doc.id,
      image: imageUrl,
      message: "Post created successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Get all posts
app.get("/posts", async (req, res) => {
  try {
    const snapshot = await db
      .collection("posts")
      .orderBy("ts", "desc")
      .get();
    const posts = [];
    snapshot.forEach((doc) => {
      posts.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});