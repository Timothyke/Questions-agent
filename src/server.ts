import "dotenv/config";
import express from "express";
import cors from "cors";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createClient } from "@supabase/supabase-js";
import { getWeather } from "./tools";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const model = new ChatGoogleGenerativeAI({
  model: "gemini-flash-latest",
  apiKey: process.env.GOOGLE_API_KEY,
});

const agent = createReactAgent({
  llm: model,
  tools: [getWeather],
});

app.get("/history", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Not logged in." });
    }
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return res.status(401).json({ error: "Invalid session, please log in again." });
    }
    const userId = userData.user.id;

    const { data: history, error } = await supabase
      .from("conversations")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json({ history: history || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't load history." });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Not logged in." });
    }
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return res.status(401).json({ error: "Invalid session, please log in again." });
    }
    const userId = userData.user.id;

    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Load this user's past conversation for context
    const { data: history } = await supabase
      .from("conversations")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    const pastMessages = (history || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const result = await agent.invoke({
      messages: [...pastMessages, { role: "user", content: message }],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const replyText =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    // Save both sides of this exchange
    await supabase.from("conversations").insert([
      { user_id: userId, role: "user", content: message },
      { user_id: userId, role: "assistant", content: replyText },
    ]);

    res.json({ reply: replyText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent server running at http://localhost:${PORT}`);
});