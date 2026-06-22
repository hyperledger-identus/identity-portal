import cors from "cors";
import express from "express";
import { config } from "./config";
import { getAgent } from "./identus";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Exercises the full stack: Express -> Identus agent -> Pluto -> MongoDB.
app.post("/api/dids", async (_req, res) => {
  try {
    const agent = await getAgent();
    const did = await agent.createPrismDID("portal-did", []);
    res.json({ did: did.toString() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(config.PORT, () => {
  console.log(`Portal API listening on http://localhost:${config.PORT}`);
});
