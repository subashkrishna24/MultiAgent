import express from "express";

import {
  executeWorkflow
} from "../orchestrator/workflow.orchestrator.js";

const router = express.Router();

router.post(
  "/completions",
  async (req, res) => {

    try {

      const result =
        await executeWorkflow(req.body);

      return res.json(result);

    } catch (error) {

      console.error(error);

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

export default router;