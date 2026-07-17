import OpenAI from "openai";
import { config } from "../config.js";

export const llm = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
  timeout: 60_000,
  maxRetries: 1,
});
