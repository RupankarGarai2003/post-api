const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB cap, matches the size check below
});

// Must match your Firebase project's storage bucket
// (Firebase Console -> Project settings -> General -> your web app config -> storageBucket).
// Override with the FIREBASE_STORAGE_BUCKET env var if needed.
const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  "post-your-thoughts-d0a34.firebasestorage.app";

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: STORAGE_BUCKET,
});
const db = getFirestore();
const bucket = getStorage().bucket();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home route
app.get("/", (req, res) => {
  res.send("Post Your Thoughts API is running 🚀");
});

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

      // Upload the original file buffer directly to Firebase Storage —
      // no Base64 conversion, no re-encoding.
      const ext = (file.originalname.match(/\.[a-zA-Z0-9]+$/) || [""])[0];
      const filename = `posts/${Date.now()}-${crypto
        .randomBytes(8)
        .toString("hex")}${ext}`;
      const blob = bucket.file(filename);
      const downloadToken = crypto.randomUUID();

      // Use a Firebase download token instead of blob.makePublic().
      // makePublic() throws on buckets with "uniform bucket-level access"
      // enabled (the default for newer Firebase projects), which was
      // causing the 500 errors. Tokened URLs work regardless of that
      // setting and are what the Firebase client SDK itself generates.
      await blob.save(file.buffer, {
        contentType: file.mimetype,
        resumable: false,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(filename)}?alt=media&token=${downloadToken}`;
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