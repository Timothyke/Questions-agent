import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getWeather } from "./tools";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const model = new ChatGoogleGenerativeAI({
  model: "gemini-flash-latest",
  apiKey: process.env.GOOGLE_API_KEY,
});

const agent = createReactAgent({
  llm: model,
  tools: [getWeather],
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const result = await agent.invoke({
      messages: [{ role: "user", content: message }],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    res.json({ reply: lastMessage.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Agent server running at http://localhost:${PORT}`);
});