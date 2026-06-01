import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import agentRoutes from "./routes/agent.routes.js";

dotenv.config();

const app = express();
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.use(cors());

app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.use("/agent", agentRoutes);

const PORT = process.env.PORT || 1600;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
