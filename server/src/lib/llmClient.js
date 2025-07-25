// server/src/lib/llmClient.js
import { logger } from '../utils/logger.js'; // Assuming logger is available

/**
 * Attempts to clean and parse a JSON string, handling potential truncation or malformed structures.
 * Also converts objects with numeric keys (e.g., {"0": {}, "1": {}}) to an array.
 * @param {string} rawText The raw string to parse.
 * @returns {Array|Object|null} The parsed JSON or null if parsing fails.
 */
/**
 * Cleans and parses JSON from a raw LLM response, removing Markdown formatting if needed.
 */
function cleanAndParseJson(rawText) {
  try {
    // If wrapped in Markdown code block (``` or ```json), strip it
    let cleanedText = rawText
      .replace(/^```(?:json)?/i, '') // opening ``` or ```json
      .replace(/```$/, '')           // closing ```
      .trim();

    // Find the actual start and end of the JSON structure (array or object)
    let startIndex = -1;
    let endIndex = -1;

    // Try to find array start/end
    const arrayStart = cleanedText.indexOf('[');
    const arrayEnd = cleanedText.lastIndexOf(']');
    
    // Try to find object start/end
    const objectStart = cleanedText.indexOf('{');
    const objectEnd = cleanedText.lastIndexOf('}');

    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        startIndex = arrayStart;
        endIndex = arrayEnd;
    } else if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
        startIndex = objectStart;
        endIndex = objectEnd;
    }

    if (startIndex !== -1 && endIndex !== -1) {
        cleanedText = cleanedText.substring(startIndex, endIndex + 1);
        logger.info(`[LLMClient] Successfully extracted JSON substring.`);
    } else {
        // If no clear JSON structure found after markdown stripping, log and throw
        logger.error(`[LLMClient] No clear JSON array or object structure found after markdown stripping. Raw text: ${rawText}`);
        throw new Error('No clear JSON array or object structure found in LLM response.');
    }

    // Try direct parse of the extracted content
    return JSON.parse(cleanedText);
  } catch (parseError) {
    logger.error(`[LLMClient] Final JSON parsing failed: ${parseError.message}. Raw text attempted to parse: ${rawText}`);
    throw new Error(`Failed to parse LLM response into JSON: ${parseError.message}`); // Re-throw if all attempts fail
  }
}

/**
 * Calls the specified LLM provider (Ollama or Gemini) with a given prompt and configuration.
 *
 * @param {string} prompt - The text prompt for the LLM.
 * @param {object} config - LLM configuration.
 * @param {string} config.provider - 'ollama' or 'gemini'.
 * @param {string} config.model - The specific model name (e.g., 'llama3', 'gemini-2.0-flash').
 * @param {number} [config.temperature=0.7] - Controls randomness.
 * @param {number} [config.maxTokens=768] - Maximum number of tokens to generate.
 * @param {number} [config.timeout=120000] - Timeout for the LLM request in milliseconds (default: 2 minutes).
 * @returns {Promise<any>} The parsed JSON response from the LLM.
 * @throws {Error} If the API call fails or the response cannot be parsed.
 */
export async function callLLM(prompt, config = {}) { // Added default empty object for config
    const { provider, model, temperature = 0.7, maxTokens = 768, timeout = 120000 } = config; 

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout); // Set timeout

    try {
        if (provider === 'ollama') {
            const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
            logger.info(`[LLMClient] Calling Ollama model: ${model} at ${ollamaUrl} with timeout: ${timeout}ms`);

            const ollamaPayload = {
                model: model,
                prompt: prompt,
                stream: false, // We want the full response at once
                options: {
                    temperature: temperature,
                    num_predict: maxTokens // Using the updated maxTokens
                }
            };

            const ollamaFetchResponse = await fetch(ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ollamaPayload),
                signal: controller.signal // Attach the abort signal
            });

            if (!ollamaFetchResponse.ok) {
                const errorText = await ollamaFetchResponse.text();
                logger.error(`[LLMClient] Ollama API Error (${ollamaFetchResponse.status}): ${errorText}`);
                throw new Error(`Ollama API error: ${ollamaFetchResponse.statusText}. Response: ${errorText}`);
            }

            const llmResponse = await ollamaFetchResponse.json();
            console.log('[LLMClient] RAW Ollama Response (direct console.log):', llmResponse);
            logger.info(`[LLMClient] Ollama Raw Response:`, JSON.stringify(llmResponse, null, 2));

            const rawText = typeof llmResponse?.response === 'string' ? llmResponse.response.trim() : '';

            if (!rawText) {
                throw new Error('Ollama returned empty response or response field is missing/empty.');
            }

            return cleanAndParseJson(rawText);

        } else if (provider === 'gemini') {
            const geminiModel = model || 'gemini-2.0-flash';
            logger.info(`[LLMClient] Calling Gemini model: ${geminiModel} with timeout: ${timeout}ms`);

            const chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "type": { "type": "STRING" },
                                "title": { "type": "STRING" },
                                "description": { "type": "STRING" },
                                "recommendation": { "type": "STRING" },
                                "rationale": { "type": "STRING" },
                                "urgency": { "type": "STRING" },
                                "category": { "type": "STRING" }
                            }
                        }
                    },
                    temperature: temperature,
                    maxOutputTokens: maxTokens // Using the updated maxTokens
                }
            };

            const apiKey = ""; // Canvas will provide this at runtime
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

            const geminiFetchResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal // Attach the abort signal
            });

            if (!geminiFetchResponse.ok) {
                const errorText = await geminiFetchResponse.text();
                logger.error(`[LLMClient] Gemini API Error (${geminiFetchResponse.status}): ${errorText}`);
                throw new Error(`Gemini API error: ${geminiFetchResponse.statusText}. Response: ${errorText}`);
            }

            const llmResponse = await geminiFetchResponse.json();
            console.log('[LLMClient] RAW Gemini Response (direct console.log):', llmResponse);
            logger.info(`[LLMClient] Gemini Raw Response:`, JSON.stringify(llmResponse, null, 2));

            if (llmResponse.candidates && llmResponse.candidates.length > 0 &&
                llmResponse.candidates[0].content && llmResponse.candidates[0].content.parts &&
                llmResponse.candidates[0].content.parts.length > 0) {
                const jsonString = llmResponse.candidates[0].content.parts[0].text;
                return JSON.parse(jsonString);
            } else {
                throw new Error('Gemini response had no candidates or content.');
            }
        } else {
            throw new Error(`Unsupported AI provider: ${provider}.`);
        }
    } catch (error) { // <--- CATCH BLOCK FOR callLLM
        if (error.name === 'AbortError') {
            logger.error(`[LLMClient] LLM call timed out after ${timeout}ms for prompt: "${prompt.substring(0, 50)}..."`);
            throw new Error(`LLM request timed out after ${timeout / 1000} seconds.`);
        }
        logger.error(`[LLMClient] Error during LLM call for prompt: "${prompt.substring(0, 50)}..."`, error);
        throw error; // Re-throw the error so the calling agent/route can handle it specifically.
    } finally {
        clearTimeout(id); // Clear the timeout in any case
    }
}