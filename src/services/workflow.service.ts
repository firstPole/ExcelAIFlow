import api from '@/lib/api'; // Assuming 'api' is an Axios instance configured with interceptors
import { AxiosError } from 'axios'; // Import AxiosError for type safety

// Assuming these interfaces are defined in workflow-context.tsx or a shared types file
// Re-importing them here for clarity in this service file
import { Workflow, Task } from '@/contexts/workflow-context'; // Or from a central types file
import { ProcessedData } from '@/lib/file-processor';

// WorkflowResult is likely from workflow-engine, but if it's a backend DTO, define it here
export interface WorkflowResult {
  taskId: string;
  taskName: string;
  type: string;
  status: 'completed' | 'running' | 'failed';
  output: any; // Consider a more specific type if known
  recordsProcessed?: number;
  errorsFound?: any[]; // Consider a more specific type if known
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
  order?: number; // Client can suggest an order
  inputFiles?: string[];
  outputFiles?: string[];
  sourceFile?: string;
  targetFile?: string;
}

// Define what a Workflow looks like when creating it (sent to backend)
// It will not have 'id', 'createdAt', 'status', 'updatedAt', 'lastRunAt', 'ownerId', 'results' as these are assigned by backend
export interface CreateWorkflowDto {
  name: string;
  description: string;
  tasks: CreateTaskDto[]; // Use the DTO for tasks
  files?: ProcessedData[]; // Files might be associated during creation
}
// Interface for AI Insights
export interface AiInsight {
  type: string; // e.g., 'product_performance', 'region_performance', 'sales_trend', 'error_anomaly'
  title: string;
  description: string;
  data?: any; // Optional: structured data supporting the insight
}

// New Interface for Decision Recommendations
export interface DecisionRecommendation {
  recommendation: string;
  rationale: string;
  urgency: 'high' | 'medium' | 'low';
  category: 'marketing' | 'sales' | 'operations' | 'data_quality';
  insightId?: string; // Optional: link to the insight it's based on
}

// Interface for the combined response from the new insights endpoint
export interface AiInsightsAndDecisionsResponse {
  insights: AiInsight[];
  decisions: DecisionRecommendation[];
}

export class WorkflowService {

  /**
   * Creates a new workflow on the backend.
   * @param workflowData The data for the new workflow, conforming to CreateWorkflowDto.
   * @returns A Promise that resolves with the created Workflow object from the backend.
   * @throws An error if the workflow creation fails.
   */
  static async createWorkflow(workflowData: CreateWorkflowDto): Promise<Workflow> {
    try {
      const response = await api.post<Workflow>('/api/workflows', workflowData);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to create workflow. Please check your input.');
    }
  }

  /**
   * Fetches the results for a specific workflow.
   * @param workflowId The ID of the workflow.
   * @returns A Promise that resolves with an array of WorkflowResult objects.
   * @throws An error if fetching workflow results fails.
   */
  static async getWorkflowResults(workflowId: string): Promise<WorkflowResult[]> {
    try {
      const response = await api.get<WorkflowResult[]>(`/api/workflows/${workflowId}/results`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to fetch results for workflow ${workflowId}.`);
    }
  }

  /**
   * Fetches all workflows for the authenticated user.
   * @returns A Promise that resolves with an array of Workflow objects.
   * @throws An error if fetching workflows fails.
   */
  static async getWorkflows(): Promise<Workflow[]> {
    try {
      const response = await api.get<Workflow[]>('/api/workflows');
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      // In production, you typically want to throw the error for the calling component to handle.
      // Returning an empty array might hide issues.
      console.error('Failed to fetch workflows:', axiosError.message, axiosError.response?.data);
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch workflows. Please try again later.');
    }
  }

  /**
   * Fetches a single workflow by its ID.
   * @param id The ID of the workflow.
   * @returns A Promise that resolves with the Workflow object.
   * @throws An error if the workflow is not found or fetching fails.
   */
  static async getWorkflow(id: string): Promise<Workflow> {
    try {
      const response = await api.get<Workflow>(`/api/workflows/${id}`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to fetch workflow with ID: ${id}.`);
    }
  }

  /**
   * Updates an existing workflow.
   * @param id The ID of the workflow to update.
   * @param updates A partial Workflow object containing the fields to update.
   * @returns A Promise that resolves with the updated Workflow object from the backend.
   * @throws An error if updating the workflow fails.
   */
  static async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    try {
      const response = await api.put<Workflow>(`/api/workflows/${id}`, updates);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to update workflow with ID: ${id}.`);
    }
  }

  /**
   * Deletes a workflow by its ID.
   * @param id The ID of the workflow to delete.
   * @returns A Promise that resolves when the workflow is successfully deleted.
   * @throws An error if deleting the workflow fails.
   */
  static async deleteWorkflow(id: string): Promise<void> {
    try {
      await api.delete(`/api/workflows/${id}`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to delete workflow with ID: ${id}.`);
    }
  }

  static async runWorkflow(workflowId: string): Promise<void> {
    try {
      // The backend endpoint /api/workflows/:workflowId/execute is designed to initiate the run
      await api.post(`/api/workflows/${workflowId}/execute`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to initiate workflow run');
    }
  }

  /**
   * Initiates the execution of a workflow on the backend.
   * @param id The ID of the workflow to execute.
   * @returns A Promise that resolves when the execution request is successfully sent.
   * @throws An error if initiating workflow execution fails.
   */
  static async executeWorkflow(id: string): Promise<void> {
    try {
      await api.post(`/api/workflows/${id}/execute`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || `Failed to execute workflow with ID: ${id}.`);
    }
  }

  static async executeTask(
    workflowId: string,
    taskId: string,
    taskType: Task['type'], // Use the Task type for taskType
    inputData: any, // Input data for the task (e.g., processed file data)
    config: any = {} // Optional configuration for the task
  ): Promise<any> {
    try {
      console.log(`[WorkflowService] Calling backend to execute task ${taskId} for workflow ${workflowId}`);
      const response = await api.post(`/api/workflows/${workflowId}/tasks/${taskId}/execute`, {
        taskType,
        inputData,
        config
      });
      return response.data;
    } catch (error: any) {
      console.error(`[WorkflowService] Error executing task ${taskId}:`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || `Failed to execute task ${taskId}`);
    }
  }
  /**
   * Fetches available workflow templates.
   * @returns A Promise that resolves with an array of WorkflowTemplate objects.
   * @throws An error if fetching workflow templates fails.
   */
  static async getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    try {
      const response = await api.get<WorkflowTemplate[]>('/api/workflows/templates');
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch workflow templates.');
    }
  }

// --- NEW ANALYTICS METHODS ---

  /**
   * Fetches processing trends data for analytics charts.
   * @param period The time period (e.g., '7days', '30days', '6months', '12months').
   * @returns A promise resolving to an array of trend data.
   */
  static async getProcessingTrends(period: string = '7days'): Promise<Array<{ period: string; completed: number; failed: number }>> {
    try {
      const response = await api.get<Array<{ period: string; completed: number; failed: number }>>(`/api/workflows/analytics/processing-trends`, {
        params: { period }
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch processing trends');
    }
  }
  /**
   * Fetches data quality distribution data for analytics charts.
   * @param period The time period (e.g., '7days', '30days', '6months', '12months').
   * @returns A promise resolving to an object with quality distribution data.
   */
  static async getDataQualityDistribution(period: string = '30days'): Promise<{
    totalCompletedTasks: number;
    totalRecordsProcessed: number;
    totalErrorsFound: number;
    errorDistribution: Array<{ name: string; value: number }>;
    rawErrorCounts: { [key: string]: number };
  }> {
    try {
      const response = await api.get<any>(`/api/workflows/analytics/quality-distribution`, {
        params: { period }
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch data quality distribution');
    }
  }

  /**
   * Fetches AI-generated insights AND decisions based on analytics data.
   * @param period The time period for which to generate insights.
   * @returns A Promise that resolves with an AiInsightsAndDecisionsResponse object.
   * @throws An error if fetching insights fails.
   */
  static async getAiInsightsAndDecisions(period: string): Promise<AiInsightsAndDecisionsResponse> {
    try {
      const response = await api.get<AiInsightsAndDecisionsResponse>(`/api/workflows/analytics/insights?period=${period}`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch AI insights and decisions.');
    }
  }

  //  /**
  //  * Fetches AI-generated insights based on analytics data.
  //  * @param period The time period for which to generate insights.
  //  * @returns A Promise that resolves with an array of AiInsight objects.
  //  * @throws An error if fetching insights fails.
  //  */
  // static async getAiInsights(period: string): Promise<AiInsight[]> {
  //   try {
  //     const response = await api.get<AiInsight[]>(`/api/workflows/analytics/insights?period=${period}`);
  //     return response.data;
  //   } catch (error: unknown) {
  //     const axiosError = error as AxiosError<{ message?: string; code?: string }>;
  //     throw new Error(axiosError.response?.data?.message || 'Failed to fetch AI insights.');
  //   }
  // }

  /**
   * Saves an existing workflow as a template.
   * @param workflowId The ID of the workflow to save as a template.
   * @param templateData Partial WorkflowTemplate data (e.g., name, description, category).
   * @returns A Promise that resolves with the created WorkflowTemplate object.
   * @throws An error if saving the workflow as a template fails.
   */
  static async saveAsTemplate(workflowId: string, templateData: Partial<WorkflowTemplate>): Promise<WorkflowTemplate> {
    try {
      const response = await api.post<WorkflowTemplate>(`/api/workflows/${workflowId}/save-template`, templateData);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to save workflow as template.');
    }
  }
}