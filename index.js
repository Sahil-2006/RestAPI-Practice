const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");
const { body, validationResult } = require("express-validator");
const { trace } = require("console");
require("dotenv").config();
const app = express();
const PORT = 8080;
app.use(express.json());
app.use(cors());
const cache = new NodeCache({ stdTTl: 600 });
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URL;
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {
    console.error("MongoDB connection error");
    process.exit(1);
  }
};
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Task = mongoose.model("Task", taskSchema);
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);
const validateTask = [
  body("title").isString().notEmpty().trim().isLength({ min: 3 }),
  body("completed").isBoolean(),
];
const auth = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", " ");
  if (!token) return res.status(401).json({ error: "Access Denied" });
  try {
    const decode = jwt.verify(token, "secret-key");
    req.user = decode;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid Token" });
  }
};
app.post(
  "/signup",
  [
    body("username").isString().notEmpty().trim().isLength({ min: 3, max: 30 }),
    body("password").isString().notEmpty().isLength({ min: 6 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      const { username, password } = req.body;
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }
      const user = new User({
        username,
        password,
      });
      await user.save();
      const token = jwt.sign({ id: user._id }, "secret-key", {
        expiresIn: "1h",
      });
      res.status(201).json({
        message: "User created successfully",
        token,
        user: {
          id: user._id,
          username: user.username,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Failed to create User" });
    }
  }
);
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).json({ error: "Invalid Credentials" });
  }
  const token = jwt.sign({ id: user._id }, "secret-key", { expiresIn: "1h" });
  res.json({ token });
});
app.get("/tasks", async (req, res) => {
  const cacheKey = `all_tasks_${req.user.id}`;
  const cacheTasks = cache.get(cacheKey);
  if (cacheTasks) return res.json(cacheTasks);
  const tasks = await Task.find({ userId: req.user.id });
  cache.set(cacheKey, tasks);
  res.json(tasks);
});
app.post("/tasks", validateTask, async (req, res) => {
  const error = validationResult(req);
  if (!error.isEmpty()) {
    return res.status(400).json({ error: error.array });
  }
  const task = new Task(req.body);
  await task.save();
  res.status(201).json(task);
});
app.get("/tasks/:id", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({
        error: "Task not found",
        message: "No task exists with the provided ID",
      });
    }
    res.json({
      message: "Task retrieved successfully",
      task,
    });
  } catch (error) {
    console.error("Error fetching task", error);
    res
      .status(500)
      .json({ error: "Failed to fetch task", details: error.message });
  }
});

app.put("/tasks/:id", async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});
app.delete("/tasks/:id", async (req, res) => {
  try {
    const tasks = await Task.findByIdAndDelete(req.params.id);
    if (!tasks) return res.status(404).json({ error: "Task not found" });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server is ruuning on port ${PORT}`);
      console.log(`POST/login-User login (get JWT token)`);
      console.log(`GET/tasks-Get all tasks (JWT required)`);
      console.log(`POST/tasks-Create new task (validation)`);
      console.log(`GET/tasks/:id-Get task by ID`);
      console.log(`PUT/tasks/:id-Update task (JWT required)`);
      console.log(`DELETE/tasks/:id-Delete task`);
      console.log(`GET/health-Health check`);
      console.log(`Authentication:`);
      console.log(`Use: Authorization: Bearer <token>`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};
module.exports = app;
if (require.main === module) {
  startServer();
}
