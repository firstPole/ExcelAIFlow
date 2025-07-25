import api from '@/lib/api'; // Assuming 'api' is an Axios instance configured with interceptors
import { AxiosError } from 'axios'; // Import AxiosError for type safety

// Assuming these interfaces are defined in workflow-context.tsx or a shared types file
// Re-importing them here for clarity in this service file
import { Workflow, Task } from '@/contexts/workflow-context'; // Keep if Workflow & Task are used from context
import { ProcessedData } from '@/lib/file-processor';
import { frontendLogger as logger } from '../utils/frontendLogger';// <--- UPDATED IMPORT PATH

// Consolidated WorkflowResult Interface - Use this in both workflow.service.ts and workflow-context.tsx
export interface WorkflowResult {
  id: string; // Unique ID for the result
  workflowId: string; // ID of the workflow this result belongs to
  taskId: string; // ID of the task that generated this result
  taskName: string; // Name of the task (e.g., 'Data Cleaning')
  type: string; // Type of output (e.g., 'report', 'merged_data', 'cleaned_data')
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: any; // The processed data/report from the task (can be any type)
  error: string | null; // General error message if the task failed
  metrics: { // Metrics associated with the task execution
    recordsProcessed?: number;
    errorsFound?: string[]; // Array of detailed error messages, if any
    [key: string]: any; // Allow other custom metrics
  };
  startedAt?: string; // Timestamp when the task started
  completedAt?: string; // Timestamp when the task completed
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tasks: Omit<Task, 'id' | 'status' | 'progress'>[]; // Tasks without runtime properties
  category: string;
  isPublic: boolean;
}

// Define what a Task looks like when creating it (sent to backend for initial creation)
// It will not have 'id', 'status', 'progress', 'output', 'errorsFound' as these are assigned by backend
export interface CreateTaskDto {
  name: string;
  description: string;
  type: 'clean' | 'merge' | 'analyze' | 'report' | 'validate';
  agent?: string;
  config?: { [key: string]: any };
}

// Define the structure for AI Insights (matching backend)
export interface AiInsight {
  type: 'product_performance' | 'region_performance' | 'sales_trend' | 'error_anomaly';
  title: string;
  description: string;
  data?: any; // Optional structured data supporting the insight (e.g., chart data)
}

// Define the structure for Decision Recommendations (matching backend)
export interface DecisionRecommendation {
  type: 'decision';
  title: string;
  recommendation: string;
  rationale: string;
  urgency: 'High' | 'Medium' | 'Low';
  category: 'marketing' | 'sales' | 'operations' | 'data_quality' | 'efficiency' | 'revenue' | 'risk_mitigation' | 'customer_experience' | 'resource_optimization';
}

// Define types for aggregated data that will be part of the insights response
export interface ProductSalesData {
  productName: string;
  totalRevenue: number;
  totalUnitsSold: number;
}

export interface RegionSalesData {
  regionName: string;
  totalRevenue: number;
  totalUnitsSold: number;
  prevPeriodRevenue: number; // For week-over-week comparison
}

export interface WeeklySalesTrendData {
  period: string;
  sales: number;
  prevSales: number;
}

export interface ErrorDistributionData {
  name: string;
  value: number; // Percentage
}

// Define the combined response structure for insights and decisions, including aggregated data
export interface AiInsightsAndDecisionsResponse {
  insights: AiInsight[];
  decisions: DecisionRecommendation[];
  // Add aggregated data fields that are now returned by the /analytics/insights endpoint
  productSales: ProductSalesData[];
  regionSales: RegionSalesData[];
  weeklySalesTrends: WeeklySalesTrendData[];
  errorDistribution: ErrorDistributionData[];
  totalCompletedTasks: number;
  totalRecordsProcessed: number;
  totalErrorsFound: number;
}


export const WorkflowService = {
  /**
   * Fetches all workflows for the authenticated user.
   * @returns A Promise that resolves with an array of Workflow objects.
   * @throws An error if fetching workflows fails.
   */
  async getAllWorkflows(): Promise<Workflow[]> {
    try {
      const response = await api.get<Workflow[]>('/api/workflows');
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch workflows.');
    }
  },

  /**
   * Fetches a single workflow by its ID.
   * @param workflowId The ID of the workflow to fetch.
   * @returns A Promise that resolves with a Workflow object.
   * @throws An error if fetching the workflow fails or it's not found.
   */
  async getWorkflowById(workflowId: string): Promise<Workflow> {
    try {
      const response = await api.get<Workflow>(`/api/workflows/${workflowId}`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to fetch workflow ${workflowId}.`);
    }
  },

  /**
   * Creates a new workflow.
   * @param workflowData The data for the new workflow.
   * @returns A Promise that resolves with the created Workflow object.
   * @throws An error if creating the workflow fails.
   */
  async createWorkflow(workflowData: Omit<Workflow, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'results'>): Promise<Workflow> {
    try {
      const response = await api.post<Workflow>('/api/workflows', workflowData);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create workflow.');
    }
  },

  /**
   * Updates an existing workflow.
   * @param workflowId The ID of the workflow to update.
   * @param updates The partial data to update the workflow with.
   * @returns A Promise that resolves with the updated Workflow object.
   * @throws An error if updating the workflow fails.
   */
  async updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow> {
    try {
      const response = await api.put<Workflow>(`/api/workflows/${workflowId}`, updates);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to update workflow ${workflowId}.`);
    }
  },

  /**
   * Deletes a workflow by its ID.
   * @param workflowId The ID of the workflow to delete.
   * @returns A Promise that resolves when the workflow is successfully deleted.
   * @throws An error if deleting the workflow fails.
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      await api.delete(`/api/workflows/${workflowId}`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to delete workflow ${workflowId}.`);
    }
  },

  /**
   * Adds files to a workflow.
   * @param workflowId The ID of the workflow to add files to.
   * @param fileIds An array of file IDs to add.
   * @returns A Promise that resolves with the updated Workflow object.
   * @throws An error if adding files fails.
   */
  async addFilesToWorkflow(workflowId: string, fileIds: string[]): Promise<Workflow> {
    try {
      const response = await api.post<Workflow>(`/api/workflows/${workflowId}/add-files`, { fileIds });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to add files to workflow ${workflowId}.`);
    }
  },

  /**
   * Executes a specific task within a workflow.
   * @param workflowId The ID of the workflow.
   * @param taskId The ID of the task to execute.
   * @param taskType The type of the task (e.g., 'clean', 'merge').
   * @param inputData The input data for the task (can be file IDs or previous task output).
   * @param config Optional configuration for the task.
   * @returns A Promise that resolves with the task's output and status.
   * @throws An error if task execution fails.
   */
  async executeWorkflowTask(workflowId: string, taskId: string, taskType: string, inputData: any, config?: any): Promise<any> {
    try {
      const response = await api.post<any>(`/api/workflows/${workflowId}/tasks/${taskId}/execute`, {
        taskType,
        inputData,
        config,
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to execute task ${taskId} for workflow ${workflowId}.`);
    }
  },

  /**
   * Fetches all results for a specific workflow.
   * @param workflowId The ID of the workflow.
   * @returns A Promise that resolves with an array of WorkflowResult objects.
   * @throws An error if fetching results fails.
   */
  async getWorkflowResults(workflowId: string): Promise<WorkflowResult[]> {
    try {
      const response = await api.get<WorkflowResult[]>(`/api/workflows/${workflowId}/results`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to fetch workflow results for ${workflowId}.`);
    }
  },

  /**
   * Fetches processing trends data for analytics.
   * @param period The time period for which to fetch trends (e.g., '7days', '30days').
   * @returns A Promise that resolves with an array of trend data.
   * @throws An error if fetching trends fails.
   */
  async getProcessingTrends(period: string): Promise<Array<{ period: string; completed: number; failed: number }>> {
    try {
      const response = await api.get<Array<{ period: string; completed: number; failed: number }>>(`/api/workflows/analytics/processing-trends?period=${period}`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch processing trends.');
    }
  },

  // REMOVED: getDataQualityDistribution is no longer a separate endpoint.
  // Its data is now part of the getAiInsightsAndDecisions response.

  /**
   * Fetches AI-generated insights and decisions, including comprehensive aggregated data.
   * @param period The time period for which to generate insights.
   * @returns A Promise that resolves with an AiInsightsAndDecisionsResponse object.
   * @throws An error if fetching insights fails.
   */
  async getAiInsightsAndDecisions(period: string, aiSettings: AiSettings): Promise<AiInsightsAndDecisionsResponse> {
    try {
      // Construct query parameters from aiSettings
      const params = new URLSearchParams({
        period: period,
        aiProvider: aiSettings.provider,
        aiModel: aiSettings.model,
        temperature: aiSettings.temperature.toString(),
        maxTokens: aiSettings.maxTokens.toString(),
      }).toString();

      const response = await api.get<AiInsightsAndDecisionsResponse>(`/api/workflows/analytics/insights?${params}`, {
        timeout: 300000, // <--- INCREASED TIMEOUT TO 5 MINUTES (300,000 ms)
      });
      logger.info('[WorkflowService] Received AI insights and decisions response:', response.data);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      logger.error('[WorkflowService] Error fetching AI insights and decisions:', axiosError);
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch AI insights and decisions.');
    }
  },

  /**
   * Saves an existing workflow as a template.
   * @param workflowId The ID of the workflow to save as a template.
   * @param templateData Partial WorkflowTemplate data (e.g., name, description, category).
   * @returns A Promise that resolves with the created WorkflowTemplate object.
   * @throws An error if saving the workflow as a template fails.
   */
  async saveAsTemplate(workflowId: string, templateData: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> {
    try {
      const response = await api.post<WorkflowTemplate>(`/api/workflows/${workflowId}/save-template`, templateData);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to save workflow as template.');
    }
  },

  /**
   * Fetches all workflow templates.
   * @returns A Promise that resolves with an array of WorkflowTemplate objects.
   * @throws An error if fetching templates fails.
   */
  async getAllWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    try {
      const response = await api.get<WorkflowTemplate[]>('/api/workflows/templates');
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch workflow templates.');
    }
  },
};