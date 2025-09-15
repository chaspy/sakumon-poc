import OpenAI from "openai";

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です");
  return new OpenAI({ apiKey });
}

export const MODELS = {
  gen: process.env.LLM_MODEL || "gpt-4o-mini",
  embed: "text-embedding-3-small",
};

