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

console.log("SUPABASE_URL loaded:", !!process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY loaded:", !!process.env.SUPABASE_ANON_KEY);
console.log("GOOGLE_API_KEY loaded:", !!process.env.GOOGLE_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Service role client bypasses RLS - safe here because we manually
// verify the user's identity before using it, and this key never
// reaches the browser.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
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
  console.log("GET /history called");
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log("No auth header on /history");
      return res.status(401).json({ error: "Not logged in." });
    }
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      console.log("Auth error on /history:", userError);
      return res.status(401).json({ error: "Invalid session, please log in again." });
    }
    const userId = userData.user.id;
    console.log("Loading history for user:", userId);

    const { data: history, error } = await supabase
      .from("conversations")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("Supabase select error:", error);
      throw error;
    }

    console.log("History rows found:", history?.length ?? 0);
    res.json({ history: history || [] });
  } catch (err) {
    console.error("Caught error in /history:", err);
    res.status(500).json({ error: "Couldn't load history." });
  }
});

app.post("/chat", async (req, res) => {
  console.log("POST /chat called with body:", req.body);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log("No auth header on /chat");
      return res.status(401).json({ error: "Not logged in." });
    }
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      console.log("Auth error on /chat:", userError);
      return res.status(401).json({ error: "Invalid session, please log in again." });
    }
    const userId = userData.user.id;
    console.log("Chat request from user:", userId);

    const { message } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

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

    console.log("Saving to Supabase for user:", userId);
    const { error: insertError } = await supabaseAdmin.from("conversations").insert([
      { user_id: userId, role: "user", content: message },
      { user_id: userId, role: "assistant", content: replyText },
    ]);

    if (insertError) {
      console.log("Supabase insert error:", insertError);
    } else {
      console.log("Successfully saved conversation.");
    }

    res.json({ reply: replyText });
  } catch (err) {
    console.error("Caught error in /chat:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent server running at http://localhost:${PORT}`);
});
