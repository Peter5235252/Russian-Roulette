import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const app = express();
app.use(express.json());
const PORT = 3000;

function cleanAndParseJson(text: string) {
  let cleaned = (text || "").trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
}

// Unified multi-provider AI runner
async function queryAiProvider(
  provider: string,
  apiKey: string,
  modelName: string,
  systemInstruction: string,
  prompt: string
) {
  const p = (provider || "gemini").toLowerCase();

  if (p === "gemini") {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("No Gemini API key provided. Enter one in Settings or environment.");
    const aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
    const model = modelName || "gemini-3.6-flash";
    const response = await aiClient.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING },
            itemIndex: { type: Type.INTEGER },
            target: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ["action", "itemIndex", "target", "reasoning"]
        }
      }
    });
    return cleanAndParseJson(response.text || "{}");
  }

  if (p === "chatgpt" || p === "openai") {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No OpenAI API key provided.");
    const model = modelName || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: systemInstruction + " Output strictly valid JSON with keys: action ('USE_ITEM'|'SHOOT'), itemIndex (integer, -1 if SHOOT), target ('player'|'dealer'), reasoning (string)." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI error (${response.status}): ${errText}`);
    }
    const data: any = await response.json();
    return cleanAndParseJson(data.choices?.[0]?.message?.content || "{}");
  }

  if (p === "grok" || p === "xai") {
    const key = apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) throw new Error("No xAI Grok API key provided.");
    const model = modelName || "grok-2-latest";
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: systemInstruction + " Output strictly valid JSON with keys: action ('USE_ITEM'|'SHOOT'), itemIndex (integer, -1 if SHOOT), target ('player'|'dealer'), reasoning (string)." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Grok error (${response.status}): ${errText}`);
    }
    const data: any = await response.json();
    return cleanAndParseJson(data.choices?.[0]?.message?.content || "{}");
  }

  if (p === "mistral") {
    const key = apiKey || process.env.MISTRAL_API_KEY;
    if (!key) throw new Error("No Mistral API key provided.");
    const model = modelName || "mistral-small-latest";
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: systemInstruction + " Output strictly valid JSON with keys: action ('USE_ITEM'|'SHOOT'), itemIndex (integer, -1 if SHOOT), target ('player'|'dealer'), reasoning (string)." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Mistral error (${response.status}): ${errText}`);
    }
    const data: any = await response.json();
    return cleanAndParseJson(data.choices?.[0]?.message?.content || "{}");
  }

  if (p === "claude" || p === "anthropic") {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("No Anthropic Claude API key provided.");
    const model = modelName || "claude-3-5-haiku-20241022";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: systemInstruction + " You MUST output strictly valid JSON only containing keys: action ('USE_ITEM'|'SHOOT'), itemIndex (integer, -1 if SHOOT), target ('player'|'dealer'), reasoning (string). Do not include markdown codeblocks or text outside JSON.",
        temperature: 0.2,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude error (${response.status}): ${errText}`);
    }
    const data: any = await response.json();
    const rawContent = data.content?.[0]?.text || "{}";
    return cleanAndParseJson(rawContent);
  }

  throw new Error(`Unsupported AI Provider: ${provider}`);
}

app.post("/api/test-ai-key", async (req, res) => {
  try {
    const { provider = "gemini", apiKey = "", model = "" } = req.body;
    const testSys = "You are an AI API connection tester.";
    const testPrompt = "Respond with JSON object {\"action\":\"SHOOT\",\"itemIndex\":-1,\"target\":\"player\",\"reasoning\":\"Test verified\"}";
    const result = await queryAiProvider(provider, apiKey, model, testSys, testPrompt);
    return res.json({ success: true, provider, result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Key test failed" });
  }
});

app.post("/api/ai-dealer", async (req, res) => {
  try {
    const {
      provider = 'gemini',
      apiKey = '',
      customModel = '',
      difficulty = 'NORMAL',
      dealer,
      player,
      liveCount = 0,
      blankCount = 0,
      retaliationActive = false,
      doubleDamageActive = null,
      dealerDamageReductionEnd = null,
      playerDamageReductionEnd = null,
      itemsUsedThisTurn = 0
    } = req.body;

    const totalCount = liveCount + blankCount;
    const liveProb = totalCount > 0 ? (liveCount / totalCount) : 0.5;

    let difficultyPersona = "";
    switch (difficulty) {
      case 'NORMAL':
        difficultyPersona = "You are an amateur, human-like Russian Roulette dealer playing on NORMAL difficulty. You MUST be fair, forgiving, and FRUGAL with items: do NOT dump your inventory or play like a grandmaster AI. Make occasional human flaws, use items very sparingly (maximum 0 or 1 item per turn), preserve items for future rounds, and do not ruthlessly target the player when live odds are low or uncertain.";
        break;
      case 'HARD':
        difficultyPersona = "You are a calculating Russian Roulette dealer. You calculate chamber odds carefully, use offensive or defensive items selectively, and conserve your inventory for multi-turn strategy rather than using every item immediately.";
        break;
      case 'VERY_HARD':
        difficultyPersona = "You are a cold, tactical mastermind. You calculate exact odds and execute precise item combos only when mathematically justified for maximum lethal value, saving items for decisive moments.";
        break;
      case 'NIGHTMARE':
        difficultyPersona = "You are an all-knowing cosmic horror entity. You play with terrifying strategic discipline. You calculate exact odds and execute high-value multi-item strikes, conserving resources whenever a direct shot is sufficient.";
        break;
      default:
        difficultyPersona = "You are an amateur Russian Roulette dealer playing on NORMAL difficulty. Be frugal with items, fair and forgiving, and avoid spamming items.";
    }

    const prompt = `
Context:
- Game Difficulty Level: ${difficulty}
- Dealer Health: ${dealer?.health ?? 100}/${dealer?.maxHealth ?? 100}
- Dealer Items: ${JSON.stringify((dealer?.items || []).map((item: string, idx: number) => ({ index: idx, type: item })))}
- Items Already Used By Dealer This Turn: ${itemsUsedThisTurn}
- Player Health: ${player?.health ?? 100}/${player?.maxHealth ?? 100}
- Player Items: ${JSON.stringify(player?.items || [])}
- Chambers remaining: ${liveCount} LIVE, ${blankCount} BLANK (Total: ${totalCount}, Live Probability: ${(liveProb * 100).toFixed(1)}%)
- Retaliation Active: ${retaliationActive ? 'YES (Dealer took damage recently)' : 'NO'}
- Double Damage Active: ${doubleDamageActive ? doubleDamageActive : 'NONE'}
- Dealer Damage Reduction Active: ${dealerDamageReductionEnd ? 'YES' : 'NO'}
- Player Damage Reduction Active: ${playerDamageReductionEnd ? 'YES' : 'NO'}

Item Reference & Tactical Usage:
- MIRROR: Secretly inspects current chamber. Best used before deciding whether to shoot player, shoot self, or apply SCALPEL.
- PLIERS: Ejects current round (-5 HP self-bleed). Use to rack past unwanted BLANK rounds or discard a LIVE round.
- WHISKEY: Restores +20 HP. Use only when wounded (< 80 HP) to stay out of lethal range.
- TOURNIQUET: Boosts max HP capacity by +1 HP.
- PENTAGRAM: SWAPS current HP between Dealer & Player! Best when Dealer is very low HP and Player is high HP.
- CANNABIS: Grants 20s damage reduction shield.
- SCALPEL: Activates DOUBLE DAMAGE (70 HP) for the next shot. Crucial combo item right before shooting player when live round is confirmed/probable.
- DEFIBRILLATOR: Restores +40 HP, but -10 max HP permanently. Use when critically low (< 40 HP).
- SYRINGE: Restores +50 HP instantly. Use when heavily wounded (< 50 HP).
- RAZORBLADE: Slashes flesh (-10 HP self-bleed): converts BLANK to LIVE, or grants DOUBLE DAMAGE if already LIVE.

CRITICAL ITEM SPARING & CONSERVATION DIRECTIVES:
- ITEMS ARE FINITE AND NON-RENEWABLE. DO NOT SPAM OR DRAIN YOUR INVENTORY IN A SINGLE TURN OR ROUND!
- SPARING RULE: You should usually use AT MOST 1 item per turn before pulling the trigger ("SHOOT").
- IF Items Already Used By Dealer This Turn >= 1: You MUST default to "action": "SHOOT" unless you just used MIRROR and are now immediately applying SCALPEL or PLIERS for a direct 2-item execution. NEVER use a 3rd item in a single turn.
- IF your health is high or chamber odds are clear, DO NOT use items just because you have them. Save them for emergency healing or lethal setups in future turns!
- On NORMAL difficulty: You MUST be extremely frugal. Do NOT use items on the first turn or early rounds unless wounded or using a simple inspection. In most turns, choose "SHOOT" immediately without using any items.

Decision Rules:
1. If you decide to use an item, return action "USE_ITEM" and the zero-based itemIndex from the Dealer Items list.
2. If you decide to shoot or have no urgent item to activate, return action "SHOOT" and set target to either "player" or "dealer".
3. Return valid JSON following the required schema.
`;

    const parsed = await queryAiProvider(provider, apiKey, customModel, difficultyPersona, prompt);
    return res.json(parsed);

  } catch (error: any) {
    console.error("AI dealer decision error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch AI decision" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
