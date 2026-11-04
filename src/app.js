import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import agentRoutes from "./routes/agent.routes.js";
import {
  startConditionScheduler,
  startWorkflowScheduler,
  stopConditionScheduler,
  stopWorkflowScheduler,
} from "./agentic_workflows/Scheduler/Scheduler.js";

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

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // every 5 min (SCHEDULER_INTERVAL_MINUTES): run every step of every active workflow
  startWorkflowScheduler();
  // every 1 min (SCHEDULER_CONDITION_CHECK_MINUTES): release due date & time conditions
  // and trigger the next step(s) stored on them
  startConditionScheduler();
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopConditionScheduler();
    stopWorkflowScheduler();
    server.close(() => process.exit(0));
  });
}
