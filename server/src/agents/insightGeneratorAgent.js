// server/src/agents/insightGeneratorAgent.js
import { logger } from '../utils/logger.js';

/**
 * Insight Generator Agent: Extracts patterns, trends, and summaries from structured business data using LLM.
 * Designed to be data-agnostic, interpreting the structure of the provided data.
 */
export async function generateBusinessInsights(llmClient, data, llmConfig = {}) {
    logger.info('[InsightGeneratorAgent] Generating insights based on dynamic analytics data...');

    const {
        totalCompletedTasks,
        totalRecordsProcessed,
        totalErrorsFound,
        errorDistribution,
        allWorkflowOutputs, // Array of { workflowName, taskType, output: { headers, rows } }
        allWorkflowMetrics  // Array of { workflowName, taskType, metrics }
    } = data;

    // --- Start of Recommended Changes ---

    let dataSummary = ``; // Initialize empty, we will build this dynamically for business data.

    // Prioritize processed business data over operational metrics for insight generation
    if (allWorkflowOutputs && allWorkflowOutputs.length > 0) {
        dataSummary += `## Processed Business Data for Analysis:\n\n`;
        allWorkflowOutputs.forEach((item, index) => {
            if (item.output && item.output.headers && item.output.rows) {
                dataSummary += `--- Workflow Output #${index + 1} (${item.workflowName} - ${item.taskType}) ---\n`;
                dataSummary += `**Headers:** ${item.output.headers.join(', ')}\n`;
                dataSummary += `**Sample Rows (first 5):**\n`;

                // Format rows into a simple CSV-like string for LLM readability
                const sampleRows = item.output.rows.slice(0, 5).map(row => row.join(', ')).join('\n');
                dataSummary += `${sampleRows}\n\n`;

                // You might also consider providing aggregated summaries here if the raw data is too large,
                // but for now, we'll provide samples and let the LLM infer.
                // dataSummary += `Total records: ${item.output.rows.length}\n\n`;
            } else {
                dataSummary += `--- Workflow Output #${index + 1} (${item.workflowName} - ${item.taskType}) ---\n`;
                dataSummary += `Output available, but no structured 'headers' or 'rows' found for direct analysis.\n`;
                // If there's other useful info in item.output (e.g., a report summary), include it here
                if (typeof item.output === 'object' && item.output !== null) {
                    dataSummary += `Full Output (JSON stringified): ${JSON.stringify(item.output).substring(0, 500)}...\n\n`; // Truncate for brevity
                } else {
                    dataSummary += `Output: ${String(item.output).substring(0, 500)}...\n\n`;
                }
            }
        });
        dataSummary += `\n`;
    }

    // You can still include operational metrics, but make their role clear.
    dataSummary += `## Overall Operational Metrics:\n`;
    dataSummary += `- Total Workflows Completed: ${totalCompletedTasks}\n`;
    dataSummary += `- Total Records Processed: ${totalRecordsProcessed}\n`;
    dataSummary += `- Total Errors Found: ${totalErrorsFound}\n`;

    if (errorDistribution && errorDistribution.length > 0) {
        dataSummary += `\nError Distribution by Category:\n`;
        dataSummary += `${errorDistribution.map(err => `- ${err.name}: ${err.value.toFixed(1)}% of total errors`).join('\n')}\n`;
    }

    const fullPrompt = `You are an AI Business Data Analyst. Your goal is to generate actionable, comprehensive, and meaningful business insights by analyzing the provided raw and processed business data.
    
    **Instructions:**
    1.  **Focus on Business Value:** Prioritize insights that directly impact business performance (e.g., sales, revenue, customer behavior, product performance, market trends). Operational metrics (like 'total records processed' or 'error counts') are secondary; only mention them if they directly lead to a business insight (e.g., "high error rates in data cleaning for marketing data suggest poor data quality impacting campaign analysis").
    2.  **Handle Diverse Data:** The input data may come from different Excel files, meaning varying column headers (e.g., 'Item', 'Product', 'Sales_Date', 'Date', 'Quantity', 'Units_Sold', 'Total_Revenue', 'Revenue', 'Region', 'Customer_ID'). Identify common business entities and metrics (e.g., Product Name, Transaction Date, Revenue, Units Sold, Customer, Region) even if column names differ. Infer relationships if possible.
    3.  **Identify Key Insights:** Look for:
        * **Trends:** Growth, decline, seasonality over time.
        * **Anomalies:** Unexpected spikes or drops in data.
        * **Comparisons:** Performance across products, regions, customer segments.
        * **Correlations:** Relationships between different data points.
        * **Summaries:** Key aggregated figures (e.g., total revenue, average order value).
    4.  **Actionability:** Insights should suggest potential areas for business action or further investigation.
    5.  **Output Format:** Provide insights as a JSON array of objects. Each object must have the following structure:
        * \`type\`: (string) A short, descriptive type for the insight (e.g., "sales_trend", "product_performance", "anomaly_detection", "customer_segmentation", "operational_efficiency", "financial_overview", "market_analysis").
        * \`title\`: (string) A concise title for the insight.
        * \`description\`: (string) A detailed explanation of the insight, including relevant data points, trends, or observations.
        * \`data\`: (object, optional) A JSON object containing key data points or aggregations that support the insight (e.g., \`{ product: "Product X", revenue_decline: "15%", period: "last month" }\`).

    **Example Desired Output (JSON array):**
    \`\`\`json
    [
      {
        "type": "sales_trend",
        "title": "Monthly Revenue Growth Analysis",
        "description": "Analysis of sales data reveals a consistent 12% month-over-month revenue growth for Q2, driven primarily by strong performance in Product Category A. However, Product Category B shows a stagnation, indicating a potential market saturation or competitive pressure.",
        "data": {
          "q2_growth": "12%",
          "top_category": "Product Category A",
          "stagnant_category": "Product Category B"
        }
      },
      {
        "type": "product_performance",
        "title": "Top 5 Performing Products by Revenue",
        "description": "The top 5 products by revenue for the last quarter are X, Y, Z, A, and B, collectively accounting for 60% of total revenue. Product X has seen a 20% increase in sales volume compared to the previous quarter due to recent marketing campaigns.",
        "data": {
          "top_products": ["Product X", "Product Y", "Product Z", "Product A", "Product B"],
          "product_x_growth": "20%"
        }
      },
      {
        "type": "anomaly_detection",
        "title": "Unusual Spike in Returns for Region South",
        "description": "Customer return data for the past week shows an unexpected 150% spike in returns originating from the 'South' region, predominantly for electronic goods. This anomaly requires immediate investigation into potential quality control issues or delivery damages in that region.",
        "data": {
          "region": "South",
          "return_spike_percent": "150%",
          "product_category": "electronic goods"
        }
      }
    ]
    \`\`\`

    **Here is the business data and operational metrics for your analysis:**
    ${dataSummary}

    Your entire response must be the JSON array, with no additional text or markdown outside the JSON block.
    `;

    logger.info(`[InsightGeneratorAgent] Sending dynamic prompt to LLM. Preview: ${fullPrompt.slice(0, 500)}...`);

    try {
        const insights = await llmClient(fullPrompt, llmConfig);

        const validate = i =>
            typeof i === 'object' &&
            typeof i.title === 'string' &&
            typeof i.description === 'string' &&
            typeof i.type === 'string';

        let resultArray = [];

        if (Array.isArray(insights)) {
            resultArray = insights;
        } else if (typeof insights === 'object' && insights !== null) {
            resultArray = Object.values(insights);
        }

        const valid = resultArray.filter(validate);

        if (valid.length > 0) {
            logger.info('[InsightGeneratorAgent] Generated Insights:', valid);
            return valid;
        }

        logger.error('[InsightGeneratorAgent] LLM response did not match expected format or was empty:', insights);
        return [];
    } catch (error) {
        logger.error('[InsightGeneratorAgent] Error generating insights from LLM:', error);
        throw new Error(`Failed to generate insights: ${error.message}`);
    }
}