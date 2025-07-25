// server/src/utils/dataAggregator.js
import { logger } from './logger.js';
import { getDb } from '../database/init.js';

/**
 * Extracts and aggregates general business data and operational metrics from workflow results for LLM analysis.
 * This function is designed to be data-agnostic, passing raw outputs and metrics for LLM interpretation.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} period - The time period (e.g., '7days', '30days', '6months', '12months').
 * @returns {Promise<object>} An object containing aggregated operational metrics and raw workflow outputs/metrics,
 * plus structured data for analytics charts.
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

    const results = await db.all(`
        SELECT
            wr.output,
            wr.metrics,
            wr.task_id,      -- Select task_id to match with parsed tasks
            wr.completed_at, -- Needed for processing trends
            w.name as workflowName,
            w.tasks as workflowTasks -- Select the tasks JSON string from workflows table
        FROM
            workflow_results wr
        JOIN
            workflows w ON wr.workflow_id = w.id
        WHERE
            w.user_id = ? AND wr.completed_at >= ${dateFilter}
        ORDER BY wr.completed_at ASC
    `, [userId]);

    let totalCompletedTasks = 0;
    let totalRecordsProcessed = 0;
    let totalErrorsFound = 0;
    const errorTypeCounts = {};
    const allWorkflowOutputs = []; // To store all relevant outputs for LLM
    const allWorkflowMetrics = []; // To store all relevant metrics for LLM

    // Data structures for charts
    const processingTrendsMap = new Map(); // date -> { completed: N, failed: M }
    const salesTrendsMap = new Map();       // date -> { revenue: N, units_sold: M }
    const productPerformanceMap = new Map(); // productName -> { revenue: N, units_sold: M }
    const regionPerformanceMap = new Map();  // regionName -> { revenue: N, units_sold: M }


    for (const row of results) {
        let taskType = 'unknown';
        // Extract taskType from workflowTasks JSON
        try {
            const parsedWorkflowTasks = JSON.parse(row.workflowTasks || '[]');
            const currentTask = parsedWorkflowTasks.find(task => task.id === row.task_id);
            if (currentTask) {
                taskType = currentTask.type; // Assuming task object has a 'type' property
            }
        } catch (e) {
            logger.warn(`[DataAggregator] Failed to parse workflowTasks for workflow ${row.workflowName}:`, e);
        }

        // Aggregate operational metrics
        if (taskType === 'clean' || taskType === 'merge' || taskType === 'analyze' || taskType === 'report' || taskType === 'validate') {
            totalCompletedTasks++; // Count any relevant task as "completed" for trends (can refine later)

            // Processing Trends
            const completionDate = row.completed_at ? new Date(row.completed_at).toISOString().split('T')[0] : 'Unknown Date';
            const trendEntry = processingTrendsMap.get(completionDate) || { date: completionDate, completed: 0, failed: 0 };
            if (row.status === 'completed') { // Assuming row.status is available from DB (it is in workflow_results)
                trendEntry.completed++;
            } else if (row.status === 'failed') {
                trendEntry.failed++;
            }
            processingTrendsMap.set(completionDate, trendEntry);

            try {
                const metrics = JSON.parse(row.metrics || '{}');
                if (metrics.recordsProcessed) {
                    totalRecordsProcessed += metrics.recordsProcessed;
                }
                if (metrics.errorsFound && Array.isArray(metrics.errorsFound)) {
                    totalErrorsFound += metrics.errorsFound.length;
                    metrics.errorsFound.forEach(error => {
                        let errorCategory = 'Other';
                        if (typeof error === 'string') {
                            const lowerError = error.toLowerCase();
                            if (lowerError.includes('missing') || lowerError.includes('null')) {
                                errorCategory = 'Missing Data';
                            } else if (lowerError.includes('duplicate')) {
                                errorCategory = 'Duplicates';
                            } else if (lowerError.includes('format') || lowerError.includes('date')) {
                                errorCategory = 'Formatting Issues';
                            } else if (lowerError.includes('outlier') || lowerError.includes('range')) {
                                errorCategory = 'Outliers/Range';
                            } else if (lowerError.includes('schema') || lowerError.includes('header')) {
                                errorCategory = 'Schema Inconsistency';
                            } else if (lowerError.includes('invalid') || lowerError.includes('violation')) {
                                errorCategory = 'Validation Errors';
                            }
                        } else if (error.type) { // If error object has a 'type'
                            errorCategory = error.type;
                        }
                        errorTypeCounts[errorCategory] = (errorTypeCounts[errorCategory] || 0) + 1;
                    });
                }
            } catch (e) {
                logger.warn('[DataAggregator] Failed to parse metrics:', e);
            }
        }

        // Collect relevant outputs and metrics for the LLM to analyze
        if (row.output) {
            try {
                const parsedOutput = JSON.parse(row.output);
                // If the output contains 'headers' and 'rows', pass them explicitly
                if (parsedOutput.headers && Array.isArray(parsedOutput.headers) && parsedOutput.rows && Array.isArray(parsedOutput.rows)) {
                    allWorkflowOutputs.push({
                        workflowName: row.workflowName,
                        taskType: taskType, // Use the dynamically extracted taskType
                        output: {
                            headers: parsedOutput.headers,
                            rows: parsedOutput.rows
                        }
                    });

                    // --- Extract data for Sales, Product, and Region Performance charts ---
                    const revenueColIndex = parsedOutput.headers.indexOf('Revenue_Amount');
                    const unitsSoldColIndex = parsedOutput.headers.indexOf('Units_Count');
                    const productNameColIndex = parsedOutput.headers.indexOf('Product_Name');
                    const regionColIndex = parsedOutput.headers.indexOf('Region');
                    const transactionDateColIndex = parsedOutput.headers.indexOf('Transaction_Date');

                    parsedOutput.rows.forEach(dataRow => {
                        const revenue = revenueColIndex !== -1 ? parseFloat(dataRow[revenueColIndex]) : 0;
                        const unitsSold = unitsSoldColIndex !== -1 ? parseFloat(dataRow[unitsSoldColIndex]) : 0;
                        const productName = productNameColIndex !== -1 ? String(dataRow[productNameColIndex]) : 'Unknown Product';
                        const region = regionColIndex !== -1 ? String(dataRow[regionColIndex]) : 'Unknown Region';
                        const transactionDate = transactionDateColIndex !== -1 ? new Date(dataRow[transactionDateColIndex]).toISOString().split('T')[0] : completionDate; // Fallback to task completion date

                        // Sales Trends
                        if (!isNaN(revenue) && !isNaN(unitsSold)) {
                            const trendEntry = salesTrendsMap.get(transactionDate) || { date: transactionDate, revenue: 0, units_sold: 0 };
                            trendEntry.revenue += revenue;
                            trendEntry.units_sold += unitsSold;
                            salesTrendsMap.set(transactionDate, trendEntry);
                        }

                        // Product Performance
                        if (!isNaN(revenue) && productName !== 'Unknown Product') {
                            const productEntry = productPerformanceMap.get(productName) || { name: productName, revenue: 0, units_sold: 0 };
                            productEntry.revenue += revenue;
                            productEntry.units_sold += unitsSold;
                            productPerformanceMap.set(productName, productEntry);
                        }

                        // Region Performance
                        if (!isNaN(revenue) && region !== 'Unknown Region') {
                            const regionEntry = regionPerformanceMap.get(region) || { region: region, revenue: 0, units_sold: 0 };
                            regionEntry.revenue += revenue;
                            regionEntry.units_sold += unitsSold;
                            regionPerformanceMap.set(region, regionEntry);
                        }
                    });

                } else {
                    // Otherwise, pass the full parsedOutput as is, allowing LLM to interpret
                    allWorkflowOutputs.push({
                        workflowName: row.workflowName,
                        taskType: taskType, // Use the dynamically extracted taskType
                        output: parsedOutput
                    });
                }
            } catch (e) {
                logger.warn('[DataAggregator] Failed to parse workflow result output:', e);
            }
        }

        if (row.metrics) {
            try {
                const parsedMetrics = JSON.parse(row.metrics);
                allWorkflowMetrics.push({
                    workflowName: row.workflowName,
                    taskType: taskType, // Use the dynamically extracted taskType
                    metrics: parsedMetrics
                });
            } catch (e) {
                logger.warn('[DataAggregator] Failed to parse workflow result metrics:', e);
            }
        }
    }

    const errorDistribution = Object.entries(errorTypeCounts).map(([label, count]) => ({
        name: label,
        value: totalErrorsFound > 0 ? (count / totalErrorsFound) * 100 : 0
    }));

    // Convert Maps to arrays and sort them for consistent chart display
    const processingTrendsData = Array.from(processingTrendsMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const salesTrendsData = Array.from(salesTrendsMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const productPerformanceData = Array.from(productPerformanceMap.values()).sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending
    const regionPerformanceData = Array.from(regionPerformanceMap.values()).sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending


    const aggregatedData = {
        totalCompletedTasks,
        totalRecordsProcessed,
        totalErrorsFound,
        errorDistribution,
        allWorkflowOutputs,
        allWorkflowMetrics,
        // Structured data specifically for frontend charts
        analyticsChartsData: {
            processingTrends: processingTrendsData,
            dataQualityDistribution: errorDistribution, // Re-use already calculated errorDistribution
            salesTrends: salesTrendsData,
            productPerformance: productPerformanceData,
            regionPerformance: regionPerformanceData,
        }
    };

    logger.info(`[DataAggregator] Aggregated Data for LLM and Charts:`, aggregatedData);

    return aggregatedData;
}
