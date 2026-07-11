import "dotenv/config";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getWeather } from "./tools";

async function main() {
  const model = new ChatGoogleGenerativeAI({
     model: "gemini-flash-latest",
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const agent = createReactAgent({
    llm: model,
    tools: [getWeather],
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "What's the capital city of egypt?" }],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  console.log("Agent:", lastMessage.content);
}

main();