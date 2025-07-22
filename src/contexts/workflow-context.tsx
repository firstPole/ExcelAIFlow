import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { WorkflowService } from '@/services/workflow.service';
import { ProcessedData } from '@/lib/file-processor'; // Keep if used elsewhere, not directly used in this snippet
import { FileService, UploadedFile } from '@/services/file.service'; // Keep if used elsewhere, not directly used in this snippet
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

export interface Task {
  id: string;
  name: string;
  description: string;
  type: 'clean' | 'merge' | 'analyze' | 'report' | 'validate';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  agent?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  createdAt: string;
  status: 'draft' | 'running' | 'completed' | 'failed';
  fileIds: string[];
  updatedAt?: string;
  results?: WorkflowResult[];
}

export interface WorkflowResult {
  id: string;
  workflowId: string;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: any; // The processed data/report from the task
  error: string | null; // Error message if task failed
  metrics: {
    recordsProcessed?: number;
    errorsFound?: string[];
    [key: string]: any; // Allow other metrics
  };
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface WorkflowContextType {
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  isLoadingWorkflows: boolean;
  createWorkflow: (name: string, description: string, tasks: Omit<Task, 'id' | 'status' | 'progress'>[], fileIds: string[]) => Promise<void>;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => Promise<void>;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  addFilesToWorkflow: (workflowId: string, newFileIds: string[]) => Promise<void>;
  runWorkflow: (workflowId: string) => Promise<void>;
  getWorkflowResults: (workflowId: string) => Promise<WorkflowResult[]>;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

const POLLING_INTERVAL = 3000; // Poll every 3 seconds

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);
  const pollingIntervals = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchWorkflows = useCallback(async () => {
    setIsLoadingWorkflows(true);
    try {
      console.log('[WorkflowContext] Fetching workflows...');
      const fetchedWorkflows = await WorkflowService.getWorkflows();
      setWorkflows(fetchedWorkflows);
      console.log('[WorkflowContext] Fetched workflows:', fetchedWorkflows);

      // Re-establish polling for any running workflows
      fetchedWorkflows.forEach(wf => {
        if (wf.status === 'running') {
          startPollingWorkflow(wf.id);
        }
      });

    } catch (error) {
      console.error('[WorkflowContext] Failed to fetch workflows:', error);
      toast.error('Failed to load workflows.');
    } finally {
      setIsLoadingWorkflows(false);
      console.log('[WorkflowContext] Finished workflow fetching.');
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();

    // Cleanup polling intervals on unmount
    return () => {
      console.log('[WorkflowContext] Cleaning up all polling intervals.');
      Object.values(pollingIntervals.current).forEach(clearInterval);
    };
  }, [fetchWorkflows]);

  // updateWorkflow is defined here, before startPollingWorkflow
  const updateWorkflow = useCallback((id: string, updates: Partial<Workflow>) => {
    setWorkflows(prev =>
      prev.map(wf => (wf.id === id ? { ...wf, ...updates } : wf))
    );
    if (currentWorkflow && currentWorkflow.id === id) {
      setCurrentWorkflow(prev => (prev ? { ...prev, ...updates } : null));
    }
    // No direct API call here, as this is often for local UI updates
    // The API call for status updates will be handled explicitly where needed (e.g., in runWorkflow, polling)
  }, [currentWorkflow]);


  const startPollingWorkflow = useCallback((workflowId: string) => {
    // Clear any existing interval for this workflow to prevent duplicates
    if (pollingIntervals.current[workflowId]) {
      clearInterval(pollingIntervals.current[workflowId]);
    }

    console.log(`[WorkflowContext] Starting polling for workflow: ${workflowId}`);
    pollingIntervals.current[workflowId] = setInterval(async () => {
      try {
        const updatedWorkflow = await WorkflowService.getWorkflow(workflowId);
        setWorkflows(prev =>
          prev.map(wf => (wf.id === workflowId ? updatedWorkflow : wf))
        );
        if (currentWorkflow && currentWorkflow.id === workflowId) {
          setCurrentWorkflow(updatedWorkflow);
        }

        const allTasksCompleted = updatedWorkflow.tasks.every(
          (task) => task.status === 'completed' || task.status === 'failed'
        );

        console.log(`[WorkflowContext] Polling update for ${workflowId}: ${updatedWorkflow.status} (${updatedWorkflow.tasks.length}) [${updatedWorkflow.tasks.map(t => t.progress).join(', ')}]`);

        // --- NEW LOGIC: Check if all tasks are completed and update overall workflow status ---
        if (allTasksCompleted && updatedWorkflow.status !== 'completed' && updatedWorkflow.status !== 'failed') {
          const anyTaskFailed = updatedWorkflow.tasks.some(task => task.status === 'failed');
          const newStatus = anyTaskFailed ? 'failed' : 'completed';

          console.log(`[WorkflowContext] All tasks for workflow ${workflowId} are done. Setting overall status to: ${newStatus}`);
          await WorkflowService.updateWorkflow(workflowId, { status: newStatus });

          // Fetch the workflow one last time to get the final status from DB
          const finalWorkflowState = await WorkflowService.getWorkflow(workflowId);
          setWorkflows(prev =>
            prev.map(wf => (wf.id === workflowId ? finalWorkflowState : wf))
          );
          if (currentWorkflow && currentWorkflow.id === workflowId) {
            setCurrentWorkflow(finalWorkflowState);
          }
          
          clearInterval(pollingIntervals.current[workflowId]);
          delete pollingIntervals.current[workflowId];
          toast.success(`Workflow "${finalWorkflowState.name}" ${newStatus}!`);
        }
        // --- END NEW LOGIC ---

      } catch (error: any) {
        console.error(`[WorkflowContext] Polling failed for workflow ${workflowId}:`, error);
        // Directly update state here instead of calling updateWorkflow to break potential circular dependency for linter
        setWorkflows(prev =>
          prev.map(wf => (wf.id === workflowId ? { ...wf, status: 'failed' } : wf))
        );
        if (currentWorkflow && currentWorkflow.id === workflowId) {
          setCurrentWorkflow(prev => prev ? { ...prev, status: 'failed' } : null);
        }

        if (pollingIntervals.current[workflowId]) {
          clearInterval(pollingIntervals.current[workflowId]);
          delete pollingIntervals.current[workflowId];
          toast.error(`Workflow "${workflowId}" polling stopped due to error.`);
        }
      }
    }, POLLING_INTERVAL);
  }, [currentWorkflow, setWorkflows, setCurrentWorkflow]); // Removed updateWorkflow from dependencies

  const createWorkflow = useCallback(async (name: string, description: string, tasks: Omit<Task, 'id' | 'status' | 'progress'>[], fileIds: string[]) => {
    try {
      const tasksWithIds = tasks.map(task => ({
        ...task,
        id: uuidv4(),
        status: 'pending' as const,
        progress: 0,
      }));

      const newWorkflow = {
        name,
        description,
        tasks: tasksWithIds,
        fileIds,
        status: 'draft' as const,
      };

      console.log('[WorkflowContext] Creating new workflow:', newWorkflow);
      const created = await WorkflowService.createWorkflow(newWorkflow);
      setWorkflows(prev => [...prev, created]);
      setCurrentWorkflow(created);
      console.log('[WorkflowContext] Workflow created:', created);
      toast.success('Workflow created successfully!');
    } catch (error: any) {
      console.error('[WorkflowContext] Failed to create workflow:', error);
      toast.error(`Failed to create workflow: ${error.message}`);
    }
  }, []);

  const deleteWorkflow = useCallback(async (id: string) => {
    try {
      await WorkflowService.deleteWorkflow(id);
      setWorkflows(prev => prev.filter(wf => wf.id !== id));
      if (currentWorkflow && currentWorkflow.id === id) {
        setCurrentWorkflow(null);
      }
      // Stop polling if deleted
      if (pollingIntervals.current[id]) {
        clearInterval(pollingIntervals.current[id]);
        delete pollingIntervals.current[id];
      }
      toast.success('Workflow deleted successfully.');
    } catch (error: any) {
      console.error('[WorkflowContext] Failed to delete workflow:', error);
      toast.error(`Failed to delete workflow: ${error.message}`);
    }
  }, [currentWorkflow]);

  const addFilesToWorkflow = useCallback(async (workflowId: string, newFileIds: string[]) => {
    try {
      const workflowToUpdate = workflows.find(wf => wf.id === workflowId);
      if (!workflowToUpdate) {
        throw new Error('Workflow not found for adding files.');
      }
      const updatedFileIds = [...new Set([...workflowToUpdate.fileIds, ...newFileIds])]; // Merge and deduplicate
      await WorkflowService.updateWorkflow(workflowId, { fileIds: updatedFileIds });
      updateWorkflow(workflowId, { fileIds: updatedFileIds }); // Update local state
      toast.success('Files added to workflow.');
    } catch (error: any) {
      console.error('[WorkflowContext] Failed to add files to workflow:', error);
      toast.error(`Failed to add files to workflow: ${error.message}`);
    }
  }, [workflows, updateWorkflow]);

  const runWorkflow = useCallback(async (workflowId: string) => {
    try {
      const workflowToRun = workflows.find(wf => wf.id === workflowId);
      if (!workflowToRun) {
        throw new Error('Workflow not found to run.');
      }

      // First, update overall workflow status to 'running' on the backend
      await WorkflowService.runWorkflow(workflowId); // This sets the overall status to 'running'
      updateWorkflow(workflowId, { status: 'running' }); // Update local state immediately

      startPollingWorkflow(workflowId); // Start polling right after initiating run

      // Execute tasks sequentially
      let currentInputData: any = workflowToRun.fileIds.map(fileId => {
        // Find the full file details from the uploadedFiles state (or fetch if not available)
        // For simplicity here, we'll just pass the fileId and let the backend fetch it.
        // In a real app, you might pass the initial processedData here if available.
        return { id: fileId }; // Pass file IDs as initial input
      });

      for (const task of workflowToRun.tasks) {
        if (task.status === 'completed' || task.status === 'failed') {
          console.log(`[WorkflowContext] Skipping already ${task.status} task: ${task.name}`);
          continue;
        }

        console.log(`[WorkflowContext] Executing task "${task.name}" (${task.id}) for workflow ${workflowId}`);
        try {
          const taskResult = await WorkflowService.executeTask(workflowId, task.id, task.type, currentInputData, {});
          
          // Update the local task status and progress
          setWorkflows(prevWorkflows =>
            prevWorkflows.map(wf =>
              wf.id === workflowId
                ? {
                    ...wf,
                    tasks: wf.tasks.map(t =>
                      t.id === task.id ? { ...t, status: taskResult.taskStatus, progress: taskResult.taskProgress } : t
                    ),
                  }
                : wf
            )
          );
          if (currentWorkflow && currentWorkflow.id === workflowId) {
            setCurrentWorkflow(prev => prev ? {
              ...prev,
              tasks: prev.tasks.map(t =>
                t.id === task.id ? { ...t, status: taskResult.taskStatus, progress: taskResult.taskProgress } : t
              ),
            } : null);
          }

          // The output of the current task becomes the input for the next
          currentInputData = taskResult.output;

        } catch (taskError: any) {
          console.error(`[WorkflowContext] Task "${task.name}" failed:`, taskError);
          toast.error(`Task "${task.name}" failed: ${taskError.message}`);
          // Update local task status to failed
          setWorkflows(prevWorkflows =>
            prevWorkflows.map(wf =>
              wf.id === workflowId
                ? {
                    ...wf,
                    tasks: wf.tasks.map(t =>
                      t.id === task.id ? { ...t, status: 'failed', progress: 0 } : t
                    ),
                  }
                : wf
            )
          );
          if (currentWorkflow && currentWorkflow.id === workflowId) {
            setCurrentWorkflow(prev => prev ? {
              ...prev,
              tasks: prev.tasks.map(t =>
                t.id === task.id ? { ...t, status: 'failed', progress: 0 } : t
              ),
            } : null);
          }
          // Stop further task execution if one fails
          break;
        }
      }
      console.log(`[WorkflowContext] All tasks for workflow ${workflowId} initiated.`);

      // The polling mechanism will now handle the final workflow status update to 'completed' or 'failed'
      // based on the individual task statuses.
    } catch (error: any) {
      console.error('[WorkflowContext] Failed to run workflow:', error);
      toast.error(`Failed to run workflow: ${error.message}`);
      updateWorkflow(workflowId, { status: 'failed' }); // Mark overall workflow as failed
      if (pollingIntervals.current[workflowId]) {
        clearInterval(pollingIntervals.current[workflowId]);
        delete pollingIntervals.current[workflowId];
      }
    }
  }, [workflows, updateWorkflow, startPollingWorkflow, currentWorkflow, setWorkflows, setCurrentWorkflow]); // Added setWorkflows, setCurrentWorkflow to dependencies

  const getWorkflowResults = useCallback(async (workflowId: string): Promise<WorkflowResult[]> => {
    try {
      console.log(`[WorkflowContext] Fetching results for workflow ${workflowId}...`);
      const results = await WorkflowService.getWorkflowResults(workflowId);
      console.log(`[WorkflowContext] Fetched results for workflow ${workflowId}:`, results);
      return results;
    } catch (error: any) {
      console.error(`[WorkflowContext] Failed to fetch workflow results for ${workflowId}:`, error);
      throw new Error(`Failed to fetch workflow results: ${error.message}`);
    }
  }, []);

  const contextValue: WorkflowContextType = {
    workflows,
    currentWorkflow,
    isLoadingWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    setCurrentWorkflow,
    addFilesToWorkflow,
    runWorkflow,
    getWorkflowResults
  };

  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}