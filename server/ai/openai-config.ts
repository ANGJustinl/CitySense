export function resolveOpenAiBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.OPENAI_BASE_URL?.trim() ||
    env.OPENAI_API_BASE?.trim() ||
    env.API_BASE?.trim() ||
    "https://api.openai.com/v1"
  );
}
