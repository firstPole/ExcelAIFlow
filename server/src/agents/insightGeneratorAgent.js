// server/src/agents/insightGeneratorAgent.js
import { logger } from '../utils/logger.js';

/**
 * Interface for the LLM client function.
 * @callback LlmClient
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {object} config - LLM configuration (temperature, maxTokens, etc.).
 * @returns {Promise<any>} The parsed response from the LLM.
 */

/**
 * @typedef {object} ProductSalesData
 * @property {string} productName
 * @property {number} totalRevenue
 * @property {number} totalUnitsSold
 */

/**
 * @typedef {object} RegionSalesData
 * @property {string} regionName
 * @property {number} totalRevenue
 * @property {number} totalUnitsSold
 * @property {number} prevPeriodRevenue // For week-over-week comparison
 */

/**
 * @typedef {object} ErrorAnomalyData
 * @property {string} errorCategory
 * @property {number} count
 * @property {number} percentage
 * @property {string} period
 */

/**
 * @typedef {object} InsightOutput
 * @property {string} type - 'product_performance' | 'region_performance' | 'sales_trend' | 'error_anomaly'
 * @property {string} title
 * @property {string} description
 * @property {object} [data] - Optional structured data supporting the insight
 */

/**
 * Insight Generator Agent: Extracts patterns, trends, and summaries from structured business data.
 * It uses the LLM to interpret and summarize the data into actionable insights.
 *
 * @param {LlmClient} llmClient - A function to call the LLM (e.g., Ollama or Gemini).
 * @param {object} data - Structured, pre-aggregated data for analysis.
 * @param {ProductSalesData[]} [data.productSales] - Aggregated product sales data.
 * @param {RegionSalesData[]} [data.regionSales] - Aggregated region sales data.
 * @param {Array<{period: string, sales: number, prevSales: number}>} [data.weeklySalesTrends] - Weekly sales trends.
 * @param {ErrorAnomalyData[]} [data.errorDistribution] - Distribution of errors by category.
 * @param {object} llmConfig - LLM configuration (model, temperature, maxTokens, provider).
 * @returns {Promise<InsightOutput[]>} An array of generated insights.
 */
export async function generateBusinessInsights(llmClient, data, llmConfig) {
    const { productSales, regionSales, weeklySalesTrends, errorDistribution } = data;
    const { model, temperature, maxTokens, provider } = llmConfig;

    let promptParts = [];

    // Prompt for Product Performance
    if (productSales && productSales.length > 0) {
        promptParts.push(`Product Sales Data (Top 5 by Revenue):
${productSales.slice(0, 5).map(p => `- ${p.productName}: Revenue $${p.totalRevenue.toFixed(2)}, Units ${p.totalUnitsSold}`).join('\n')}
Identify the top 2 performing products and the bottom 2 performing products by revenue. Explain why they are performing well/poorly based on the data.
`);
    }

    // Prompt for Region Performance
    if (regionSales && regionSales.length > 0) {
        promptParts.push(`Regional Sales Data (Last Period):
${regionSales.map(r => `- ${r.regionName}: Revenue $${r.totalRevenue.toFixed(2)}, Units ${r.totalUnitsSold}`).join('\n')}
Identify any regions with unusually high or low performance.
`);
    }

    // Prompt for Sales Trends (Week-over-week)
    if (weeklySalesTrends && weeklySalesTrends.length > 0) {
        promptParts.push(`Weekly Sales Trends (Revenue):
${weeklySalesTrends.map(t => `- Period ${t.period}: Current Sales $${t.sales.toFixed(2)}, Previous Sales $${t.prevSales.toFixed(2)} (${(((t.sales - t.prevSales) / t.prevSales) * 100).toFixed(1)}% change)`).join('\n')}
Analyze the week-over-week sales trends. Highlight any significant increases or decreases (e.g., >10% change) and identify which periods experienced them.
`);
    }

    // Prompt for Error Anomalies (from existing analytics)
    if (errorDistribution && errorDistribution.length > 0) {
        promptParts.push(`Error Distribution by Category (last 30 days):
${errorDistribution.map(e => `- ${e.name}: ${e.value.toFixed(1)}% of total errors`).join('\n')}
Identify any dominant error categories or anomalies (e.g., categories with significantly higher percentages than others).
`);
    }

    if (promptParts.length === 0) {
        logger.warn('[InsightGeneratorAgent] No relevant data provided to generate insights.');
        return [];
    }

    const fullPrompt = `Based on the following aggregated business and operational data, generate a concise JSON array of distinct insights. Each insight should have a "type" (e.g., "product_performance", "region_performance", "sales_trend", "error_anomaly"), a "title" (short summary), and a "description" (detailed explanation). Focus on actionable business intelligence.

${promptParts.join('\n\n')}

Respond ONLY with the JSON array, no explanation or surrounding text.
Example JSON structure:
[
  { "type": "product_performance", "title": "Top Product: Product A Dominates Sales", "description": "Product A generated $X revenue, significantly outperforming others due to high unit sales." },
  { "type": "sales_trend", "title": "Significant WoWs Sales Drop in Last Week", "description": "Overall sales dropped by 15% week-over-week, from $Y to $Z, indicating a potential market shift or issue." }
]`;

    logger.info(`[InsightGeneratorAgent] Sending prompt to LLM: ${fullPrompt.substring(0, Math.min(fullPrompt.length, 500))}...`);

    try {
        const insights = await llmClient(fullPrompt, llmConfig);
        // Explicitly ensure the result is an array
        if (Array.isArray(insights) && insights.every(i => typeof i.title === 'string' && typeof i.description === 'string' && typeof i.type === 'string')) {
            logger.info(`[InsightGeneratorAgent] Generated Insights:`, insights);
            return insights;
        } else if (typeof insights === 'object' && insights !== null && !Array.isArray(insights)) {
            // If LLM returns an object with numeric keys (e.g., {0: {}, 1: {}}), convert it to an array
            const insightsArray = Object.values(insights);
            if (insightsArray.every(i => typeof i.title === 'string' && typeof i.description === 'string' && typeof i.type === 'string')) {
                logger.warn(`[InsightGeneratorAgent] LLM returned object with numeric keys, converted to array:`, insightsArray);
                return insightsArray;
            }
        }
        logger.error(`[InsightGeneratorAgent] LLM response was not a valid array of insight objects:`, insights);
        return [];
    } catch (error) {
        logger.error(`[InsightGeneratorAgent] Error generating insights with LLM:`, error);
        return [];
    }
}
