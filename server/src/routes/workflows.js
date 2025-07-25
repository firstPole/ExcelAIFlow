// server/src/routes/workflows.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

import { generateBusinessInsights } from '../agents/insightGeneratorAgent.js'; // <--- Ensure this is correct
import { adviseOnDecisions } from '../agents/decisionAdvisorAgent.js';        // <--- Ensure this is correct
import { callLLM } from '../lib/llmClient.js';  
import { getAggregatedBusinessData } from '../utils/dataAggregator.js';  
const router = express.Router();
const serverAnalyticsCache = new Map();
// --- Helper Functions (ALL YOUR ORIGINAL HELPER FUNCTIONS ARE RESTORED HERE) ---

const isValidDate = (dateString) => {
    try {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    } catch (e) {
        return false;
    }
};

const isNumeric = (value) => {
    return !isNaN(parseFloat(value)) && isFinite(value);
};

const hasDuplicateHeaders = (headers) => {
    const seen = new Set();
    for (const header of headers) {
        if (seen.has(header)) {
            return true;
        }
        seen.add(header);
    }
    return false;
};

const calculateMean = (numbers) => numbers.reduce((sum, num) => sum + num, 0) / numbers.length;

const calculateStandardDeviation = (numbers) => {
    if (numbers.length < 2) return 0;
    const mean = calculateMean(numbers);
    const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / (numbers.length - 1);
    return Math.sqrt(variance);
};

const processWorkflowResultsForInsights = (workflowResults) => {
    let totalCompletedTasks = 0;
    let totalRecordsProcessed = 0;
    let totalErrorsFound = 0;
    const errorTypeCounts = {};
    const weeklySales = {}; // period -> total_sales
    const productSales = {}; // productName -> { totalRevenue, totalUnitsSold }
    const regionSales = {}; // regionName -> { totalRevenue, totalUnitsSold, prevPeriodRevenue }

    workflowResults.forEach(result => {
        if (result.status === 'completed') {
            totalCompletedTasks++;
        }

        try {
            if (result.metrics) {
                const metrics = typeof result.metrics === 'string' ? JSON.parse(result.metrics) : result.metrics;
                if (metrics.recordsProcessed) {
                    totalRecordsProcessed += metrics.recordsProcessed;
                }
                if (metrics.errorsFound && Array.isArray(metrics.errorsFound)) {
                    totalErrorsFound += metrics.errorsFound.length;
                    metrics.errorsFound.forEach(error => {
                        const category = error.type || 'Unknown';
                        errorTypeCounts[category] = (errorTypeCounts[category] || 0) + 1;
                    });
                }
            }

            // This block is now mostly redundant as dataAggregator.js will handle output parsing
            // However, if there are specific outputs needed *before* full aggregation for some reason, keep parts.
            // For now, this is being simplified as dataAggregator.js is the source for LLM input.
            if (result.output) {
                const output = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
                // Example of how one *might* process specific outputs if dataAggregator wasn't doing it generically
                // This logic will be removed/refactored as dataAggregator.js now gives raw output to LLM
            }

        } catch (e) {
            logger.warn('Failed to parse workflow_results output/metrics for insight generation:', e);
        }
    });

    const errorDistribution = Object.entries(errorTypeCounts).map(([label, count]) => ({
        name: label,
        value: totalErrorsFound > 0 ? (count / totalErrorsFound) * 100 : 0
    }));

    // This return structure is what we used to send to LLM.
    // Now getAggregatedBusinessData will provide the structure.
    return {
        totalCompletedTasks,
        totalRecordsProcessed,
        totalErrorsFound,
        errorDistribution,
        // The following are now derived or passed differently from dataAggregator
        // productSales: Object.values(productSales),
        // regionSales: Object.values(regionSales),
        // weeklySalesTrends: Object.values(weeklySales)
    };
};

const excelDateToJSDate = (excelDate) => {
    if (typeof excelDate !== 'number') return null;
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const msPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + excelDate * msPerDay);
    return date.toISOString().split('T')[0];
};

const harmonizeSchema = (dataArray) => {
    const columnMapping = {
        'Item': 'Product_Name',
        'Product': 'Product_Name',
        'Sales_Date': 'Transaction_Date',
        'Date': 'Transaction_Date',
        'Quantity': 'Units_Count',
        'Units_Sold': 'Units_Count',
        'Total_Revenue': 'Revenue_Amount',
        'Revenue': 'Revenue_Amount'
    };

    const harmonizedDataArray = dataArray.map(fileData => {
        const originalHeaders = Array.isArray(fileData.headers) ? fileData.headers : [];
        const originalRows = Array.isArray(fileData.rows) ? fileData.rows : [];
        const newHeaders = [];
        const headerMap = new Map();

        originalHeaders.forEach((header, index) => {
            const standardizedHeader = columnMapping[header] || header;
            if (!newHeaders.includes(standardizedHeader)) {
                newHeaders.push(standardizedHeader);
            }
            headerMap.set(header, index);
        });

        const newRows = originalRows.map(row => {
            const newRow = Array(newHeaders.length).fill(null);
            newHeaders.forEach((newHeader, newIndex) => {
                const originalHeaderFound = originalHeaders.find(origH => (columnMapping[origH] || origH) === newHeader);
                if (originalHeaderFound !== undefined) {
                    const originalIndex = headerMap.get(originalHeaderFound);
                    if (originalIndex !== undefined && row[originalIndex] !== undefined) {
                        newRow[newIndex] = row[originalIndex];
                    }
                }
            });
            return newRow;
        });

        return {
            ...fileData,
            headers: newHeaders,
            rows: newRows,
            metadata: {
                ...fileData.metadata,
                columnCount: newHeaders.length,
                harmonized: true
            }
        };
    });

    return harmonizedDataArray;
};

const mergeProcessedData = (dataArray) => {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        return { headers: [], rows: [], metadata: { rowCount: 0, columnCount: 0, fileType: 'merged', hasHeaders: false }};
    }

    let allRows = [];
    let combinedHeaders = new Set();
    let finalHeadersList = [];

    dataArray.forEach(fileData => {
        const currentHeaders = Array.isArray(fileData.headers) ? fileData.headers : [];
        const currentRows = Array.isArray(fileData.rows) ? fileData.rows : [];

        if (finalHeadersList.length === 0 && currentHeaders.length > 0) {
            finalHeadersList = [...currentHeaders];
        }
        currentHeaders.forEach(h => combinedHeaders.add(h));
        allRows = allRows.concat(currentRows);
    });

    Array.from(combinedHeaders).forEach(h => {
        if (!finalHeadersList.includes(h)) {
            finalHeadersList.push(h);
        }
    });

    const mergedRows = allRows.map(row => {
        const newRowObject = {};
        const originalFile = dataArray.find(fd => Array.isArray(fd.rows) && fd.rows.includes(row));
        const originalRowHeaders = originalFile ? originalFile.headers : finalHeadersList;

        originalRowHeaders.forEach((header, index) => {
            newRowObject[header] = row[index];
        });

        return finalHeadersList.map(header => newRowObject[header] !== undefined ? newRowObject[header] : null);
    });

    return {
        headers: finalHeadersList,
        rows: mergedRows,
        metadata: {
            rowCount: mergedRows.length,
            columnCount: finalHeadersList.length,
            fileType: 'merged',
            hasHeaders: true
        }
    };
};

// --- NEW HELPER FUNCTION: Fetch and parse file content from DB ---
const fetchAndParseFileContent = async (db, fileId, userId) => {
    try {
        const file = await db.get(`
            SELECT id, filename, original_name, size, mime_type, processed_data
            FROM files
            WHERE id = ? AND user_id = ?
        `, [fileId, userId]);

        if (!file) {
            logger.warn(`[Backend] File ${fileId} not found for user ${userId} during task execution.`);
            return null;
        }

        let parsedProcessedData = {};
        if (file.processed_data) {
            try {
                parsedProcessedData = JSON.parse(file.processed_data);
            } catch (e) {
                logger.error(`[Backend] Failed to parse processed_data for file ${file.id}:`, e);
                return null;
            }
        }

        // Return the structure expected by your task functions
        return {
            id: file.id,
            filename: file.filename,
            originalName: file.original_name,
            size: file.size,
            mimeType: file.mime_type,
            headers: parsedProcessedData.headers || [],
            rows: parsedProcessedData.rows || [],
            metadata: parsedProcessedData.metadata || { rowCount: 0, columnCount: 0 }
        };

    } catch (error) {
        logger.error(`[Backend] Error fetching or parsing file content for ${fileId}:`, error);
        return null;
    }
};


// --- Workflow Endpoints ---

// Create new workflow
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { name, description, tasks, fileIds = [] } = req.body;
    const userId = req.user.userId;

    const workflowId = uuidv4();
    const createdAt = new Date().toISOString();
    const status = 'draft';

    logger.info(`[Backend] Creating workflow: ${workflowId}`);
    logger.info(`[Backend] Initial tasks data for save:`, tasks);
    logger.info(`[Backend] Initial fileIds data for save:`, fileIds);

    const tasksString = JSON.stringify(tasks);
    const fileIdsString = JSON.stringify(fileIds);

    await db.run(
      `INSERT INTO workflows (id, user_id, name, description, tasks, files, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [workflowId, userId, name, description, tasksString, fileIdsString, status, createdAt]
    );

    await db.run(`
      UPDATE users
      SET usage_workflows = usage_workflows + 1
      WHERE id = ?
    `, [req.user.userId]);

    logger.info(`[Backend] Workflow ${workflowId} inserted successfully.`);

    const workflow = await db.get(`
      SELECT * FROM workflows WHERE id = ?
    `, [workflowId]);

    res.status(201).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      tasks: JSON.parse(workflow.tasks),
      fileIds: JSON.parse(workflow.files || '[]'),
      status: workflow.status,
      createdAt: workflow.created_at
    });

  } catch (error) {
    logger.error('[Backend] Error creating workflow:', error);
    res.status(500).json({ message: 'Failed to create workflow', error: error.message });
  }
});

// Get all workflows for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.userId;
    const workflows = await db.all(`
      SELECT id, name, description, tasks, files, status, created_at, updated_at, results
      FROM workflows WHERE user_id = ? ORDER BY created_at DESC
    `, [userId]);

    logger.info('[Backend] Fetched all workflows from DB:', workflows);

    res.json(workflows.map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      tasks: JSON.parse(workflow.tasks || '[]'),
      fileIds: JSON.parse(workflow.files || '[]'),
      status: workflow.status,
      results: workflow.results ? JSON.parse(workflow.results) : [],
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    })));
  } catch (error) {
    logger.error('[Backend] Error getting all workflows:', error);
    res.status(500).json({ message: 'Failed to fetch workflows' });
  }
});

// Get a single workflow by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const workflowId = req.params.id;
    const userId = req.user.userId;

    const workflow = await db.get(`
      SELECT id, name, description, tasks, files, status, created_at, updated_at, results
      FROM workflows WHERE id = ? AND user_id = ?
    `, [workflowId, userId]);

    if (!workflow) {
      logger.warn(`[Backend] Workflow ${workflowId} not found for user ${userId}.`);
      return res.status(404).json({ message: 'Workflow not found or unauthorized' });
    }

    logger.info(`[Backend] Fetched single workflow ${workflowId} from DB:`, workflow);

    const parsedTasks = JSON.parse(workflow.tasks || '[]');
    const parsedFileIds = JSON.parse(workflow.files || '[]');

    logger.info(`[Backend] Parsed tasks for ${workflowId}:`, parsedTasks);

    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      tasks: parsedTasks,
      fileIds: parsedFileIds,
      status: workflow.status,
      results: workflow.results ? JSON.parse(workflow.results) : [],
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    });
  } catch (error) {
    logger.error(`[Backend] Error getting workflow ${req.params.id}:`, error);
    res.status(500).json({ message: 'Failed to fetch workflow' });
  }
});

// Update workflow
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const workflowId = req.params.id;
    const userId = req.user.userId;
    const { name, description, tasks, fileIds, status } = req.body;

    const existingWorkflow = await db.get(
      `SELECT name, description, tasks, files, status FROM workflows WHERE id = ? AND user_id = ?`,
      [workflowId, userId]
    );

    if (!existingWorkflow) {
      return res.status(404).json({ message: 'Workflow not found or unauthorized' });
    }

    const updatedName = name !== undefined ? name : existingWorkflow.name;
    const updatedDescription = description !== undefined ? description : existingWorkflow.description;
    const updatedTasks = tasks !== undefined ? JSON.stringify(tasks) : existingWorkflow.tasks;
    const updatedFileIds = fileIds !== undefined ? JSON.stringify(fileIds) : existingWorkflow.files;
    const updatedStatus = status !== undefined ? status : existingWorkflow.status;

    logger.info(`[Backend] Updating workflow ${workflowId}:`, { updatedName, updatedDescription, updatedTasks, updatedFileIds, updatedStatus });

    await db.run(
      `UPDATE workflows SET name = ?, description = ?, tasks = ?, files = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [updatedName, updatedDescription, updatedTasks, updatedFileIds, updatedStatus, workflowId, userId]
    );

    const updatedWorkflow = await db.get(
      `SELECT id, name, description, tasks, files, status, created_at, updated_at, results
       FROM workflows WHERE id = ? AND user_id = ?`,
      [workflowId, userId]
    );

    logger.info(`[Backend] Workflow ${workflowId} updated successfully.`);

    res.json({
      id: updatedWorkflow.id,
      name: updatedWorkflow.name,
      description: updatedWorkflow.description,
      tasks: JSON.parse(updatedWorkflow.tasks || '[]'),
      fileIds: JSON.parse(updatedWorkflow.files || '[]'),
      status: updatedWorkflow.status,
      createdAt: updatedWorkflow.created_at,
      updatedAt: updatedWorkflow.updated_at,
    });

  } catch (error) {
    logger.error(`[Backend] Error updating workflow ${req.params.id}:`, error);
    res.status(500).json({ message: 'Failed to update workflow', error: error.message });
  }
});


// Execute workflow (overall - this endpoint just sets the workflow to 'running')
// The actual task execution is now driven by the frontend calling /tasks/:taskId/execute
router.post('/:workflowId/execute', authenticateToken, async (req, res) => {
  const db = getDb();
  const workflowId = req.params.workflowId;
  const userId = req.user.userId;

  logger.info(`[Backend] Initiating overall workflow execution for: ${workflowId} by user: ${userId}`);

  try {
    let workflowToExecute = await db.get(
      `SELECT id, status FROM workflows WHERE id = ? AND user_id = ?`,
      [workflowId, userId]
    );

    if (!workflowToExecute) {
      logger.warn(`[Backend] Workflow ${workflowId} not found for user ${userId}.`);
      return res.status(404).json({ message: 'Workflow not found or unauthorized' });
    }

    // Set overall workflow status to 'running'
    await db.run(
      `UPDATE workflows SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [workflowId]
    );
    logger.info(`[Backend] Workflow ${workflowId} status updated to 'running'.`);

    // This endpoint simply signals that the workflow has started.
    // The individual task execution and progress updates will be driven by
    // the frontend calling /tasks/:taskId/execute for each task.
    res.json({ message: 'Workflow execution initiated successfully. Frontend will now execute tasks.' });

  } catch (error) {
    logger.error(`[Backend] Error initiating workflow execution for ${req.params.workflowId}:`, error);
    // Update workflow status to failed on error
    await db.run(
      `UPDATE workflows SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.workflowId]
    );
    res.status(500).json({ message: 'Failed to initiate workflow execution', error: error.message });
  }
});

// Get workflow results
router.get('/:id/results', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const workflowId = req.params.id;

    logger.info('Backend: Fetching results for workflow ID:', workflowId);

    const results = await db.all(`
      SELECT * FROM workflow_results
      WHERE workflow_id = ?
      ORDER BY created_at ASC
    `, [req.params.id]);
    logger.info('Backend: Query results from DB:', results);
    res.json(results.map(result => ({
        ...result,
        output: JSON.parse(result.output || '{}'), // Ensure output is parsed
        error: result.error ? JSON.parse(result.error) : null, // Parse error
        metrics: JSON.parse(result.metrics || '{}') // Parse metrics
    })));
  } catch (error) {
    logger.error('Get workflow results error:', error);
    res.status(500).json({ message: 'Failed to fetch workflow results' });
  }
});

// Delete workflow
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const workflowId = req.params.id;
    const userId = req.user.userId;

    const workflow = await db.get(`SELECT id FROM workflows WHERE id = ? AND user_id = ?`, [workflowId, userId]);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found or unauthorized' });
    }

    await db.run(`DELETE FROM workflow_results WHERE workflow_id = ?`, [workflowId]);
    logger.info(`[Backend] Deleted results for workflow ${workflowId}.`);

    await db.run(`DELETE FROM workflows WHERE id = ?`, [workflowId]);
    logger.info(`[Backend] Deleted workflow ${workflowId}.`);

    res.json({ message: 'Workflow deleted successfully' });
  } catch (error) {
    logger.error('Delete workflow error:', error);
    res.status(500).json({ message: 'Failed to delete workflow' });
  }
});

// Get workflow templates (mock data for now)
router.get('/templates', authenticateToken, async (req, res) => {
  const mockTemplates = [
    {
      id: 'template-clean-analyze',
      name: 'Clean & Analyze Data',
      description: 'A standard workflow to clean raw data and generate initial analysis.',
      tasks: [
        { name: 'Data Cleaning', type: 'clean', agent: 'CleaningAgent' },
        { name: 'Schema Analysis', type: 'analyze', agent: 'SchemaAgent' },
        { name: 'Generate Report', type: 'report', agent: 'ReportAgent' },
      ],
      category: 'Data Preparation',
      isPublic: true,
    },
    {
      id: 'template-merge-validate',
      name: 'Merge & Validate Datasets',
      description: 'Combines multiple datasets and performs data validation checks.',
      tasks: [
        { name: 'Data Merging', type: 'merge', agent: 'MergeAgent' },
        { name: 'Data Validation', type: 'validate', agent: 'ValidationAgent' },
      ],
      category: 'Data Integration',
      isPublic: true,
    },
  ];
  res.json(mockTemplates);
});

// Save workflow as template
router.post('/:workflowId/save-template', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const workflowId = req.params.workflowId;
    const userId = req.user.userId;
    const { name, description, tasks, category, isPublic = false } = req.body;

    const originalWorkflow = await db.get(`SELECT tasks FROM workflows WHERE id = ? AND user_id = ?`, [workflowId, userId]);
    if (!originalWorkflow) {
      return res.status(404).json({ message: 'Workflow not found or unauthorized' });
    }

    const templateId = uuidv4();
    const tasksToSave = JSON.parse(originalWorkflow.tasks || '[]').map(task => ({
      name: task.name,
      description: task.description,
      type: task.type,
      agent: task.agent
    }));

    await db.run(
      `INSERT INTO workflow_templates (id, user_id, name, description, tasks, category, is_public, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [templateId, userId, name, description, JSON.stringify(tasksToSave), category, isPublic ? 1 : 0]
    );

    res.status(201).json({
      id: templateId,
      name,
      description,
      tasks: tasksToSave,
      category,
      isPublic,
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`[Backend] Error saving workflow ${req.params.workflowId} as template:`, error);
    res.status(500).json({ message: 'Failed to save workflow as template', error: error.message });
  }
});

// Execute a specific task within a workflow (THIS IS THE PRIMARY TASK EXECUTION ROUTE)
// This route is called by the frontend's WorkflowEngine to run individual tasks sequentially.
router.post('/:workflowId/tasks/:taskId/execute', authenticateToken, async (req, res) => {
  const db = getDb(); // Get DB instance at the start of the route handler
  const { workflowId, taskId } = req.params;
  let { taskType, inputData, config } = req.body; // inputData will now vary based on previous task's output
  const userId = req.user.userId; // Get userId from authenticated request

  try {
    const workflow = await db.get(
      `SELECT * FROM workflows WHERE id = ? AND user_id = ?`,
      [workflowId, userId] // Use userId for security
    );

    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found or unauthorized' });
    }

    let tasks = JSON.parse(workflow.tasks || '[]');
    const taskIndex = tasks.findIndex(t => t.id === taskId); // Get index to update in array
    if (taskIndex === -1) {
      return res.status(404).json({ message: 'Task not found within workflow' });
    }
    let taskToExecute = tasks[taskIndex]; // Reference to the specific task object

    let processedOutput = null;
    let errorsFound = []; // Use an array for multiple errors or a Set
    let recordsProcessed = 0;
    const startedAt = new Date().toISOString(); // Capture start time

    // --- CRITICAL NEW LOGIC: Handle initial inputData (file IDs) ---
    // If the inputData is an array of objects with 'id' property,
    // assume these are file IDs and fetch their processed content.
    if (Array.isArray(inputData) && inputData.every(item => typeof item === 'object' && item !== null && 'id' in item)) {
        logger.info(`[Backend] Task ${taskId}: Initial inputData detected as file IDs. Fetching file contents...`);
        const fileContentsPromises = inputData.map(fileObj => fetchAndParseFileContent(db, fileObj.id, userId));
        const fetchedFileContents = await Promise.all(fileContentsPromises);
        // Filter out any nulls if file fetching failed for some
        inputData = fetchedFileContents.filter(content => content !== null);
        logger.info(`[Backend] Task ${taskId}: Fetched ${inputData.length} file contents.`);
    } else {
        logger.info(`[Backend] Task ${taskId}: InputData is not initial file IDs. Proceeding with current inputData structure.`);
    }
    // --- END CRITICAL NEW LOGIC ---


    // --- Task Implementations ---

    if (taskType === 'analyze') {
        logger.info(`Backend: Executing Analyze Task (${taskId}). Input files count: ${inputData?.length || 0}`);
        
        const analysisReports = [];
        let totalIssues = 0;

        if (Array.isArray(inputData) && inputData.length > 0) {
            inputData.forEach((fileData, fileIndex) => {
                const headers = fileData.headers || [];
                const rows = fileData.rows || [];
                const analysisIssues = [];

                if (!Array.isArray(rows) || !Array.isArray(headers)) {
                    analysisIssues.push(`File ${fileData.originalName || fileIndex + 1}: Invalid data structure (rows or headers not array).`);
                }

                if (headers.length === 0) {
                    analysisIssues.push(`File ${fileData.originalName || fileIndex + 1}: No headers found.`);
                } else if (hasDuplicateHeaders(headers)) {
                    analysisIssues.push(`File ${fileData.originalName || fileIndex + 1}: Duplicate column headers detected.`);
                }

                const columnData = {};
                headers.forEach(header => (columnData[header] = { values: [], types: new Set() }));

                rows.forEach((row, rowIndex) => {
                    row.forEach((cell, colIndex) => {
                        const header = headers[colIndex];
                        if (cell === null || cell === undefined || String(cell).trim() === '') {
                            analysisIssues.push(`Row ${rowIndex + 1}, Column '${header}': Empty or missing value.`);
                        } else {
                            columnData[header].values.push(cell);
                            columnData[header].types.add(typeof cell);
                            if (isNumeric(cell)) columnData[header].types.add('number');
                            if (isNumeric(cell) && excelDateToJSDate(cell) !== null) columnData[header].types.add('excel_date_number');
                            if (isValidDate(cell)) columnData[header].types.add('date');
                        }
                    });
                });

                headers.forEach(header => {
                    const colTypes = Array.from(columnData[header].types);
                    if (colTypes.length > 1) {
                        const filteredTypes = colTypes.filter(type => type !== 'number' && type !== 'excel_date_number');
                        if (filteredTypes.length > 1 || (filteredTypes.length === 1 && !['number', 'excel_date_number'].includes(filteredTypes[0]))) {
                            analysisIssues.push(`File ${fileData.originalName || fileIndex + 1}, Column '${header}': Mixed data types detected: ${colTypes.join(', ')}.`);
                        }
                    }
                });

                headers.forEach(header => {
                    const numbers = columnData[header].values.filter(isNumeric).map(Number);
                    if (numbers.length > 10) {
                        const mean = calculateMean(numbers);
                        const stdDev = calculateStandardDeviation(numbers);
                        const threshold = 3 * stdDev;

                        numbers.forEach((num, index) => {
                            if (Math.abs(num - mean) > threshold) {
                                const originalRowIndex = rows.findIndex(r => r[headers.indexOf(header)] === num);
                                analysisIssues.push(`File ${fileData.originalName || fileIndex + 1}, Row ${originalRowIndex !== -1 ? originalRowIndex + 1 : 'N/A'}, Column '${header}': Statistical outlier detected (Value: ${num}).`);
                            }
                        });
                    }
                });

                const seenRows = new Set();
                rows.forEach((row, rowIndex) => {
                    const rowString = JSON.stringify(row);
                    if (seenRows.has(rowString)) {
                        analysisIssues.push(`File ${fileData.originalName || fileIndex + 1}: Duplicate record found at row ${rowIndex + 1}.`);
                    }
                    seenRows.add(rowString);
                });
                
                totalIssues += analysisIssues.length;

                analysisReports.push({
                    fileName: fileData.originalName || `File ${fileIndex + 1}`,
                    headers: headers,
                    rows: rows,
                    metadata: {
                        ...fileData.metadata,
                        analyzed: true,
                        issuesFound: analysisIssues.length,
                        rowCount: rows.length // Ensure rowCount is correctly set here
                    },
                    analysisIssues: analysisIssues,
                    summary: `Analysis for ${rows.length} records completed. Issues: ${analysisIssues.length}.`
                });
            });
        }
        processedOutput = analysisReports;
        errorsFound = analysisReports.flatMap(report => report.analysisIssues); // Collect all errors
        recordsProcessed = processedOutput.reduce((sum, item) => sum + (item.metadata?.rowCount || 0), 0); // Total rows analyzed

    } else if (taskType === 'clean') {
        logger.info(`Backend: Executing Clean Task (${taskId}). Input files count: ${inputData?.length || 0}`);
        
        const cleaningReports = [];
        let totalIssues = 0;
        let cleanedOutputData = [];

        if (Array.isArray(inputData) && inputData.length > 0) {
            cleanedOutputData = inputData.map((fileData, fileIndex) => {
                const originalRows = Array.isArray(fileData.rows) ? fileData.rows : [];
                const originalHeaders = Array.isArray(fileData.headers) ? fileData.headers : [];
                const cleanedRows = [];
                const issuesInFile = []; // Issues specific to this file
                let changesMade = 0;

                originalRows.forEach((row, rowIndex) => {
                    const cleanedRow = [...row];
                    originalHeaders.forEach((header, colIndex) => {
                        let cell = cleanedRow[colIndex];

                        if (typeof cell === 'string') {
                            const trimmed = cell.trim();
                            const normalized = trimmed.toLowerCase();
                            if (trimmed !== cell || normalized !== trimmed) {
                                changesMade++;
                                cleanedRow[colIndex] = normalized;
                                issuesInFile.push(`Row ${rowIndex + 1}, Column '${header}': Trimmed/normalized casing.`);
                            }
                        }

                        if (['Sales_Date', 'Date', 'Transaction_Date'].includes(header) && cell) {
                            let convertedDate = null;
                            if (isNumeric(cell)) {
                                convertedDate = excelDateToJSDate(cell);
                            } else if (typeof cell === 'string' && isValidDate(cell)) {
                                convertedDate = new Date(cell).toISOString().split('T')[0];
                            }

                            if (convertedDate) {
                                if (convertedDate !== cell) {
                                    cleanedRow[colIndex] = convertedDate;
                                    changesMade++;
                                    issuesInFile.push(`Row ${rowIndex + 1}, Column '${header}': Standardized date to YYYY-MM-DD.`);
                                }
                            } else {
                                issuesInFile.push(`Row ${rowIndex + 1}, Column '${header}': Invalid or unparseable date format ('${cell}').`);
                                cleanedRow[colIndex] = null;
                                changesMade++;
                            }
                        }

                        if (cell === null || cell === undefined || String(cell).trim() === '') {
                            cleanedRow[colIndex] = 'N/A';
                            changesMade++;
                            issuesInFile.push(`Row ${rowIndex + 1}, Column '${header}': Filled empty value with 'N/A'.`);
                        }

                        if (['Price', 'Total_Revenue', 'Revenue_Amount', 'Amount', 'Quantity', 'Units_Sold', 'Units_Count'].includes(header) && typeof cell === 'string') {
                            const cleanedNumber = parseFloat(cell.replace(/[^0-9.-]+/g, ""));
                            if (!isNaN(cleanedNumber) && cleanedNumber !== parseFloat(cell)) {
                                cleanedRow[colIndex] = cleanedNumber;
                                changesMade++;
                                issuesInFile.push(`Row ${rowIndex + 1}, Column '${header}': Cleaned numeric format ('${cell}' -> '${cleanedNumber}').`);
                            }
                        }

                        if (header === 'Country' && typeof cell === 'string') {
                            const lowerCaseCell = cell.toLowerCase();
                            if (lowerCaseCell === 'usa' || lowerCaseCell === 'united states') {
                                cleanedRow[colIndex] = 'US';
                                changesMade++;
                                issuesInFile.push(`Row ${rowIndex + 1}, Column '${header}': Standardized country to 'US'.`);
                            }
                        }
                    });
                    cleanedRows.push(cleanedRow);
                });

                const idColIndex = originalHeaders.indexOf('ID');
                if (idColIndex !== -1) {
                    const ids = cleanedRows.map(row => row[idColIndex]);
                    const uniqueIds = new Set();
                    ids.forEach((id, index) => {
                        if (id !== null && id !== undefined && uniqueIds.has(id)) {
                            issuesInFile.push(`Row ${index + 1}, Column 'ID': Duplicate ID found: '${id}'.`);
                        }
                        if (id !== null && id !== undefined) {
                            uniqueIds.add(id);
                        }
                    });
                }
                
                totalIssues += issuesInFile.length;

                cleaningReports.push({
                    fileName: fileData.fileName || fileData.originalName || `File ${fileIndex + 1}`,
                    originalRowCount: originalRows.length,
                    cleanedRowCount: cleanedRows.length,
                    changesMade: changesMade,
                    issuesFound: issuesInFile.length,
                    details: issuesInFile
                });

                return {
                    ...fileData,
                    headers: originalHeaders,
                    rows: cleanedRows,
                    metadata: {
                        ...fileData.metadata,
                        rowCount: cleanedRows.length,
                        cleaned: true,
                        cleaningReport: cleaningReports[cleaningReports.length - 1]
                    }
                };
            });
            processedOutput = cleanedOutputData;
        } else {
            processedOutput = { message: "Clean task completed, but no valid input data provided.", metadata: { rowCount: 0 } };
        }
        errorsFound = cleaningReports.flatMap(report => report.details); // Collect all errors
        recordsProcessed = processedOutput.reduce((sum, item) => sum + (item.metadata?.rowCount || 0), 0); // Total rows cleaned

    } else if (taskType === 'merge') {
        logger.info(`Backend: Executing Merge Task (${taskId}). Input files count: ${inputData?.length || 0}`);
        
        let mergedData = { headers: [], rows: [], metadata: { rowCount: 0, columnCount: 0 } };
        const mergeIssues = [];
        
        if (Array.isArray(inputData) && inputData.length > 0) {
            const harmonizedFiles = harmonizeSchema(inputData);
            mergedData = mergeProcessedData(harmonizedFiles);

            if (inputData.length > 1) {
                const baseHeaders = harmonizedFiles[0].headers || [];
                harmonizedFiles.slice(1).forEach((file, index) => {
                    const currentHeaders = file.headers || [];
                    if (JSON.stringify([...new Set(baseHeaders)].sort()) !== JSON.stringify([...new Set(currentHeaders)].sort())) {
                        mergeIssues.push(`Schema inconsistency detected after harmonization between file 1 and file ${index + 2}.`);
                    }
                });
            }

            const sumOfInputRowCounts = inputData.reduce((sum, file) => sum + (file.metadata?.rowCount || 0), 0);
            if (mergedData.metadata.rowCount !== sumOfInputRowCounts) {
                mergeIssues.push(`Merged row count (${mergedData.metadata.rowCount}) does not match sum of input row counts (${sumOfInputRowCounts}). This might indicate dropped/added rows.`);
            }
            
        } else {
            mergedData = { message: "Merge task completed, but no iterable input data provided.", metadata: { rowCount: 0 } };
        }
        processedOutput = {
            ...mergedData,
            mergeIssues: mergeIssues,
            metadata: {
                ...mergedData.metadata,
                merged: true,
                issuesFound: mergeIssues.length,
                totalMergedRows: mergedData.metadata.rowCount
            }
        };
        errorsFound = mergeIssues;
        recordsProcessed = mergedData.metadata.rowCount; // Total rows in merged output

    } else if (taskType === 'validate') {
        logger.info(`Backend: Executing Validation Task (${taskId}). Input rows: ${inputData?.rows?.length || 0}`);
        
        let dataToValidate = { headers: [], rows: [], metadata: { rowCount: 0 } };
        if (inputData && typeof inputData === 'object' && Array.isArray(inputData.rows)) {
            dataToValidate = inputData;
        } else if (Array.isArray(inputData) && inputData.length > 0 && Array.isArray(inputData[0].rows)) {
            dataToValidate = mergeProcessedData(harmonizeSchema(inputData));
        }

        let invalidRecords = 0;
        const validationIssues = [];
        const validRows = [];
        const headers = dataToValidate.headers || [];
        const rows = dataToValidate.rows || [];

        rows.forEach((row, rowIndex) => {
            let rowHasIssues = false;
            const issuesInRow = [];
            const rowObject = {};
            headers.forEach((header, idx) => {
                rowObject[header] = row[idx];
            });

            row.forEach((cell, colIndex) => {
                if (cell === null || cell === undefined || String(cell).trim() === '' || String(cell).toLowerCase() === 'n/a') {
                    issuesInRow.push(`Missing value in column '${headers[colIndex] || colIndex}'`);
                    rowHasIssues = true;
                }
            });

            const revenueAmount = isNumeric(rowObject['Revenue_Amount']) ? parseFloat(rowObject['Revenue_Amount']) : NaN;
            const unitsCount = isNumeric(rowObject['Units_Count']) ? parseFloat(rowObject['Units_Count']) : NaN;
            if (!isNaN(revenueAmount) && !isNaN(unitsCount) && unitsCount > 0) {
                // This rule needs a 'Price' column to be fully effective.
                // If 'Price' is not a direct column, this rule needs adjustment or config.
                // For now, let's assume 'Price' is either mapped or derived elsewhere.
            }

            const orderDateColIndex = headers.indexOf('Order_Date');
            const deliveryDateColIndex = headers.indexOf('Delivery_Date');
            if (orderDateColIndex !== -1 && deliveryDateColIndex !== -1) {
                const orderDate = new Date(rowObject['Order_Date']);
                const deliveryDate = new Date(rowObject['Delivery_Date']);
                if (isValidDate(rowObject['Order_Date']) && isValidDate(rowObject['Delivery_Date']) && orderDate >= deliveryDate) {
                    issuesInRow.push(`Business rule violation: Order_Date (${rowObject['Order_Date']}) is not before Delivery_Date (${rowObject['Delivery_Date']})`);
                    rowHasIssues = true;
                }
            }

            const salaryColIndex = headers.indexOf('Salary');
            if (salaryColIndex !== -1 && isNumeric(rowObject['Salary'])) {
                if (Number(rowObject['Salary']) > 1000000) {
                    issuesInRow.push(`Range violation: Salary (${rowObject['Salary']}) exceeds $1M.`);
                    rowHasIssues = true;
                }
            }
            const ageColIndex = headers.indexOf('Age');
            if (ageColIndex !== -1 && isNumeric(rowObject['Age'])) {
                if (Number(rowObject['Age']) < 18 || Number(rowObject['Age']) > 100) {
                    issuesInRow.push(`Range violation: Age (${rowObject['Age']}) is out of expected range (18-100).`);
                    rowHasIssues = true;
                }
            }

            const statusColIndex = headers.indexOf('Status');
            const amountColIndex = headers.indexOf('Amount');
            if (statusColIndex !== -1 && amountColIndex !== -1) {
                if (String(rowObject['Status']).toLowerCase() === 'cancelled' && isNumeric(rowObject['Amount']) && parseFloat(rowObject['Amount']) !== 0) {
                    issuesInRow.push(`Cross-column violation: Status is 'Cancelled' but Amount is not 0 (${rowObject['Amount']}).`);
                    rowHasIssues = true;
                }
            }

            const regionColIndex = headers.indexOf('Region');
            if (regionColIndex !== -1 && typeof rowObject['Region'] === 'string') {
                const validRegions = ['North', 'South', 'East', 'West', 'Central'];
                if (!validRegions.includes(rowObject['Region'])) {
                    issuesInRow.push(`Reference integrity: Invalid Region '${rowObject['Region']}'.`);
                    rowHasIssues = true;
                }
            }

            const managerColIndex = headers.indexOf('Manager');
            if (regionColIndex !== -1 && managerColIndex !== -1 && rowObject['Region'] && (rowObject['Manager'] === null || String(rowObject['Manager']).trim() === '' || String(rowObject['Manager']).toLowerCase() === 'n/a')) {
                issuesInRow.push(`Custom constraint: Region '${rowObject['Region']}' has no manager assigned.`);
                rowHasIssues = true;
                
            }


            if (rowHasIssues) {
                invalidRecords++;
                validationIssues.push({ row: rowIndex + 1, issues: issuesInRow, data: rowObject });
            } else {
                validRows.push(row);
            }
        });

        const customerIdColIndex = headers.indexOf('Customer_ID');
        if (customerIdColIndex !== -1) {
            const seenCustomerIds = new Set();
            rows.forEach((row, rowIndex) => {
                const customerId = row[customerIdColIndex];
                if (customerId !== undefined && customerId !== null && String(customerId).trim() !== '' && seenCustomerIds.has(customerId)) {
                    validationIssues.push({ row: rowIndex + 1, issues: [`Duplicate Customer_ID found: '${customerId}'`], data: customerId });
                    invalidRecords++;
                }
                if (customerId !== undefined && customerId !== null && String(customerId).trim() !== '') {
                    seenCustomerIds.add(customerId);
                }
            });
        }

        processedOutput = {
            message: `Validation completed for ${dataToValidate.metadata.rowCount} records.`,
            summary: `${invalidRecords} issues found. ${validRows.length} valid records.`,
            validRecordsCount: validRows.length,
            invalidRecordsCount: invalidRecords,
            validationIssues: validationIssues,
            headers: dataToValidate.headers,
            rows: validRows,
            metadata: {
                ...dataToValidate.metadata,
                validated: true,
                validRowCount: validRows.length,
                invalidRowCount: invalidRecords
            }
        };
        errorsFound = validationIssues.flatMap(issue => issue.issues); // Collect all issues
        recordsProcessed = validRows.length; // Count of valid records

    } else if (taskType === 'report') {
        logger.info(`Backend: Executing Report Task (${taskId}). Input rows: ${inputData?.rows?.length || 0}`);
        
        let dataForReport = { headers: [], rows: [], metadata: { rowCount: 0 } };
        if (inputData && typeof inputData === 'object' && Array.isArray(inputData.rows)) {
            dataForReport = inputData;
        } else if (Array.isArray(inputData) && inputData.length > 0 && Array.isArray(inputData[0].rows)) {
            // If inputData is an array of files/processedData, merge them first
            dataForReport = mergeProcessedData(harmonizeSchema(inputData));
        }

        const headers = dataForReport.headers || [];
        const rows = dataForReport.rows || [];
        const totalRecords = rows.length;

        let totalRevenue = 0;
        const revenueColumnIndex = headers.indexOf('Revenue_Amount');

        if (revenueColumnIndex !== -1) {
            totalRevenue = rows.reduce((sum, row) => {
                const value = parseFloat(row[revenueColumnIndex]);
                return sum + (isNaN(value) ? 0 : value);
            }, 0);
        }

        const productRevenue = {};
        const productNameColIndex = headers.indexOf('Product_Name');
        if (productNameColIndex !== -1 && revenueColumnIndex !== -1) {
            rows.forEach(row => {
                const product = String(row[productNameColIndex]);
                const revenue = parseFloat(row[revenueColumnIndex]);
                if (product && !isNaN(revenue)) {
                    productRevenue[product] = (productRevenue[product] || 0) + revenue;
                }
            });
        }
        const productRevenueChartData = Object.entries(productRevenue).map(([label, value]) => ({ label, value }));


        const reportIssues = [];

        if (totalRecords > 0 && totalRevenue === 0 && revenueColumnIndex !== -1 && rows.some(row => isNumeric(row[revenueColumnIndex]) && parseFloat(row[revenueColumnIndex]) > 0)) {
            reportIssues.push('Calculated total revenue is 0 despite records with positive revenue existing. Check aggregation logic.');
        }

        const transactionDateColIndex = headers.indexOf('Transaction_Date');
        if (transactionDateColIndex !== -1 && rows.length > 0) {
            const latestDate = rows.reduce((maxDate, row) => {
                const cellValue = row[transactionDateColIndex];
                if (isValidDate(cellValue)) {
                    const rowDate = new Date(cellValue);
                    return rowDate > maxDate ? rowDate : maxDate;
                }
                return maxDate;
            }, new Date(0));

            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            if (latestDate.getTime() !== new Date(0).getTime() && latestDate < oneMonthAgo) {
                reportIssues.push(`Data freshness alert: Latest record date (${latestDate.toISOString().split('T')[0]}) is older than one month.`);
            }
        }

        processedOutput = {
            reportTitle: `Comprehensive Sales Report for ${new Date().getFullYear()}`,
            generationDate: new Date().toISOString().split('T')[0],
            totalProcessedRecords: totalRecords,
            summaryText: `A detailed report generated from ${totalRecords} records. Total estimated revenue: $${totalRevenue.toFixed(2)}.`,
            charts: [
                { type: 'bar', title: 'Revenue by Product', data: productRevenueChartData },
                { type: 'pie', title: 'Sales Distribution (Example)', data: [{ label: 'Region A', value: 40 }, { label: 'Region B', value: 60 }] }
            ],
            headers: dataForReport.headers,
            rows: dataForReport.rows,
            reportIssues: reportIssues,
            metadata: { 
                ...dataForReport.metadata,
                reportGenerated: true,
                totalRevenue: totalRevenue,
                issuesFound: reportIssues.length
            }
        };
        errorsFound = reportIssues;
        recordsProcessed = totalRecords; // Total records used for report

    } else {
        processedOutput = { message: `Task ${taskType} executed (simulated). Input size: ${inputData?.length || 0}`, receivedInput: inputData, metadata: { rowCount: 0 } };
        recordsProcessed = inputData?.length || 0; // Default for unknown tasks
    }

    // --- End Task Implementations ---

    // Simulate progress for the current task within this endpoint
    for (let p = 0; p <= 100; p += 20) {
        taskToExecute.progress = p;
        taskToExecute.status = 'running'; // Ensure status is running during progress
        // Update the tasks array in the workflow object in the database
        tasks[taskIndex] = taskToExecute; // Update the task in the local array
        await db.run(
            `UPDATE workflows SET tasks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [JSON.stringify(tasks), workflowId] // Stringify the *entire* updated tasks array
        );
        logger.info(`[Backend] Workflow ${workflowId} - Task "${taskToExecute.name}" progress: ${taskToExecute.progress}% (DB updated)`);
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate work for this task
    }

    taskToExecute.status = 'completed';
    taskToExecute.progress = 100;
    tasks[taskIndex] = taskToExecute; // Ensure final state is updated in local array

    // Final update for this specific task in the workflow's tasks array
    await db.run(
      `UPDATE workflows SET tasks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(tasks), workflowId]
    );
    logger.info(`[Backend] Workflow ${workflowId} - Task "${taskToExecute.name}" completed (DB updated)`);

    // Prepare metrics object for the 'metrics' column
    const taskMetrics = {
        recordsProcessed: recordsProcessed,
        errorsFound: errorsFound.length > 0 ? errorsFound : null, // Store errors if any
        // Add any other relevant metrics here
    };

    // Store results in workflow_results table (per task)
    await db.run(
    `INSERT INTO workflow_results (id, workflow_id, task_id, status, output, error, metrics, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
        uuidv4(), // New ID for the result entry
        workflowId,
        taskId,
        'completed', // Status for this result entry
        JSON.stringify(processedOutput),
        errorsFound.length > 0 ? JSON.stringify(errorsFound) : null,
        JSON.stringify(taskMetrics), // Store metrics as JSON string
        startedAt, // Use the captured start time
        new Date().toISOString() // Capture completion time
    ]
);
    logger.info(`[Backend] Result for task ${taskId} of workflow ${workflowId} stored successfully.`);

    res.json({
      message: `Task ${taskId} executed successfully`,
      taskStatus: taskToExecute.status,
      taskProgress: taskToExecute.progress,
      output: processedOutput,
      metrics: taskMetrics // Send the metrics object
    });

  } catch (error) {
    logger.error(`[Backend] Execute task ${req.params.taskId} error:`, error);
    const db = getDb(); // Re-get db in catch block for safety
    try {
        const workflow = await db.get(`SELECT tasks FROM workflows WHERE id = ? AND user_id = ?`, [workflowId, userId]); // Use userId
        if (workflow) {
            let tasks = JSON.parse(workflow.tasks || '[]');
            const taskToFail = tasks.find(t => t.id === taskId);
            if (taskToFail) {
                taskToFail.status = 'failed';
                taskToFail.progress = 0; // Or keep last progress if desired
                await db.run(
                    `UPDATE workflows SET tasks = ?, status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [JSON.stringify(tasks), workflowId]
                );
                logger.warn(`[Backend] Workflow ${workflowId} - Task "${taskId}" status updated to 'failed' due to error.`);
            }
        }
    } catch (dbError) {
        logger.error(`[Backend] Failed to update task status to 'failed' for workflow ${workflowId}, task ${taskId}:`, dbError);
    }
    res.status(500).json({ message: 'Failed to execute task', error: error.message });
  }
});

// Helper to get week number (needed for analytics route)
function getWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

router.get('/users/ai-settings', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id; // Assuming userId is available from authenticateToken middleware

        // Fetch user's settings from the database
        const userSettingsRow = await db.get('SELECT settings FROM users WHERE id = ?', [userId]);

        let aiSettings = {
            provider: process.env.DEFAULT_LLM_PROVIDER || 'ollama',
            model: process.env.DEFAULT_LLM_MODEL || 'llama3',
            temperature: parseFloat(process.env.DEFAULT_LLM_TEMPERATURE || '0.7'),
            maxTokens: parseInt(process.env.DEFAULT_LLM_MAX_TOKENS || '2048'),
        };

        if (userSettingsRow && userSettingsRow.settings) {
            try {
                const parsedUserSettings = JSON.parse(userSettingsRow.settings);
                // Merge default/env settings with user-specific AI settings from DB
                if (parsedUserSettings.ai) {
                    aiSettings = { ...aiSettings, ...parsedUserSettings.ai };
                }
            } catch (parseError) {
                logger.warn('Failed to parse user settings from DB, using defaults and environment variables:', parseError);
            }
        }

        // Do not send the API key to the frontend for security reasons
        // It's handled internally by llmClient.js using process.env
        delete aiSettings.aiProviderApiKey;

        logger.info(`[Backend] Fetched AI settings for user ${userId} for frontend:`, aiSettings);
        res.status(200).json(aiSettings);
    } catch (error) {
        logger.error(`[Backend] Error fetching AI settings for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to fetch AI settings', error: error.message });
    }
});

// --- API endpoint to save user-specific settings ---
router.put('/users/settings', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const newSettings = req.body; // This should be the entire settings object

        // Fetch existing settings to merge or create new
        const existingUser = await db.get('SELECT settings FROM users WHERE id = ?', [userId]);
        let currentSettings = {};
        if (existingUser && existingUser.settings) {
            try {
                currentSettings = JSON.parse(existingUser.settings);
            } catch (parseError) {
                logger.warn('Failed to parse existing user settings from DB, starting fresh for update:', parseError);
            }
        }

        // Deep merge new settings with existing ones
        const updatedSettings = { ...currentSettings, ...newSettings };

        // Save the updated settings back to the database
        await db.run('UPDATE users SET settings = ? WHERE id = ?', [JSON.stringify(updatedSettings), userId]);

        logger.info(`[Backend] Saved settings for user ${userId}:`, updatedSettings);
        res.status(200).json({ message: 'Settings saved successfully', settings: updatedSettings });
    } catch (error) {
        logger.error(`[Backend] Error saving settings for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to save settings', error: error.message });
    }
});


// --- NEW ANALYTICS ENDPOINTS FOR WORKFLOW DATA ---

// Get processing trends (e.g., workflows completed/failed over time)
router.get('/analytics/insights', authenticateToken, async (req, res) => {
    const startTime = Date.now();
    try {
        const db = getDb();
        const userId = req.user.userId;

        const period = req.query.period || '30days';
        const cacheKey = `${userId}-${period}`;

        // --- Check Cache First ---
        if (serverAnalyticsCache.has(cacheKey)) {
            const cachedData = serverAnalyticsCache.get(cacheKey);
            logger.info(`[Backend] Analytics data for user ${userId}, period ${period} loaded from server cache.`);
            return res.json(cachedData); // Return cached data immediately
        }

        // Fetch user's AI settings from the database or use system defaults
        const userSettingsRow = await db.get('SELECT settings FROM users WHERE id = ?', [userId]);
        let userAISettings = {
            provider: process.env.DEFAULT_LLM_PROVIDER || 'ollama',
            model: process.env.DEFAULT_LLM_MODEL || 'llama3',
            temperature: parseFloat(process.env.DEFAULT_LLM_TEMPERATURE || '0.7'),
            maxTokens: parseInt(process.env.DEFAULT_LLM_MAX_TOKENS || '2048'),
            aiProviderApiKey: process.env.GEMINI_API_KEY || process.env.OLLAMA_API_KEY || ''
        };

        if (userSettingsRow && userSettingsRow.settings) {
            try {
                const parsedUserSettings = JSON.parse(userSettingsRow.settings);
                if (parsedUserSettings.ai) {
                    userAISettings = { ...userAISettings, ...parsedUserSettings.ai };
                }
            } catch (parseError) {
                logger.warn('Failed to parse user settings from DB in analytics endpoint, using defaults:', parseError);
            }
        }

        logger.info(`[Backend] Fetching AI insights and decisions for user ${userId}, period ${period} with settings:`, userAISettings);

        // 1. Aggregate business data and operational metrics using the new generic aggregator
        const aggregatedData = await getAggregatedBusinessData(userId, period);

        // 2. Generate insights and decisions using the LLM
        const insights = await generateBusinessInsights(callLLM, aggregatedData, userAISettings);
        const decisions = await adviseOnDecisions(callLLM, insights, userAISettings);

        // 3. Prepare the full response object
        const fullResponse = {
            insights: insights,
            decisions: decisions,
            analyticsData: aggregatedData.analyticsChartsData // Include the structured data for charts
        };

        // --- Cache the response ---
        serverAnalyticsCache.set(cacheKey, fullResponse);
        logger.info(`[Backend] Analytics data for user ${userId}, period ${period} cached on server.`);

        // 4. Send combined response
        logger.info(`[Backend] Sending final AI insights and decisions to frontend:`, fullResponse);
        res.json(fullResponse);

    } catch (error) {
        logger.error('[Backend] Error generating AI insights or decisions:', error);
        res.status(500).json({ message: 'Failed to generate AI insights and decisions', error: error.message });
    } finally {
        const duration = Date.now() - startTime;
        logger.info(`[Timing] insights_endpoint_response_time: ${duration}ms`);
    }
});


export default router;