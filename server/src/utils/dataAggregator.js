// server/src/utils/dataAggregator.js
import { logger } from './logger.js';
import { getDb } from '../database/init.js'; // Assuming getDb is accessible here

/**
 * Extracts and aggregates business data from workflow results for LLM analysis.
 * This function assumes 'report' or 'analyze_data' outputs contain relevant business metrics.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} period - The time period (e.g., '7days', '30days').
 * @returns {Promise<object>} An object containing aggregated business data (e.g., productSales, regionSales, weeklySalesTrends).
 */
export async function getAggregatedBusinessData(userId, period) {
    const db = getDb();
    let dateFilter = 'datetime(\'now\', \'-30 days\')'; // Default to 30 days

    if (period === '7days') {
        dateFilter = 'datetime(\'now\', \'-7 days\')';
    } else if (period === '6months') {
        dateFilter = 'datetime(\'now\', \'-6 months\')';
    } else if (period === '12months') {
        dateFilter = 'datetime(\'now\', \'-12 months\')';
    }

    logger.info(`[DataAggregator] Fetching workflow results for user ${userId} within period: ${period}`);

    // Fetch all relevant workflow results that might contain business data
    const results = await db.all(`
        SELECT output, completed_at
        FROM workflow_results wr
        JOIN workflows w ON wr.workflow_id = w.id
        WHERE w.user_id = ? AND wr.completed_at >= ${dateFilter}
        AND wr.status = 'completed'
        AND (wr.output LIKE '%"reportGenerated":true%' OR wr.output LIKE '%"analyzed":true%')
        ORDER BY wr.completed_at ASC
    `, [userId]);

    const productSales = {}; // { productName: { totalRevenue: X, totalUnitsSold: Y } }
    const regionSales = {};  // { regionName: { totalRevenue: X, totalUnitsSold: Y } }
    const weeklySales = {};  // { 'YYYY-MM-DD': totalSalesForThatWeek }

    results.forEach(result => {
        try {
            const output = JSON.parse(result.output || '{}');
            const completedDate = new Date(result.completed_at);
            const weekStart = new Date(completedDate.setDate(completedDate.getDate() - completedDate.getDay())).toISOString().split('T')[0]; // Sunday as week start

            // Aggregate for weekly sales trends
            if (output.metadata && typeof output.metadata.totalRevenue === 'number') {
                weeklySales[weekStart] = (weeklySales[weekStart] || 0) + output.metadata.totalRevenue;
            }

            // Aggregate for product/region performance from report outputs
            if (output.reportGenerated && Array.isArray(output.charts)) {
                output.charts.forEach(chart => {
                    if (chart.title === 'Revenue by Product' && Array.isArray(chart.data)) {
                        chart.data.forEach(item => {
                            if (item.label && typeof item.value === 'number') {
                                productSales[item.label] = productSales[item.label] || { totalRevenue: 0, totalUnitsSold: 0 };
                                productSales[item.label].totalRevenue += item.value;
                                // Assuming units sold is not directly in this chart, might need deeper parsing or another chart
                            }
                        });
                    }
                    // Add logic for 'Sales Distribution by Region' if such a chart exists
                    // Example: if (chart.title === 'Sales Distribution by Region' && Array.isArray(chart.data)) { ... }
                });
            }

            // Aggregate from raw rows if available (e.g., from merged/cleaned data that was analyzed)
            if (Array.isArray(output.rows) && Array.isArray(output.headers)) {
                const headers = output.headers;
                const revenueColIndex = headers.indexOf('Revenue_Amount'); // Standardized header
                const productColIndex = headers.indexOf('Product_Name'); // Standardized header
                const regionColIndex = headers.indexOf('Region'); // Standardized header
                const unitsColIndex = headers.indexOf('Units_Count'); // Standardized header

                output.rows.forEach(row => {
                    const revenue = revenueColIndex !== -1 && typeof row[revenueColIndex] === 'number' ? row[revenueColIndex] : 0;
                    const productName = productColIndex !== -1 ? String(row[productColIndex]) : 'Unknown Product';
                    const regionName = regionColIndex !== -1 ? String(row[regionColIndex]) : 'Unknown Region';
                    const unitsSold = unitsColIndex !== -1 && typeof row[unitsColIndex] === 'number' ? row[unitsColIndex] : 0;

                    if (productName !== 'Unknown Product') {
                        productSales[productName] = productSales[productName] || { totalRevenue: 0, totalUnitsSold: 0 };
                        productSales[productName].totalRevenue += revenue;
                        productSales[productName].totalUnitsSold += unitsSold;
                    }
                    if (regionName !== 'Unknown Region') {
                        regionSales[regionName] = regionSales[regionName] || { totalRevenue: 0, totalUnitsSold: 0 };
                        regionSales[regionName].totalRevenue += revenue;
                        regionSales[regionName].totalUnitsSold += unitsSold;
                    }
                });
            }

        } catch (parseError) {
            logger.warn(`[DataAggregator] Failed to parse workflow result output for aggregation:`, parseError);
        }
    });

    // Convert aggregated objects to arrays and sort for LLM input
    const finalProductSales = Object.entries(productSales)
        .map(([productName, data]) => ({ productName, ...data }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue); // Sort by revenue descending

    const finalRegionSales = Object.entries(regionSales)
        .map(([regionName, data]) => ({ regionName, ...data }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue); // Sort by revenue descending

    // Calculate Week-over-week trends
    const sortedWeeklySalesPeriods = Object.keys(weeklySales).sort();
    const finalWeeklySalesTrends = [];
    for (let i = 1; i < sortedWeeklySalesPeriods.length; i++) {
        const currentPeriod = sortedWeeklySalesPeriods[i];
        const prevPeriod = sortedWeeklySalesPeriods[i - 1];
        finalWeeklySalesTrends.push({
            period: currentPeriod,
            sales: weeklySales[currentPeriod],
            prevSales: weeklySales[prevPeriod] || 0 // Handle first period having no prev
        });
    }


    logger.info(`[DataAggregator] Aggregated Business Data:`, {
        productSales: finalProductSales.slice(0, 5), // Log top 5 for brevity
        regionSales: finalRegionSales.slice(0, 5),
        weeklySalesTrends: finalWeeklySalesTrends.slice(-5) // Log last 5 for brevity
    });

    return {
        productSales: finalProductSales,
        regionSales: finalRegionSales,
        weeklySalesTrends: finalWeeklySalesTrends
    };
}
