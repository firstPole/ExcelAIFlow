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
    const markdownStripped = rawText
      .replace(/^```(?:json)?/i, '') // opening ``` or ```json
      .replace(/```$/, '')           // closing ```
      .trim();

    // Try direct parse
    return JSON.parse(markdownStripped);
  } catch (_) {
    // Fallback: Try extracting array
    const match = rawText.match(/\[.*\]/s);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (err2) {
        logger.error(`[LLMClient] Failed to parse extracted JSON array: ${err2.message}`);
        throw new Error(`Failed to parse extracted JSON array: ${err2.message}`);
      }
    }

    // Fallback: Try extracting object
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (err3) {
        logger.error(`[LLMClient] Failed to parse extracted JSON object: ${err3.message}`);
        throw new Error(`Failed to parse extracted JSON object: ${err3.message}`);
      }
    }

    throw new Error('No valid JSON array or object found in LLM response.');
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
 * @param {number} [config.maxTokens=1024] - Maximum number of tokens to generate.
 * @returns {Promise<any>} The parsed JSON response from the LLM.
 * @throws {Error} If the API call fails or the response cannot be parsed.
 */
export async function callLLM(prompt, config) {
    const { provider, model, temperature = 0.7, maxTokens = 1024 } = config;

    if (provider === 'ollama') {
        const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434/api/generate';
        logger.info(`[LLMClient] Calling Ollama model: ${model} at ${ollamaUrl}`);

        const ollamaPayload = {
            model: model,
            prompt: prompt,
            stream: false, // We want the full response at once
            options: {
                temperature: temperature,
                num_predict: maxTokens
            }
        };

        const ollamaFetchResponse = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ollamaPayload)
        });

        if (!ollamaFetchResponse.ok) {
            const errorText = await ollamaFetchResponse.text();
            logger.error(`[LLMClient] Ollama API Error (${ollamaFetchResponse.status}): ${errorText}`);
            throw new Error(`Ollama API error: ${ollamaFetchResponse.statusText}. Response: ${errorText}`);
        }

        const llmResponse = await ollamaFetchResponse.json();
        // Add a direct console.log here to see the raw Ollama response
        console.log('[LLMClient] RAW Ollama Response (direct console.log):', llmResponse);
        logger.info(`[LLMClient] Ollama Raw Response:`, JSON.stringify(llmResponse, null, 2));


        const rawText = typeof llmResponse?.response === 'string' ? llmResponse.response.trim() : '';

        if (!rawText) {
            throw new Error('Ollama returned empty response or response field is missing/empty.');
        }

        return cleanAndParseJson(rawText);

    } else if (provider === 'gemini') {
        const geminiModel = model || 'gemini-2.0-flash';
        logger.info(`[LLMClient] Calling Gemini model: ${geminiModel}`);

        const chatHistory = [];
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        const payload = {
            contents: chatHistory,
            generationConfig: {
                responseMimeType: "application/json", // Request JSON directly
                responseSchema: { // Provide a generic schema for array of objects (can be refined per agent)
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            // These properties will be filled by the LLM based on prompt.
                            // This generic schema allows for various object structures.
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
                maxOutputTokens: maxTokens
            }
        };

        const apiKey = ""; // Canvas will provide this at runtime
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

        const geminiFetchResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiFetchResponse.ok) {
            const errorText = await geminiFetchResponse.text();
            logger.error(`[LLMClient] Gemini API Error (${geminiFetchResponse.status}): ${errorText}`);
            throw new Error(`Gemini API error: ${geminiFetchResponse.statusText}. Response: ${errorText}`);
        }

        const llmResponse = await geminiFetchResponse.json();
        // Add a direct console.log here to see the raw Gemini response
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
}
