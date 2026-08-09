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
      playerDamageReductionEnd = null
    } = req.body;

    const totalCount = liveCount + blankCount;
    const liveProb = totalCount > 0 ? (liveCount / totalCount) : 0.5;

    let difficultyPersona = "";
    switch (difficulty) {
      case 'NORMAL':
        difficultyPersona = "You are an amateur, human-like Russian Roulette dealer playing on NORMAL difficulty. You MUST be fair and forgiving: do NOT play like a grandmaster or optimal AI. Make occasional human flaws, miss opportunities to use complex item combinations, play casually, and do not ruthlessly target the player when live odds are low or uncertain. If live probability is <= 50%, err on the side of taking a chance on yourself or making a simple move.";
        break;
      case 'HARD':
        difficultyPersona = "You are a calculating and aggressive Russian Roulette dealer. You calculate chamber odds carefully, use offensive items when live odds favor you, and heal or defend when threatened.";
        break;
      case 'VERY_HARD':
        difficultyPersona = "You are a cold, highly lethal tactical mastermind. You calculate exact odds, execute item synergies (e.g. scalpel before shooting player when live chance is high, mirror/pliers to manipulate chambers, defib/syringe when health drops), and relentlessly pressure the player.";
        break;
      case 'NIGHTMARE':
        difficultyPersona = "You are an all-knowing cosmic horror entity. You play with terrifying mathematical precision and optimal decision theory. You ruthlessly combine items, double-damage scalpel strikes, damage mitigation, and chamber management to systematically execute the player without mercy.";
        break;
      default:
        difficultyPersona = "You are an amateur, human-like Russian Roulette dealer playing on NORMAL difficulty. Be fair and forgiving, make occasional flaws, and avoid hyper-aggressive plays.";
    }

    const prompt = `
Context:
- Game Difficulty Level: ${difficulty}
- Dealer Health: ${dealer?.health ?? 100}/${dealer?.maxHealth ?? 100}
- Dealer Items: ${JSON.stringify((dealer?.items || []).map((item: string, idx: number) => ({ index: idx, type: item })))}
- Player Health: ${player?.health ?? 100}/${player?.maxHealth ?? 100}
- Player Items: ${JSON.stringify(player?.items || [])}
- Chambers remaining: ${liveCount} LIVE, ${blankCount} BLANK (Total: ${totalCount}, Live Probability: ${(liveProb * 100).toFixed(1)}%)
- Retaliation Active: ${retaliationActive ? 'YES (Dealer took damage recently)' : 'NO'}
- Double Damage Active: ${doubleDamageActive ? doubleDamageActive : 'NONE'}
- Dealer Damage Reduction Active: ${dealerDamageReductionEnd ? 'YES' : 'NO'}
- Player Damage Reduction Active: ${playerDamageReductionEnd ? 'YES' : 'NO'}

Item reference & comprehensive strategy guide:
- MIRROR: Secretly inspects the current chamber without firing. Reveals whether the round currently in the barrel is LIVE or BLANK. Best used before deciding whether to shoot the player (if LIVE), shoot yourself to gain another turn (if BLANK), or apply SCALPEL.
- PLIERS: Ejects the current round from the cylinder without firing (costs 5 HP self-bleed). Use to rack past unwanted BLANK rounds or safely discard a LIVE round.
- WHISKEY: Restores +20 HP (up to max health). Use when damaged to stay out of lethal range.
- TOURNIQUET: Boosts maximum HP capacity by +1 HP. Good early-turn utility item.
- PENTAGRAM: SWAPS current HP values between Dealer and Player! Devastating when Dealer is low HP (e.g. 10-30 HP) and Player is high HP (e.g. 70-100 HP) — steals their health and gives them your low HP!
- CANNABIS: Activates a 20-second damage reduction shield that significantly mitigates incoming shot damage taken.
- SCALPEL: Activates DOUBLE DAMAGE for the next gun shot (70 HP damage instead of 35 HP!). Crucial combo item right before shooting the player when a live round is confirmed or highly probable.
- DEFIBRILLATOR: Delivers an emergency jolt restoring +40 HP, at the cost of permanently reducing Max HP by 10. Best when HP is critically low (< 40 HP).
- SYRINGE: High-potency medical injection restoring +50 HP instantly (up to max health).
- RAZORBLADE: Slashes flesh (-10 HP self-damage) for blood magic: if current chamber is BLANK, converts it into a LIVE round; if already LIVE, grants DOUBLE DAMAGE! Excellent for turning a safe blank into a deadly live attack against the player.

Difficulty Rules:
- NORMAL: Make fair, forgiving, human-like decisions. Do NOT execute hyper-lethal multi-item combos. If live probability is <= 50%, prefer shooting yourself or taking a non-lethal gamble to give the player a fair turn.
- HARD: Calculating & aggressive. Uses items wisely based on odds.
- VERY_HARD / NIGHTMARE: Cold, ruthless, mathematically optimal. Executes multi-item lethal combos without hesitation.

Core Shooting Logic:
- If you shoot yourself ('dealer') and the chamber is BLANK, you retain your turn and take another action immediately!
- If live probability is HIGH (e.g., > 50%), shooting the 'player' inflicts heavy damage. On NORMAL difficulty, require live probability > 60% before attacking player with full force.

Decision Rules:
1. If you decide to use an item, return action "USE_ITEM" and the zero-based itemIndex from the Dealer Items list.
2. If you decide to shoot or have no useful items to activate right now, return action "SHOOT" and set target to either "player" or "dealer".
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
