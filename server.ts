import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini API client with appropriate headers
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will fallback to elegant mock data.");
    }
    ai = new GoogleGenAI({
      apiKey: key || "MOCK_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return ai;
}

// 1. API Endpoint: Technical & Market Analysis Chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      // Fallback response for mock-up mode when API key is missing
      return setTimeout(() => {
        res.json({
          text: `**Technical Review for AAPL**\n\nStock is currently consolidating around key support levels with positive RSI indications. In light mode, our advanced sentiment registers robust inflows.`,
          summary: "Consolidation phase with standard 50-day EMA support.",
          technicalView: "RSI sits at 58 (Neutral/Bullish) with active volume.",
          riskFactors: "Macroeconomic pressure from bond yields might affect high valuation multiples."
        });
      }, 500);
    }

    const client = getGeminiClient();
    
    // We want a structured JSON response to fill the beautiful panels of Screen 2:
    // "AI Analysis: TICKER", "SUMMARY", "TECHNICAL VIEW", "RISK FACTORS"
    const systemInstruction = 
      "You are FinPilot AI, an elite financial intelligence and technical/fundamental market analysis advisor. " +
      "Analyze the user's question. If the user asks about an asset, portfolio, or market event, generate a highly structured analysis. " +
      "Provide your output exactly matching the following JSON schema with structured answers, including technical summary, view indicators, and risk factors.";

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: message,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "The main text analysis response (e.g. 'Current price action shows a consolidation phase...'). Follow with standard friendly, professional feedback."
            },
            summary: {
              type: Type.STRING,
              description: "A short 1-2 sentence technical summary (e.g. 'Stock is trading above the 50-day EMA. Immediate resistance found at $195.80...')"
            },
            technicalView: {
              type: Type.STRING,
              description: "A technical evaluation indicator summary (e.g. 'RSI sits at 58 (Neutral/Bullish). MACD histogram shows decreasing bearish momentum.')"
            },
            riskFactors: {
              type: Type.STRING,
              description: "1-2 potential risk factors for the asset or scenario (e.g. 'Macroeconomic pressure from bond yields may weigh on tech multiples.')"
            }
          },
          required: ["text", "summary", "technicalView", "riskFactors"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// 2. API Endpoint: Smart Portfolio Review
app.post("/api/portfolio-review", async (req, res) => {
  try {
    const { holdings } = req.body; // Array of { asset, name, qty, avgCost, currentPrice }
    
    const key = process.env.GEMINI_API_KEY;
    if (!key || !holdings || holdings.length === 0) {
      // Fallback mock portfolio reviews matching Screen 1's "AI Portfolio Review" panel
      return res.json({
        concentrationText: "Your portfolio is currently 64% concentrated in Technology. FinPilot AI recommends increasing exposure to Consumer Staples or Energy to reduce volatility.",
        optimizationIdea: "Consider rebalancing $45k from TSLA into a diversified index fund to mitigate specific sector risk."
      });
    }

    const client = getGeminiClient();
    const portfolioString = holdings.map((h: any) => `${h.name} (${h.asset}): Qty ${h.qty}, Avg Cost $${h.avgCost}, Current Price $${h.currentPrice}`).join("; ");

    const systemInstruction = 
      "You are FinPilot AI portfolio optimizer. Analyze the provided user portfolio and suggest rebalancing advice " +
      "specifically calling out direct percentage concentration, sectors, and clear optimization strategies in JSON format. " +
      "Be professional and direct, focusing on smart risk mitigation.";

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Analyze this portfolio: ${portfolioString}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concentrationText: {
              type: Type.STRING,
              description: "Advice outlining the main concentration of their assets and a recommended sector diversification strategy (e.g., 'Your portfolio is currently heavily weighted in...')."
            },
            optimizationIdea: {
              type: Type.STRING,
              description: "A specific actionable rebalancing or mitigation strategy (e.g., 'Consider rebalancing ... from ... to mitigate market risks.')."
            }
          },
          required: ["concentrationText", "optimizationIdea"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Gemini Portfolio Review Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze portfolio" });
  }
});

// 3. API Endpoint: Ticker/News Summarizer
app.post("/api/summarize-news", async (req, res) => {
  try {
    const { title, source, symbol } = req.body;
    const key = process.env.GEMINI_API_KEY;
    
    if (!key) {
      return res.json({
        summary: `FinPilot AI Summary: The latest reports suggest continuous structural tailwinds for ${symbol || "this asset"}. Financial metrics remain stable, aligned with key volume indicators.`
      });
    }

    const client = getGeminiClient();
    const prompt = `Summarize and provide institutional investor context for this news article: "${title}" by ${source || "analysts"} concerning ${symbol || "the asset"}. Keep the response under 60 words.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an institutional financial analyst. Provide a swift, dense summary and technical implications of news headlines."
      }
    });

    res.json({ summary: response.text || "No summary available." });
  } catch (error: any) {
    console.error("Gemini Summarize Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite Middleware for development mode
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all SPA routes in Express v4
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinPilot AI Server listening at http://localhost:${PORT}`);
  });
}

startServer();
