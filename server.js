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

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Text is required",
      });
    }

    const doc = await db.collection("posts").add({
      name: name || "Anonymous",
      text,
      image: image || null,
      ts: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      id: doc.id,
      message: "Post created successfully",
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
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