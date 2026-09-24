export type AIDirectorEvent =
  | "combo_hunt"
  | "speed_round"
  | "fruit_frenzy"
  | "precision"
  | "recovery"
  | "bonus_time";

export type AIDirectorSnapshot = {
  level: number;
  score: number;
  moves: number;
  combo: number;
  bestCombo: number;
  timeLeft: number;
  totalCleared: number;
  specialsCreated: number;
  movesMade: number;
  recentClears: number;
  reason: "level_start" | "performance_change" | "timer_pressure";
};

export type AIDirectorDecision = {
  event: AIDirectorEvent;
  message: string;
  duration: number;
  multiplier: number;
  target?: number;
  source: "ai" | "fallback";
  model?: string;
};

type FreeModel = {
  id: string;
  name?: string;
  freePeers: number;
};

const EVENTS: AIDirectorEvent[] = [
  "combo_hunt",
  "speed_round",
  "fruit_frenzy",
  "precision",
  "recovery",
  "bonus_time",
];

const FALLBACKS: Record<AIDirectorEvent, Omit<AIDirectorDecision, "source">> = {
  combo_hunt: {
    event: "combo_hunt",
    message: "BUILD A COMBO",
    duration: 12,
    multiplier: 1.35,
    target: 3,
  },
  speed_round: {
    event: "speed_round",
    message: "SPEED ROUND",
    duration: 10,
    multiplier: 1.3,
    target: 0,
  },
  fruit_frenzy: {
    event: "fruit_frenzy",
    message: "FRUIT FRENZY",
    duration: 12,
    multiplier: 1.25,
    target: 0,
  },
  precision: {
    event: "precision",
    message: "PRECISION BONUS",
    duration: 12,
    multiplier: 1.45,
    target: 4,
  },
  recovery: {
    event: "recovery",
    message: "RECOVERY BOOST",
    duration: 10,
    multiplier: 1.2,
    target: 0,
  },
  bonus_time: {
    event: "bonus_time",
    message: "TIME BONUS",
    duration: 10,
    multiplier: 1.2,
    target: 8,
  },
};

export class AIDirector {
  private freeModels: FreeModel[] | null = null;
  private selectedModel: string | null = null;
  private lastRequestAt = 0;
  private readonly cooldownMs = 14000;

  async decide(snapshot: AIDirectorSnapshot): Promise<AIDirectorDecision | null> {
    const now = Date.now();
    if (now - this.lastRequestAt < this.cooldownMs) {
      return null;
    }

    this.lastRequestAt = now;

    try {
      const model = await this.getFreeModel();
      if (!model) {
        return this.localFallback(snapshot);
      }

      const response = await this.requestModel(model.id, snapshot);
      const decision = this.parseDecision(response, model.id);
      if (decision) return decision;
    } catch {
      // The game must remain playable when Antseed is unavailable.
    }

    return this.localFallback(snapshot);
  }

  private async getFreeModel(): Promise<FreeModel | null> {
    if (!this.freeModels) {
      const response = await fetch("/antseed/v1/models?type=text", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Antseed models HTTP ${response.status}`);
      }

      const payload = await response.json() as {
        data?: Array<{
          id?: string;
          name?: string;
          peers?: Array<{
            inputUsdPerMillion?: number;
            outputUsdPerMillion?: number;
          }>;
        }>;
      };

      this.freeModels = (payload.data ?? [])
        .map((model) => {
          const freePeers = (model.peers ?? []).filter(
            (peer) =>
              peer.inputUsdPerMillion === 0 &&
              peer.outputUsdPerMillion === 0
          ).length;

          return {
            id: model.id ?? "",
            name: model.name,
            freePeers,
          };
        })
        .filter((model) => model.id && model.freePeers > 0)
        .sort((a, b) => b.freePeers - a.freePeers);
    }

    if (!this.freeModels.length) return null;

    if (this.selectedModel && this.freeModels.some((m) => m.id === this.selectedModel)) {
      return this.freeModels.find((m) => m.id === this.selectedModel) ?? null;
    }

    this.selectedModel = this.freeModels[0].id;
    return this.freeModels[0];
  }

  private async requestModel(
    model: string,
    snapshot: AIDirectorSnapshot
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    const system = [
      "You are the gameplay AI Director for MAZE HUNTER.",
      "You choose one controlled gameplay event from the allowed list.",
      "Do not invent event names.",
      "Do not output code.",
      "Do not output markdown.",
      "Return valid JSON only.",
      'Schema: {"event":"combo_hunt|speed_round|fruit_frenzy|precision|recovery|bonus_time","message":"SHORT UPPERCASE MESSAGE","duration":8,"multiplier":1.2,"target":0}',
      "duration must be 8 to 15 seconds.",
      "multiplier must be 1.0 to 1.6.",
      "target is an integer from 0 to 6.",
      "Use recovery when the player is struggling, precision/combo_hunt when performance is strong, and speed_round or bonus_time when time pressure matters.",
    ].join(" ");

    const user = JSON.stringify(snapshot);

    try {
      const response = await fetch("/antseed/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 120,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Antseed chat HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private parseDecision(payload: unknown, model: string): AIDirectorDecision | null {
    const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
    const raw = choices?.[0]?.message?.content;

    if (typeof raw !== "string") return null;

    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Partial<AIDirectorDecision>;

      if (!parsed.event || !EVENTS.includes(parsed.event)) return null;

      const fallback = FALLBACKS[parsed.event];
      const duration = clampNumber(parsed.duration, 8, 15, fallback.duration);
      const multiplier = clampNumber(parsed.multiplier, 1, 1.6, fallback.multiplier);
      const target = clampNumber(parsed.target, 0, 6, fallback.target ?? 0);

      const message =
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim().slice(0, 28).toUpperCase()
          : fallback.message;

      return {
        event: parsed.event,
        message,
        duration,
        multiplier,
        target: Math.round(target),
        source: "ai",
        model,
      };
    } catch {
      return null;
    }
  }

  private localFallback(snapshot: AIDirectorSnapshot): AIDirectorDecision {
    let event: AIDirectorEvent;

    if (snapshot.timeLeft <= 25) {
      event = "bonus_time";
    } else if (snapshot.combo >= 4 || snapshot.bestCombo >= 5) {
      event = "precision";
    } else if (snapshot.moves <= 8 || snapshot.recentClears <= 4) {
      event = "recovery";
    } else if (snapshot.movesMade > 0 && snapshot.movesMade % 3 === 0) {
      event = "speed_round";
    } else {
      event = "combo_hunt";
    }

    return {
      ...FALLBACKS[event],
      source: "fallback",
    };
  }
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}
