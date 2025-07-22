import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Upload as UploadIcon,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  Workflow // Import Workflow icon for clarity
} from 'lucide-react';
import { useWorkflow, Task } from '@/contexts/workflow-context'; // Import Task type
import { useNavigate } from 'react-router-dom';
import { FileService, UploadedFile } from '@/services/file.service'; // Import UploadedFile interface
import { FileProcessor, ProcessedData } from '@/lib/file-processor'; // Keep client-side processor for preview
import { toast } from 'sonner';

// Extend UploadedFileState to include the backend's UploadedFile object
interface UploadedFileState {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  id: string; // Temporary client-side ID
  backendFileId?: string; // ID from the backend after successful upload
  uploadedFileDetails?: UploadedFile; // Full details from backend after upload
  processedData?: ProcessedData; // Client-side processed data for preview
}

export default function Upload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileState[]>([]);
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false); // Renamed from isProcessing for clarity
  const { createWorkflow } = useWorkflow();
  const navigate = useNavigate();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFilesToAdd: UploadedFileState[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const,
      id: Math.random().toString(36).substr(2, 9), // Temporary client-side ID
    }));

    setUploadedFiles(prev => [...prev, ...newFilesToAdd]);

    for (const fileState of newFilesToAdd) {
      // --- NEW DEBUGGING LOGS ---
      console.log(`[Frontend] Preparing to upload file: ${fileState.file.name}, Size: ${fileState.file.size}, Type: ${fileState.file.type}`);
      console.log('[Frontend] File object details (from dropzone):', {
        name: fileState.file.name,
        size: fileState.file.size,
        type: fileState.file.type,
        lastModified: fileState.file.lastModified,
      });
      const testFormData = new FormData();
      testFormData.append('file', fileState.file);
      console.log('[Frontend] FormData contents (before send) - has "file" entry:', testFormData.has('file'));
      // --- END NEW DEBUGGING LOGS ---

      try {
        // 1. Upload file to backend
        const result = await FileService.uploadFile(
          fileState.file,
          (progress) => {
            setUploadedFiles(prev =>
              prev.map(f =>
                f.id === fileState.id ? { ...f, progress } : f
              )
            );
          }
        );

        // 2. Client-side processing for preview (optional, can be removed if not needed)
        const processedData = await FileProcessor.processFile(fileState.file);

        setUploadedFiles(prev =>
          prev.map(f =>
            f.id === fileState.id
              ? {
                  ...f,
                  status: 'completed',
                  progress: 100,
                  backendFileId: result.id, // Store the ID from the backend
                  uploadedFileDetails: result, // Store full backend details
                  processedData, // Client-side preview data
                }
              : f
          )
        );
        toast.success(`${fileState.file.name} uploaded and processed for preview.`);
      } catch (error: any) {
        setUploadedFiles(prev =>
          prev.map(f =>
            f.id === fileState.id
              ? { ...f, status: 'error', progress: 0 }
              : f
          )
        );
        console.error(`Error uploading or processing ${fileState.file.name}:`, error);
        toast.error(`Failed to upload ${fileState.file.name}: ${error.message || 'Unknown error'}`);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    onDrop,
  });

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
    // TODO: Optionally call FileService.deleteFile(backendFileId) here
    // if you want to immediately delete from backend on UI removal.
    // Be mindful of user intent vs. accidental deletion.
  };

  const createWorkflowFromFiles = async () => {
    const completedFiles = uploadedFiles.filter(f => f.status === 'completed' && f.backendFileId);
    if (completedFiles.length === 0) {
      toast.error('No successfully uploaded files to create a workflow from.');
      return;
    }

    setIsCreatingWorkflow(true);

    try {
      const fileIdsForWorkflow = completedFiles.map(f => f.backendFileId!); // Get backend IDs

      // Analyze uploaded files to suggest appropriate tasks
      const hasMultipleFiles = completedFiles.length > 1;

      let defaultTasks: Omit<Task, 'id' | 'status' | 'progress'>[] = [ // Use Omit for tasks to be created
        {
          name: 'Schema Analysis',
          description: 'Analyze file structure and data types',
          type: 'analyze',
          agent: 'SchemaAgent' // Assuming agent names are consistent
        },
        {
          name: 'Data Cleaning',
          description: 'Remove duplicates and fix formatting',
          type: 'clean',
          agent: 'CleaningAgent'
        }
      ];

      if (hasMultipleFiles) {
        defaultTasks.push({
          name: 'Data Merging',
          description: 'Combine data from multiple sources',
          type: 'merge',
          agent: 'MergeAgent'
        });
      }

      defaultTasks.push(
        {
          name: 'Data Validation',
          description: 'Validate data quality and completeness',
          type: 'validate',
          agent: 'ValidationAgent'
        },
        {
          name: 'Generate Report',
          description: 'Create insights and summary report',
          type: 'report',
          agent: 'ReportAgent'
        }
      );

      // Pass fileIds to the workflow creation, not the raw processedData
      await createWorkflow(
        `Processing ${completedFiles.length} file${completedFiles.length > 1 ? 's' : ''}`,
        `Automated processing of ${completedFiles.map(f => f.file.name).join(', ')}`,
        defaultTasks,
        fileIdsForWorkflow // Pass an array of backend file IDs
      );

      toast.success('Workflow created successfully!');
      navigate('/workflows'); // Redirect to workflows page to see the new workflow
    } catch (error: any) {
      console.error('Failed to create workflow:', error);
      toast.error(`Failed to create workflow: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    return <FileText className="h-5 w-5 text-blue-600" />;
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Upload Files</h1>
        <p className="text-muted-foreground">
          Upload Excel files (.xlsx, .xls) or CSV files to process with AI agents
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>File Upload</CardTitle>
          <CardDescription>
            Drag and drop files or click to select. Supports Excel (.xlsx, .xls) and CSV files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/10'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <UploadIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg font-medium">Drop the files here...</p>
            ) : (
              <div>
                <p className="text-lg font-medium mb-2">Drop files here or click to browse</p>
                <p className="text-sm text-muted-foreground">
                  Supports .xlsx, .xls, and .csv files up to 100MB each
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Files</CardTitle>
            <CardDescription>
              {uploadedFiles.length} file(s) uploaded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uploadedFiles.map((uploadedFile) => (
                <div key={uploadedFile.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                  <div className="flex-shrink-0">
                    {getFileIcon(uploadedFile.file.name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium truncate">{uploadedFile.file.name}</p>
                      <Badge variant={
                        uploadedFile.status === 'completed' ? 'default' :
                        uploadedFile.status === 'uploading' ? 'secondary' :
                        'destructive'
                      }>
                        {uploadedFile.status === 'uploading' && (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        )}
                        {uploadedFile.status === 'completed' && (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        )}
                        {uploadedFile.status === 'error' && (
                          <AlertCircle className="h-3 w-3 mr-1" />
                        )}
                        {uploadedFile.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{formatFileSize(uploadedFile.file.size)}</span>
                      <span>
                        {/* Safely access processedData */}
                        {uploadedFile.status === 'completed' && uploadedFile.processedData ? (
                          `${uploadedFile.processedData.metadata.rowCount} rows, ${uploadedFile.processedData.metadata.columnCount} columns`
                        ) : uploadedFile.status === 'uploading' ? (
                          `${uploadedFile.progress}%`
                        ) : uploadedFile.status === 'error' ? (
                          'Upload failed'
                        ) : null}
                      </span>
                    </div>
                    {uploadedFile.status === 'uploading' && (
                      <Progress value={uploadedFile.progress} className="h-2 mt-2" />
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadedFile.id)}
                    disabled={uploadedFile.status === 'uploading'} // Prevent removal during upload
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {uploadedFiles.some(f => f.status === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>
              Create a workflow to process your uploaded files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <Button
                onClick={createWorkflowFromFiles}
                disabled={isCreatingWorkflow}
              >
                {isCreatingWorkflow ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Workflow...
                  </>
                ) : (
                  <>
                    <Workflow className="mr-2 h-4 w-4" /> {/* Use Workflow icon */}
                    Create Workflow
                  </>
                )}
              </Button>
              <Button variant="outline" disabled={isCreatingWorkflow}>
                Use Template (Coming Soon)
              </Button>
            </div>

            {/* Safely filter and map for File Analysis Summary */}
            {uploadedFiles.some(f => f.status === 'completed' && f.processedData) && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">File Analysis Summary</h4>
                <div className="space-y-2 text-sm">
                  {uploadedFiles
                    .filter(f => f.status === 'completed' && f.processedData)
                    .map(f => (
                      <div key={f.id} className="flex justify-between">
                        <span>{f.file.name}</span>
                        <span className="text-muted-foreground">
                          {/* Safely access metadata properties */}
                          {f.processedData!.metadata.rowCount} rows × {f.processedData!.metadata.columnCount} columns
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* File Preview */}
      {uploadedFiles.some(f => f.status === 'completed' && f.processedData) && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
            <CardDescription>
              Preview of your uploaded data (showing first file)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Safely filter and map for File Preview */}
            {uploadedFiles
              .filter(f => f.status === 'completed' && f.processedData)
              .slice(0, 1) // Show preview for first successfully processed file only
              .map(f => (
                <div key={f.id} className="space-y-2">
                  <h4 className="font-medium">{f.file.name}</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-border">
                      <thead>
                        <tr className="bg-muted/50">
                          {/* Safely access headers */}
                          {f.processedData!.headers.slice(0, 6).map((header: string, index: number) => (
                            <th key={index} className="border border-border px-3 py-2 text-left text-sm font-medium">
                              {header}
                            </th>
                          ))}
                          {f.processedData!.headers.length > 6 && (
                            <th className="border border-border px-3 py-2 text-left text-sm font-medium">
                              ... +{f.processedData!.headers.length - 6} more
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Safely access rows */}
                        {f.processedData!.rows.slice(0, 5).map((row: any[], rowIndex: number) => (
                          <tr key={rowIndex} className="hover:bg-muted/25">
                            {row.slice(0, 6).map((cell: any, cellIndex: number) => (
                              <td key={cellIndex} className="border border-border px-3 py-2 text-sm">
                                {String(cell || '').substring(0, 50)}
                                {String(cell || '').length > 50 && '...'}
                              </td>
                            ))}
                            {row.length > 6 && (
                              <td className="border border-border px-3 py-2 text-sm text-muted-foreground">
                                ...
                              </td>
                            )}
                          </tr>
                        ))}
                        {/* REMOVED THE EXTRA ')}' HERE */}
                        {f.processedData!.rows.length > 5 && (
                          <tr>
                            <td colSpan={Math.min(7, f.processedData!.headers.length)} className="border border-border px-3 py-2 text-sm text-muted-foreground text-center">
                              ... +{f.processedData!.rows.length - 5} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}