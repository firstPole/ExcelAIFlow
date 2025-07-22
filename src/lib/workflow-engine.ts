import { Task, Workflow } from '@/contexts/workflow-context';
import { ProcessedData } from './file-processor'; // Assuming ProcessedData is defined here
import api from './api'; // Assuming this 'api' is your configured axios instance

export interface WorkflowResult {
  taskId: string;
  status: 'completed' | 'failed';
  output?: any; // The raw output from the backend for this task
  error?: string;
  metrics?: {
    processingTime: number;
    recordsProcessed: number;
    errorsFound: number;
  };
}

export class WorkflowEngine {
  /**
   * Executes a single task by sending a request to the backend.
   * @param task The task configuration.
   * @param inputData The data to send as input for this task. This will be adjusted based on task type.
   * @param workflowId The ID of the parent workflow.
   * @returns A promise resolving to the WorkflowResult for this task.
   */
  private static async executeTask(
    task: Task, 
    inputData: any, // 'any' for flexibility, as it can be an array or a single object
    workflowId: string
  ): Promise<WorkflowResult> {
    try {
      const startTime = Date.now();
      
      const response = await api.post(`/api/workflows/${workflowId}/tasks/${task.id}/execute`, {
        taskType: task.type,
        inputData, // This inputData will now be precisely what the backend expects for this task type
        config: {
          agent: task.agent,
          description: task.description
        }
      });
      
      const processingTime = Date.now() - startTime;
      
      return {
        taskId: task.id,
        status: 'completed',
        output: response.data.output, // The raw output from the backend
        metrics: {
          processingTime,
          recordsProcessed: response.data.recordsProcessed || 0,
          errorsFound: response.data.errorsFound || 0
        }
      };
    } catch (error: any) { 
      console.error(`Error executing task ${task.id}:`, error);
      return {
        taskId: task.id,
        status: 'failed',
        error: error.response?.data?.message || error.message || 'Unknown error during task execution'
      };
    }
  }

  /**
   * Executes a sequence of tasks within a workflow, chaining outputs as inputs.
   * @param workflow The workflow object containing tasks.
   * @param initialInputData The initial data (e.g., uploaded files) for the first task.
   * @param onProgress Callback for progress updates.
   * @returns A promise resolving to an array of WorkflowResults for all executed tasks.
   */
  static async executeWorkflow(
    workflow: Workflow,
    initialInputData: ProcessedData[], // Initial input for the very first task (always an array of files)
    onProgress: (taskId: string, progress: number) => void
  ): Promise<WorkflowResult[]> {
    const results: WorkflowResult[] = [];
    // This variable will hold the *output* of the previous task, which becomes the *input* for the next.
    // It can be an array of ProcessedData objects, or a single ProcessedData object, or a ReportOutput object.
    let dataForNextTask: any = initialInputData; 

    for (let i = 0; i < workflow.tasks.length; i++) {
      const task = workflow.tasks[i];
      
      let currentTaskProgress = 0;
      onProgress(task.id, currentTaskProgress);
      
      const progressInterval = setInterval(() => {
        currentTaskProgress = Math.min(90, currentTaskProgress + Math.random() * 10 + 1);
        onProgress(task.id, currentTaskProgress);
      }, 500);

      try {
        let inputToSendToBackend: any;

        // Determine the exact format of inputData to send to the backend
        // based on the *current* task's type and the *previous* task's output (dataForNextTask).
        if (i === 0) {
          // The very first task always receives the initial array of uploaded file data.
          inputToSendToBackend = initialInputData;
        } else {
          // For subsequent tasks, adapt the dataForNextTask (output of previous task)
          // to the format expected by the current backend task type.
          switch (task.type) {
            case 'analyze': // Backend's analyze task expects an array of ProcessedData
            case 'clean':   // Backend's clean task expects an array of ProcessedData (analyzed files)
              // If dataForNextTask is already an array, pass it as is.
              // If it's a single object (e.g., from a previous 'merge' or 'validate' that somehow got here),
              // wrap it in an array to match the expected input for analyze/clean.
              inputToSendToBackend = Array.isArray(dataForNextTask) ? dataForNextTask : [dataForNextTask];
              break;
            case 'merge':   // Backend's merge task expects an array of ProcessedData (cleaned files)
              // The clean task output is always an array, so pass it directly.
              inputToSendToBackend = dataForNextTask;
              break;
            case 'validate': // Backend's validate task expects a single merged data object
            case 'report':   // Backend's report task expects a single validated data object
              // If dataForNextTask is an array containing a single item, unwrap it.
              // If it's already a single object, pass it directly.
              inputToSendToBackend = Array.isArray(dataForNextTask) && dataForNextTask.length === 1
                ? dataForNextTask[0]
                : dataForNextTask;
              break;
            default:
              // Fallback for any other task types, pass the data as is.
              console.warn(`Unknown task type '${task.type}'. Passing data as-is.`);
              inputToSendToBackend = dataForNextTask;
              break;
          }
        }

        const result = await this.executeTask(task, inputToSendToBackend, workflow.id);
        clearInterval(progressInterval);
        onProgress(task.id, 100);
        results.push(result);
        
        if (result.status === 'failed') {
          console.warn(`Workflow ${workflow.id} stopped due to failed task: ${task.id}`);
          break; 
        }
        
        // Update dataForNextTask with the output of the just-completed task.
        // This output will be the input for the *next* iteration (next task).
        if (result.output) {
          dataForNextTask = result.output;
        } else {
          console.warn(`Task ${task.id} completed without output. Next task will use previous input.`);
          // dataForNextTask remains unchanged from previous iteration if no output.
        }
      } catch (error: any) { 
        clearInterval(progressInterval);
        onProgress(task.id, 0); // Indicate failure
        results.push({
          taskId: task.id,
          status: 'failed',
          error: error.message || 'Unknown error during workflow execution step'
        });
        console.error(`Workflow ${workflow.id} failed during task ${task.id}:`, error);
        break; // Stop workflow on any unexpected error
      }
    }

    return results;
  }

  // This method is now effectively a no-op as results are saved by the backend's task execution endpoint.
  static async saveWorkflowResults(
    workflowId: string, 
    results: WorkflowResult[]
  ): Promise<void> {
    try {
      console.log(`Frontend: Skipping direct POST to /workflows/${workflowId}/results. Results are presumed to be handled by the workflow execution endpoint.`);
    } catch (error: any) { 
      console.error('Failed to save workflow results (if this API call were active):', error);
    }
  }
}
