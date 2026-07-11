import sys

def modify_file(filepath, replacements):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
        else:
            print(f"Warning: Could not find snippet in {filepath}")
            
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

# 1. Update src/types.ts
modify_file("src/types.ts", [
    (
        '''export type PredictionModel = "finpilot-v1" | "deepseek-r1" | "llama-3-sent" | "mistral-macro" | "claude-3-opus" | "gpt-4-quant" | "whale-tracker" | "retail-fomo";''',
        '''export type PredictionModel = "finpilot-v1" | "deepseek-r1" | "llama-3-sent" | "mistral-macro" | "claude-3-opus" | "gpt-4-quant" | "whale-tracker" | "retail-fomo" | "groq-llama-3";'''
    )
])

# 2. Update src/components/AIInsightsView.tsx
modify_file("src/components/AIInsightsView.tsx", [
    (
        '''                    <option value="retail-fomo">🎢 Retail FOMO Indicator</option>''',
        '''                    <option value="retail-fomo">🎢 Retail FOMO Indicator</option>
                    <option value="groq-llama-3">⚡ Groq Llama 3 Fast</option>'''
    )
])

# 3. Update server.ts
modify_file("server.ts", [
    # Update AiCallOptions
    (
        '''type AiCallOptions = {
  task?: AiTask;
  temperature?: number;
  maxTokens?: number;
  cacheTtlMs?: number;
  timeoutMs?: number;
};''',
        '''type AiCallOptions = {
  task?: AiTask;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cacheTtlMs?: number;
  timeoutMs?: number;
};'''
    ),
    # Update callNvidiaChat
    (
        '''async function callNvidiaChat<T>(
  messages: AiMessage[],
  fallback: T,
  options: AiCallOptions = {}
): Promise<T> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    return fallback;
  }

  const task = options.task || "chat";
  const model = getAiModelForTask(task);''',
        '''async function callNvidiaChat<T>(
  messages: AiMessage[],
  fallback: T,
  options: AiCallOptions = {}
): Promise<T> {
  const task = options.task || "chat";
  let model = options.model || getAiModelForTask(task);
  
  let key = process.env.NVIDIA_API_KEY;
  let baseUrl = getNvidiaBaseUrl();
  
  if (model.startsWith("groq-")) {
    key = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1";
    model = "llama3-70b-8192";
  }

  if (!key) {
    return fallback;
  }'''
    ),
    # Update fetchJson in callNvidiaChat
    (
        '''    const response = await fetchJson<any>(`${getNvidiaBaseUrl()}/chat/completions`, {''',
        '''    const response = await fetchJson<any>(`${baseUrl}/chat/completions`, {'''
    ),
    # Update callNvidiaText
    (
        '''async function callNvidiaText(
  messages: AiMessage[],
  fallback: string,
  options: AiCallOptions = {}
): Promise<string> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return fallback;

  const task = options.task || "chat";
  const model = getAiModelForTask(task);''',
        '''async function callNvidiaText(
  messages: AiMessage[],
  fallback: string,
  options: AiCallOptions = {}
): Promise<string> {
  const task = options.task || "chat";
  let model = options.model || getAiModelForTask(task);
  
  let key = process.env.NVIDIA_API_KEY;
  let baseUrl = getNvidiaBaseUrl();
  
  if (model.startsWith("groq-")) {
    key = process.env.GROQ_API_KEY;
    baseUrl = "https://api.groq.com/openai/v1";
    model = "llama3-70b-8192";
  }

  if (!key) return fallback;'''
    ),
    # Update buildAiPrediction to pass model
    (
        '''      ],
      deterministicNarrative,
      { task: "prediction", maxTokens: 360, temperature: 0.18 }
    );''',
        '''      ],
      deterministicNarrative,
      { task: "prediction", model, maxTokens: 360, temperature: 0.18 }
    );'''
    ),
    # Update .env
    (
        '''NVIDIA_API_KEY=''',
        '''NVIDIA_API_KEY=\nGROQ_API_KEY='''
    )
])

# 4. Update .env (since .env might just have NVIDIA_API_KEY somewhere, if not we append)
with open(".env", "a", encoding="utf-8") as f:
    f.write("\\nGROQ_API_KEY=\\n")

print("Patch applied to all files")
