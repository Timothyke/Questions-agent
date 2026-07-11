import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getWeather = tool(
  async ({ city }: { city: string }) => {
    const fakeData: Record<string, string> = {
      nairobi: "24°C, partly cloudy",
      london: "15°C, rainy",
      "new york": "22°C, clear",
    };
    return fakeData[city.toLowerCase()] ?? `No data for ${city}, assume 20°C and sunny.`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    schema: z.object({
      city: z.string().describe("The city to check weather for"),
    }),
  }
);