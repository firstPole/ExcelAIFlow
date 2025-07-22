import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Clock,
  CheckCircle,
  AlertCircle,
  Bot,
  FileText,
  Database,
  TrendingUp,
  Shield,
  File,
  Loader2 // Import Loader2 for loading indicator
} from 'lucide-react';
import { useWorkflow, Task, Workflow } from '@/contexts/workflow-context'; // Import Workflow type
import { toast } from 'sonner';
// Removed FileProcessor and ProcessedData imports as direct file processing for new workflow creation is moved to Upload.tsx
// import { FileProcessor, ProcessedData } from '@/lib/file-processor';

const taskTypes = [
  { value: 'analyze', label: 'Analyze', icon: TrendingUp, description: 'Analyze data structure and patterns' },
  { value: 'clean', label: 'Clean', icon: Shield, description: 'Remove duplicates and fix formatting' },
  { value: 'merge', label: 'Merge', icon: Database, description: 'Combine multiple data sources' },
  { value: 'validate', label: 'Validate', icon: CheckCircle, description: 'Validate data quality' },
  { value: 'report', label: 'Report', icon: FileText, description: 'Generate insights and reports' }
];

const availableAgents = [
  'SchemaAgent',
  'CleaningAgent',
  'ValidationAgent',
  'MergeAgent',
  'AnalysisAgent',
  'ReportAgent'
];

export default function Workflows() {
  // Destructure isLoadingWorkflows from useWorkflow
  const { workflows, createWorkflow, deleteWorkflow, runWorkflow, isLoadingWorkflows } = useWorkflow();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    tasks: [] as Task[]
  });
  // Removed file states from here, as file upload for new workflows is handled in Upload.tsx
  // const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  // const [processedFilesData, setProcessedFilesData] = useState<ProcessedData[]>([]);

  const createNewWorkflow = async () => { // Made async to await createWorkflow
    if (!newWorkflow.name || newWorkflow.tasks.length === 0) {
      toast.error('Please provide a name and at least one task.');
      return;
    }

    try {
      // When creating a workflow from the Workflows page, it typically starts without files.
      // Files are added later or the workflow is created after files are uploaded (via Upload.tsx).
      // If you intend to attach files here, you would need an input for file IDs or a file upload mechanism.
      // For now, it will create a workflow with an empty fileIds array.
      await createWorkflow(newWorkflow.name, newWorkflow.description, newWorkflow.tasks, []); // Pass empty array for fileIds

      setNewWorkflow({ name: '', description: '', tasks: [] });
      // Clear file states if they were here
      // setUploadedFiles([]);
      // setProcessedFilesData([]);
      setIsCreateDialogOpen(false);
      // toast.success('Workflow created successfully'); // Toast handled by context
    } catch (error) {
      // Error toast handled by context
    }
  };

  const addTask = () => {
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Task',
      description: '',
      type: 'analyze', // Default type
      status: 'pending',
      progress: 0,
      agent: 'SchemaAgent' // Default agent
    };

    setNewWorkflow(prev => ({
      ...prev,
      tasks: [...prev.tasks, newTask]
    }));
  };

  const updateTask = (index: number, updates: Partial<Task>) => {
    setNewWorkflow(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, i) =>
        i === index ? { ...task, ...updates } : task
      )
    }));
  };

  const removeTask = (index: number) => {
    setNewWorkflow(prev => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index)
    }));
  };

  // Removed handleFileChange as file upload is now primarily handled in Upload.tsx
  // const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => { /* ... */ };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  // Show loading indicator if workflows are being fetched
  if (isLoadingWorkflows) {
    return (
      <div className="flex justify-center items-center h-screen text-lg text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading Workflows...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">
            Create and manage your data processing workflows
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Design a custom workflow with multiple AI agents
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Name</Label>
                <Input
                  id="workflow-name"
                  placeholder="Enter workflow name"
                  value={newWorkflow.name}
                  onChange={(e) => setNewWorkflow(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="workflow-description">Description</Label>
                <Textarea
                  id="workflow-description"
                  placeholder="Describe what this workflow does"
                  value={newWorkflow.description}
                  onChange={(e) => setNewWorkflow(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* Removed File Upload Section from here. Files should be uploaded via Upload.tsx */}
              {/* If you want to associate files when creating a workflow here, you'd need a way to select already uploaded files by their IDs */}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tasks</Label>
                  <Button variant="outline" size="sm" onClick={addTask}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Task
                  </Button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {newWorkflow.tasks.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">Add tasks to define your workflow steps.</p>
                  ) : (
                    newWorkflow.tasks.map((task, index) => (
                      <div key={task.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Input
                            placeholder="Task name"
                            value={task.name}
                            onChange={(e) => updateTask(index, { name: e.target.value })}
                            className="flex-1 mr-2"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTask(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={task.type}
                            onValueChange={(value) => updateTask(index, { type: value as any })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {taskTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center">
                                    <type.icon className="h-4 w-4 mr-2" />
                                    {type.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={task.agent}
                            onValueChange={(value) => updateTask(index, { agent: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAgents.map((agent) => (
                                <SelectItem key={agent} value={agent}>
                                  {agent}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Input
                          placeholder="Task description"
                          value={task.description}
                          onChange={(e) => updateTask(index, { description: e.target.value })}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createNewWorkflow}>
                Create Workflow
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Workflows Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(workflow.status)}
                  <CardTitle className="text-lg">{workflow.name}</CardTitle>
                </div>
                <Badge variant={
                  workflow.status === 'completed' ? 'default' :
                  workflow.status === 'running' ? 'secondary' :
                  workflow.status === 'failed' ? 'destructive' : 'outline'
                }>
                  {workflow.status}
                </Badge>
              </div>
              <CardDescription>{workflow.description}</CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tasks</span>
                  <span>{workflow.tasks.length}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Files</span>
                  <span>{workflow.fileIds ? workflow.fileIds.length : 0}</span> {/* Use fileIds.length */}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(workflow.createdAt).toLocaleDateString()}</span>
                </div>

                {workflow.status === 'running' && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Progress</div>
                    {workflow.tasks.map((task) => (
                      <div key={task.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{task.name}</span>
                          <span>{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} className="h-1" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex space-x-2">
                  {workflow.status === 'draft' && (
                    <Button
                      size="sm"
                      onClick={() => runWorkflow(workflow.id)} // Simplified call
                      className="flex-1"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Run
                    </Button>
                  )}

                  {workflow.status === 'running' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      disabled // Disable pause for now as functionality isn't implemented
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      Pause
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={workflow.status === 'running'} // Disable edit if running
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteWorkflow(workflow.id)}
                    disabled={workflow.status === 'running'} // Disable delete if running
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {workflows.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first workflow to start processing data with AI agents
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}