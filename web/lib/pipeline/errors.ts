/**
 * Pipeline error classification and plain-English mapping.
 *
 * All pipeline errors are classified into known categories so the UI
 * can display user-friendly messages instead of stack traces.
 */

const ERROR_MAP: Record<string, string> = {
  ANTHROPIC_RATE_LIMIT:
    "The AI service is temporarily busy. This usually resolves within a minute.",
  ANTHROPIC_AUTH:
    "There's a configuration issue with the AI service. Please contact your administrator.",
  ANTHROPIC_OVERLOADED:
    "The AI service is experiencing high demand. The pipeline will automatically retry.",
  GITHUB_FETCH_FAILED:
    "Could not fetch pipeline template from GitHub. Check your internet connection.",
  GITHUB_NOT_FOUND:
    "A pipeline template file was not found on GitHub. This may indicate a configuration issue.",
  SUPABASE_ERROR:
    "There was a problem saving pipeline progress. Please try again.",
  TIMEOUT:
    "This step took too long to complete. It will be retried automatically.",
  UNKNOWN:
    "Something unexpected went wrong. Click retry to try this step again.",
};

/**
 * Classify an error into a known category based on message content and error properties.
 */
export function classifyError(error: Error): string {
  const message = error.message || "";
  const code = (error as unknown as Record<string, unknown>).code as string | undefined;

  // Check explicit error codes first
  if (code && code in ERROR_MAP) {
    return code;
  }

  // Anthropic API errors
  if (message.includes("rate_limit_error") || message.includes("rate limit")) {
    return "ANTHROPIC_RATE_LIMIT";
  }
  if (
    message.includes("authentication_error") ||
    message.includes("invalid_api_key") ||
    message.includes("Invalid API key")
  ) {
    return "ANTHROPIC_AUTH";
  }
  if (
    message.includes("overloaded_error") ||
    message.includes("overloaded")
  ) {
    return "ANTHROPIC_OVERLOADED";
  }

  // Supabase / Postgres errors
  if (
    message.includes("PostgrestError") ||
    message.includes("PGRST") ||
    message.includes("relation") ||
    message.includes("supabase")
  ) {
    return "SUPABASE_ERROR";
  }

  // Timeout errors
  if (
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("ETIMEDOUT")
  ) {
    return "TIMEOUT";
  }

  return "UNKNOWN";
}

/**
 * Convert any error to a plain-English message suitable for end users.
 */
export function toPlainEnglish(error: Error): string {
  const code = classifyError(error);
  return ERROR_MAP[code] || ERROR_MAP["UNKNOWN"];
}
