require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

const fetch = require("node-fetch");
const MongoStore = require("connect-mongo");
const app = express();
app.set("trust proxy", 1);

//////////////////////////////////////////////////////////////
// Middlewares
//////////////////////////////////////////////////////////////

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://shivamgairola2577.github.io"
  ],
  credentials: true
}));

app.use(express.json());

app.use(session({
  name: "ecommerce.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,

  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI
  }),

  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60
  }
}));



app.use(passport.initialize());
app.use(passport.session());

//////////////////////////////////////////////////////////////
// MongoDB Connection
//////////////////////////////////////////////////////////////

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

//////////////////////////////////////////////////////////////
// User Schema
//////////////////////////////////////////////////////////////

const userSchema = new mongoose.Schema({
  fullName: String,
  address: String,
  dob: String,
  username: String,
  email: { type: String, unique: true },
  password: String
});

const User = mongoose.model("User", userSchema);

//////////////////////////////////////////////////////////////
// Order Schema
//////////////////////////////////////////////////////////////

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  items: [
    {
      productId: Number,
      title: String,
      price: Number,
      image: String,
      quantity: Number
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Order = mongoose.model("Order", orderSchema);

//////////////////////////////////////////////////////////////
// Cart Schema
//////////////////////////////////////////////////////////////

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  items: [
    {
      productId: Number,
      title: String,
      price: Number,
      image: String,
      quantity: Number
    }
  ]
});

const Cart = mongoose.model("Cart", cartSchema);


//////////////////////////////////////////////////////////////
// Signup
//////////////////////////////////////////////////////////////

app.post("/signup", async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: req.body.email });

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = new User(req.body);
    await user.save();

    res.json({ message: "User Registered Successfully" });

  } catch (error) {
    res.status(500).json({ message: "Error Saving User" });
  }
});

//////////////////////////////////////////////////////////////
// Login
//////////////////////////////////////////////////////////////

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.password !== password) {
      return res.status(400).json({ message: "Invalid password" });
    }

    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      return res.json({ message: "Login successful", user });
    });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

//////////////////////////////////////////////////////////////
// Current User
//////////////////////////////////////////////////////////////

app.get("/current-user", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ loggedIn: true, user: req.user });
  } else {
    res.json({ loggedIn: false });
  }
});

//////////////////////////////////////////////////////////////
// Logout (FIXED PROPERLY)
//////////////////////////////////////////////////////////////

app.get("/logout", (req, res) => {

  req.logout(function (err) {
    if (err) {
      return res.status(500).json({ message: "Logout error" });
    }

    req.session.destroy(() => {

      res.clearCookie("ecommerce.sid", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none"
      });

      res.json({ message: "Logged out successfully" });
    });

  });

});

//////////////////////////////////////////////////////////////
// Save Order
//////////////////////////////////////////////////////////////

app.post("/save-order", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {

    const newOrder = new Order({
      userId: req.user._id,
      items: req.body.items
    });

    await newOrder.save();

    res.json({ message: "Order saved successfully" });

  } catch (error) {
    res.status(500).json({ message: "Error saving order" });
  }
});

//////////////////////////////////////////////////////////////
// Add To Cart
//////////////////////////////////////////////////////////////
app.post("/add-to-cart", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {

    let cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      cart = new Cart({
        userId: req.user._id,
        items: []
      });
    }

    const productId = Number(req.body.productId);

    const itemIndex = cart.items.findIndex(
      item => item.productId === productId
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += 1;
    } else {
      cart.items.push({
        ...req.body,
        productId: productId
      });
    }

    await cart.save();

    res.json({ message: "Added to cart" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error adding to cart" });
  }
});

//////////////////////////////////////////////////////////////
// Order History
//////////////////////////////////////////////////////////////

app.get("/order-history", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {

    const orders = await Order
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.json(orders);

  } catch (error) {
    res.status(500).json({ message: "Error fetching history" });
  }
});

//////////////////////////////////////////////////////////////
// Search Products (From DummyJSON API)
//////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////
// Search Products (From DummyJSON API)
//////////////////////////////////////////////////////////////
app.get("/search", async (req, res) => {
  try {
    let query = req.query.query || "";
    query = query.trim().toLowerCase();

    if (!query) {
      return res.json([]);
    }

    let response;

    // 🔥 If user searches category name → use category API
    if (query === "tops") {
      response = await fetch(
        `https://dummyjson.com/products/category/tops?limit=100`
      );
    } else {
      response = await fetch(
        `https://dummyjson.com/products/search?q=${encodeURIComponent(query)}&limit=100`
      );
    }

    const data = await response.json();

    res.json(data.products || []);

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Search error" });
  }
});


//////////////////////////////////////////////////////////////
// Remove Item From Order History
//////////////////////////////////////////////////////////////

app.post("/remove-history-item", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {

    const { orderId, productId } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      userId: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 🔥 Convert productId to Number (IMPORTANT FIX)
    const numericProductId = Number(productId);

    order.items = order.items.filter(
      item => item.productId !== numericProductId
    );

    await order.save();

    res.json({ message: "Item removed from history" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error removing item" });
  }
});

//////////////////////////////////////////////////////////////
// Get Cart
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Get Cart
//////////////////////////////////////////////////////////////

app.get("/get-cart", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json([]);
  }

  try {

    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      return res.json([]);
    }

    res.json(cart.items);

  } catch (error) {
    console.log(error);
    res.status(500).json([]);
  }
});

//////////////////////////////////////////////////////////////
// Remove From Cart
//////////////////////////////////////////////////////////////

app.post("/remove-from-cart", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {

    const cart = await Cart.findOne({ userId: req.user._id });

    if (!cart) {
      return res.json([]);
    }

  cart.items = cart.items.filter(
  item => item.productId !== Number(req.body.productId)
);

    await cart.save();

    res.json({ message: "Removed from cart" });

  } catch (error) {
    res.status(500).json({ message: "Error removing item" });
  }
});

//////////////////////////////////////////////////////////////
// Clear Cart
//////////////////////////////////////////////////////////////

app.post("/clear-cart", async (req, res) => {

  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not logged in" });
  }

  try {

    await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { items: [] }
    );

    res.json({ message: "Cart cleared" });

  } catch (error) {
    res.status(500).json({ message: "Error clearing cart" });
  }
});

//////////////////////////////////////////////////////////////
// Google OAuth Strategy
//////////////////////////////////////////////////////////////
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
},

  async (accessToken, refreshToken, profile, done) => {
    try {

      let user = await User.findOne({
        email: profile.emails[0].value
      });

      if (!user) {
        user = await User.create({
          fullName: profile.displayName,
          address: "Google User",
          dob: "N/A",
          username: profile.displayName,
          email: profile.emails[0].value,
          password: "google-oauth"
        });
      }

      return done(null, user);

    } catch (error) {
      return done(error, null);
    }
  }
));

//////////////////////////////////////////////////////////////
// Passport Session
//////////////////////////////////////////////////////////////

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

//////////////////////////////////////////////////////////////
// Google Routes
//////////////////////////////////////////////////////////////

app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"   // forces account selection every time
  })
);

app.get("/auth/google/callback",
  passport.authenticate("google", {
  failureRedirect: "https://shivamgairola2577.github.io/ecomerceshivagairola1/login"
  }),
  (req, res) => {
  res.redirect("https://shivamgairola2577.github.io/ecomerceshivagairola1/");
  }
);

//////////////////////////////////////////////////////////////


const PORT = process.env.PORT || 5000;


app.get("/", (req, res) => {
  res.send("Backend running on Render");
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});