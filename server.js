const express = require("express");
const cors = require("cors");

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const app = express();

app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("Post Your Thoughts API is running 🚀");
});
// Create post
app.post("/posts", async (req, res) => {
  try {
    const { name, text, image } = req.body;

    // Validate text
    if (!text || typeof text !== "string" || text.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Text is required",
      });
    }

    let imageData = null;

    // Validate image (optional)
    if (image !== undefined && image !== null) {
      if (typeof image !== "string") {
        return res.status(400).json({
          success: false,
          message: "Image must be a Base64 string.",
        });
      }

      const imageRegex =
        /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+$/;

      if (!imageRegex.test(image)) {
        return res.status(400).json({
          success: false,
          message:
            "Only PNG, JPG, JPEG and WEBP Base64 images are allowed.",
        });
      }

      const base64 = image.split(",")[1];
      const imageSize = Buffer.byteLength(base64, "base64");

      if (imageSize > 20 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "Image size must be less than 2 MB.",
        });
      }

      imageData = image;
    }

    const doc = await db.collection("posts").add({
      name:
        typeof name === "string" && name.trim()
          ? name.trim()
          : "Anonymous",
      text: text.trim(),
      image: imageData,
      ts: FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      success: true,
      id: doc.id,
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
