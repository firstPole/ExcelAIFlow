import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  Eye,
  FileText,
  BarChart3,
  Table,
  Search,
  Filter,
  Calendar,
  CheckCircle,
  AlertCircle,
  Clock,
  X, // For close button in modals
  Bug, // New icon for errors
  Loader2,
  Bot,
  Lightbulb, // For insights
  Megaphone // For decisions/recommendations
} from 'lucide-react';
import { useWorkflow } from '@/contexts/workflow-context';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { WorkflowService, AiInsight, DecisionRecommendation } from '@/services/workflow.service';
import { toast } from 'sonner'; // Import toast for notifications

// Define the type for the processed workflow results to be displayed in the main list
interface WorkflowResultDisplay {
  id: string;
  workflowName: string;
  type: string; // e.g., 'report', 'merged_data', 'cleaned_data', 'analyze_data'
  status: 'draft' | 'running' | 'completed' | 'failed' | string;
  createdAt: string;
  fileSize: string; // Still N/A from backend, but kept for consistency
  recordCount: number; // totalProcessedRecords from report output
  errorCount: number; // issuesFound from report output
  description: string;
  actualOutput: any; // The full parsed output of the last executed task (e.g., the report object)
  // New property to store the raw error details if available
  errorDetails?: string[] | null;
}

// Define the structure for the Report task's output
interface ReportOutput {
  reportTitle: string;
  generationDate: string;
  totalProcessedRecords: number;
  summaryText: string;
  charts: Array<{
    type: 'bar' | 'pie';
    title: string;
    data: Array<{ label: string; value: number } | { name: string; value: number }>;
  }>;
  headers: string[];
  rows: any[][];
  reportIssues: string[];
  metadata: {
    rowCount: number;
    columnCount: number;
    fileType: string;
    hasHeaders: boolean;
    reportGenerated: boolean;
    totalRevenue: number;
    issuesFound: number;
  };
}

// Define the structure for general tabular data output (e.g., from merge, clean, validate)
interface TabularOutput {
    headers: string[];
    rows: any[][];
    metadata?: {
        rowCount: number;
        columnCount: number;
        fileType?: string;
        hasHeaders?: boolean;
        [key: string]: any; // Allow other metadata properties
    };
    message?: string; // For simple message outputs
    summary?: string; // For analysis summary
    analysisIssues?: string[]; // For analysis issues
    cleaningReport?: any; // For cleaning report details
    validationIssues?: any[]; // For validation issues
    validRecordsCount?: number;
    invalidRecordsCount?: number;
}

// --- Modal Components ---

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TabularOutput;
}

const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;

  const headers = data.headers || [];
  const rows = data.rows || [];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <Card className="max-w-4xl w-full max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xl">Processed Data Preview</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          <div className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
            {headers.length > 0 && rows.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map((header: string, index: number) => (
                      <th key={index} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row: any[], rowIndex: number) => (
                    <tr key={rowIndex}>
                      {row.map((cell: any, cellIndex: number) => (
                        <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{String(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No tabular data available for preview.</p>
            )}
          </div>
          {/* Display other relevant info if data is not just tabular (e.g., analysis summary, cleaning report) */}
          {data.summary && <p className="mt-4 text-sm text-gray-700">Summary: {data.summary}</p>}
          {data.analysisIssues && data.analysisIssues.length > 0 && (
            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-700">
                <h4 className="font-semibold">Analysis Issues:</h4>
                <ul className="list-disc pl-5">
                    {data.analysisIssues.map((issue: string, index: number) => <li key={index}>{issue}</li>)}
                </ul>
            </div>
          )}
          {data.cleaningReport && (
            <div className="mt-4 bg-blue-50 border-l-4 border-blue-400 p-3 text-sm text-blue-700">
                <h4 className="font-semibold">Cleaning Report:</h4>
                <p>Changes Made: {data.cleaningReport.changesMade}</p>
                <p>Issues Found: {data.cleaningReport.issuesFound}</p>
                {data.cleaningReport.details && data.cleaningReport.details.length > 0 && (
                    <ul className="list-disc pl-5">
                        {data.cleaningReport.details.map((detail: string, index: number) => <li key={index}>{detail}</li>)}
                    </ul>
                )}
            </div>
          )}
          {data.validationIssues && data.validationIssues.length > 0 && (
            <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-700">
                <h4 className="font-semibold">Validation Issues:</h4>
                <ul className="list-disc pl-5">
                    {data.validationIssues.map((issue: any, index: number) => (
                        <li key={index}>Row {issue.row}: {issue.issues.join('; ')}</li>
                    ))}
                </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: ReportOutput;
}

const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, reportData }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <Card className="max-w-5xl w-full max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xl">{reportData.reportTitle || 'Report'}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          <p className="text-muted-foreground mb-2">Generated: {reportData.generationDate}</p>
          <p className="text-gray-700 mb-4">{reportData.summaryText}</p>

          {reportData.reportIssues && reportData.reportIssues.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Report Issues</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <ul role="list" className="list-disc pl-5 space-y-1">
                      {reportData.reportIssues.map((issue: string, index: number) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chart Rendering */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {reportData.charts?.map((chart: any, index: number) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{chart.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    {chart.type === 'bar' ? (
                      <BarChart data={chart.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" fill="#8884d8" />
                      </BarChart>
                    ) : chart.type === 'pie' ? (
                      <PieChart>
                        <Pie
                          data={chart.data}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {chart.data.map((entry: any, cellIndex: number) => (
                            <Cell key={`cell-${cellIndex}`} fill={entry.color || ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'][cellIndex % 4]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-8">Unsupported chart type or no data.</p>
                    )}
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Raw Data Preview for Report (Optional) */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Underlying Report Data</h3>
            <div className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
              {reportData.headers && reportData.headers.length > 0 && reportData.rows && reportData.rows.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {reportData.headers.map((header: string, index: number) => (
                        <th key={index} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.rows.map((row: any[], rowIndex: number) => (
                      <tr key={rowIndex}>
                        {row.map((cell: any, cellIndex: number) => (
                          <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No tabular data available in report output.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface ErrorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: string[];
}

const ErrorDetailsModal: React.FC<ErrorDetailsModalProps> = ({ isOpen, onClose, errors }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <Card className="max-w-xl w-full max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xl flex items-center">
            <Bug className="h-5 w-5 mr-2 text-red-500" />
            Workflow Errors
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          {errors.length > 0 ? (
            <ul className="list-disc pl-5 space-y-2 text-sm text-red-700">
              {errors.map((error, index) => (
                <li key={index} className="bg-red-50 p-2 rounded-md border border-red-200">
                  {error}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No detailed error messages available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


// --- Main Results Component ---

export default function Results() {
  const { workflows } = useWorkflow(); // This line is crucial, ensure it's here
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actualResults, setActualResults] = useState<WorkflowResultDisplay[]>([]);

  // State for modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isErrorDetailsModalOpen, setIsErrorDetailsModalOpen] = useState(false); // New state for error modal
  const [selectedWorkflowOutput, setSelectedWorkflowOutput] = useState<any>(null);
  const [selectedErrorDetails, setSelectedErrorDetails] = useState<string[] | null>(null); // New state for error details
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  
  // --- UPDATED STATE FOR ANALYTICS AND INSIGHTS DATA ---
  const [processingTrends, setProcessingTrends] = useState<Array<{ period: string; completed: number; failed: number }>>([]);
  const [dataQualityDistribution, setDataQualityDistribution] = useState<Array<{ name: string; value: number }>>([]);
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]); // Now uses the updated AiInsight interface
  const [decisionRecommendations, setDecisionRecommendations] = useState<DecisionRecommendation[]>([]); // New state for decisions
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30days'); // Default period for analytics
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true); // Loading state for all analytics/insights/decisions


  useEffect(() => {
    // --- START NEW LOGS ---
    console.log("Frontend Debug: useEffect triggered, current workflows:", workflows);
    // --- END NEW LOGS ---

    const fetchWorkflowResults = async () => {
      setIsLoading(true);
      setError(null);
      const fetchedResults: WorkflowResultDisplay[] = [];

      // Loop through each completed workflow to fetch its results from the new table
      for (const workflow of workflows) {
        // --- START NEW LOGS ---
        console.log(`Frontend Debug: Processing workflow ID: ${workflow.id}, Name: ${workflow.name}, Status: ${workflow.status}`);
        // --- END NEW LOGS ---

        // Only fetch results for completed workflows
        if (workflow.status === 'completed' && workflow.id) {
          try {
            // Use WorkflowService to fetch results, which uses Axios with auth interceptors
            const resultsData = await WorkflowService.getWorkflowResults(workflow.id);

            // --- START NEW LOGS ---
            console.log(`Frontend Debug: Raw resultsData for workflow ${workflow.id}:`, resultsData);
            // --- END NEW LOGS ---

            // resultsData will be an array of objects from workflow_results table
            // We usually care about the LATEST result for a given workflow for display
            // Find the latest completed task result
            const latestResult = resultsData
                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .find((r: any) => r.status === 'completed');

            // --- START NEW LOGS ---
            console.log(`Frontend Debug: Latest completed result for workflow ${workflow.id}:`, latestResult);
            // --- END NEW LOGS ---

            if (latestResult && latestResult.output) {
                let parsedOutput: any = latestResult.output;
                // The output from WorkflowService.getWorkflowResults should already be parsed JSON
                // No need for JSON.parse(parsedOutput) here unless the backend is sending it as a string
                // If it's still a string, add the try-catch block back.
                // For now, assuming it's already an object based on the WorkflowResult interface.

                // --- START NEW LOGS ---
                console.log(`Frontend Debug: Parsed output for workflow ${workflow.id}:`, parsedOutput);
                // --- END NEW LOGS ---

                // Now, infer type and counts based on the structure of parsedOutput (similar to your existing logic)
                let recordCount = 0;
                let errorCount = 0;
                let resultType = 'unknown';
                let errorDetails: string[] = []; // Initialize error details array

                if (parsedOutput) {
                    if (parsedOutput.reportGenerated) { // This is the output from the 'report' task
                        recordCount = parsedOutput.totalProcessedRecords || 0;
                        errorCount = parsedOutput.metadata?.issuesFound || 0;
                        resultType = 'report';
                        if (parsedOutput.reportIssues && Array.isArray(parsedOutput.reportIssues)) {
                            errorDetails = parsedOutput.reportIssues;
                        }
                    } else if (parsedOutput.metadata?.merged) { // Output from 'merge' task
                        recordCount = parsedOutput.metadata.rowCount || 0;
                        errorCount = parsedOutput.metadata.issuesFound || 0;
                        resultType = 'merged_data';
                        if (parsedOutput.mergeIssues && Array.isArray(parsedOutput.mergeIssues)) {
                            errorDetails = parsedOutput.mergeIssues;
                        }
                    } else if (Array.isArray(parsedOutput)) { // Output from 'analyze' or 'clean' tasks (array of file data)
                        recordCount = parsedOutput.reduce((sum: number, fileData: any) => sum + (fileData.metadata?.rowCount || 0), 0);
                        errorCount = parsedOutput.reduce((sum: number, fileData: any) => sum + (fileData.metadata?.issuesFound || 0), 0);
                        if (parsedOutput[0]?.metadata?.analyzed) {
                            resultType = 'analyze_data';
                            errorDetails = parsedOutput.flatMap((item: any) => item.analysisIssues || []);
                        }
                        else if (parsedOutput[0]?.metadata?.cleaned) {
                            resultType = 'cleaned_data';
                            errorDetails = parsedOutput.flatMap((item: any) => item.cleaningReport?.details || []);
                        }
                        else resultType = 'unknown_array_data';
                    } else if (parsedOutput.metadata?.validated) { // Output from 'validate' task
                        recordCount = parsedOutput.validRecordsCount || 0;
                        errorCount = parsedOutput.invalidRecordsCount || 0;
                        resultType = 'validated_data';
                        if (parsedOutput.validationIssues && Array.isArray(parsedOutput.validationIssues)) {
                            errorDetails = parsedOutput.validationIssues.flatMap((issue: any) => issue.issues || []);
                        }
                    } else if (parsedOutput.metadata?.analyzed) { // Output from 'analyze' task (single file)
                        recordCount = parsedOutput.metadata.rowCount || 0;
                        errorCount = parsedOutput.metadata.issuesFound || 0;
                        resultType = 'analyze_data';
                        if (parsedOutput.analysisIssues && Array.isArray(parsedOutput.analysisIssues)) {
                            errorDetails = parsedOutput.analysisIssues;
                        }
                    } else if (parsedOutput.metadata?.cleaned) { // Output from 'clean' task (single file)
                        recordCount = parsedOutput.metadata.rowCount || 0;
                        errorCount = parsedOutput.metadata.issuesFound || 0;
                        resultType = 'cleaned_data';
                        if (parsedOutput.cleaningReport?.details && Array.isArray(parsedOutput.cleaningReport.details)) {
                            errorDetails = parsedOutput.cleaningReport.details;
                        }
                    } else if (parsedOutput.message) { // Generic message output
                        recordCount = 0;
                        errorCount = 0;
                        resultType = 'message';
                    }
                }

                // Also check the 'error' field from the workflow_results table directly
                // Ensure latestResult.error is an array before concatenating
                if (latestResult.error && Array.isArray(latestResult.error)) {
                    errorDetails = errorDetails.concat(latestResult.error);
                } else if (latestResult.error && typeof latestResult.error === 'string') {
                    // If it's a string, try to parse it as JSON
                    try {
                        const parsedRawError = JSON.parse(latestResult.error);
                        if (Array.isArray(parsedRawError)) {
                            errorDetails = errorDetails.concat(parsedRawError);
                        } else if (typeof parsedRawError === 'string') {
                            errorDetails.push(parsedRawError); // Add as a single string error
                        }
                    } catch (parseErr) {
                        errorDetails.push(`Raw error (unparseable): ${latestResult.error}`);
                    }
                }


                const newResultEntry = {
                    id: workflow.id, // Still use workflow ID as the primary ID for the display item
                    workflowName: workflow.name,
                    type: resultType,
                    status: workflow.status, // Use workflow status
                    createdAt: workflow.createdAt, // Use workflow creation date
                    fileSize: 'N/A', // Still N/A if not available elsewhere
                    recordCount: recordCount,
                    errorCount: errorCount,
                    description: workflow.description,
                    actualOutput: parsedOutput, // Store the parsed output for modals
                    errorDetails: errorDetails.length > 0 ? errorDetails : null // Store collected error details
                };

                // --- START NEW LOGS ---
                console.log(`Frontend Debug: Prepared WorkflowResultDisplay entry:`, newResultEntry);
                // --- END NEW LOGS ---

                fetchedResults.push(newResultEntry);
            }
          } catch (err) {
            console.error(`Frontend Debug: Error fetching results for workflow ${workflow.id}:`, err);
            setError(`Failed to load some results. Please try again.`);
          }
        }
      }
      setActualResults(fetchedResults);
      setIsLoading(false);
      // --- START NEW LOGS ---
      console.log("Frontend Debug: Final fetchedResults set to state:", fetchedResults);
      // --- END NEW LOGS ---
    };

    if (workflows && workflows.length > 0) {
        fetchWorkflowResults();
    } else {
        setIsLoading(false);
        setActualResults([]); // No workflows to process
        // --- START NEW LOGS ---
        console.log("Frontend Debug: No workflows to process, setting actualResults to empty.");
        // --- END NEW LOGS ---
    }
  }, [workflows]); // Re-run when the list of workflows changes

  // --- NEW useEffect for fetching analytics data ---
// --- UPDATED useEffect for fetching analytics data, insights, AND decisions ---
useEffect(() => {
  const fetchAllAnalyticsData = async () => {
    setIsLoadingAnalytics(true); // Start loading for all analytics tabs

    try {
      // Fetch Processing Trends
      const trends = await WorkflowService.getProcessingTrends(analyticsPeriod);
      setProcessingTrends(trends);

      // Fetch Data Quality Distribution
      const qualityData = await WorkflowService.getDataQualityDistribution(analyticsPeriod);
      setDataQualityDistribution(qualityData.errorDistribution);

      // Fetch AI Insights and Decisions using the new consolidated service method
      const { insights, decisions } = await WorkflowService.getAiInsightsAndDecisions(analyticsPeriod);

      // Update states
      setAiInsights(insights);
      setDecisionRecommendations(decisions);

      toast.success('Analytics data, insights, and decisions refreshed!');
    } catch (error: any) {
      console.error('Error fetching analytics data, insights, or decisions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred.';
      toast.error(`Error fetching analytics data: ${errorMessage}`);
      // On error, clear previous insights/decisions to avoid showing stale data
      setAiInsights([]);
      setDecisionRecommendations([]);
    } finally {
      setIsLoadingAnalytics(false); // End loading for all analytics tabs
    }
  };

  fetchAllAnalyticsData();
}, [analyticsPeriod]);
  const filteredResults = actualResults.filter(result => {
    const matchesSearch = result.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          result.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || result.type === filterType;
    const matchesStatus = filterStatus === 'all' || result.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing': // Assuming 'running' status from backend maps to 'processing' in UI
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cleaned_data':
        return <Table className="h-4 w-4 text-blue-600" />;
      case 'report':
        return <FileText className="h-4 w-4 text-green-600" />;
      case 'merged_data':
        return <BarChart3 className="h-4 w-4 text-purple-600" />;
      case 'analyze_data':
        return <Eye className="h-4 w-4 text-orange-600" />;
      case 'validated_data': // New type for validation output
        return <CheckCircle className="h-4 w-4 text-indigo-600" />;
      case 'message':
        return <FileText className="h-4 w-4 text-gray-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatFileSize = (size: string) => size; // Placeholder, as file size is 'N/A' from backend

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return date.toLocaleDateString();
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid Date";
    }
  };

  // --- Button Handlers ---
  const handlePreview = (output: any) => {
    setSelectedWorkflowOutput(output);
    setIsPreviewModalOpen(true);
  };

  const handleDownload = (output: any, workflowName: string, type: string) => {
    let filename = `${workflowName.replace(/\s+/g, '_')}_${type}_result`;
    let dataToSave = '';
    let mimeType = 'text/plain;charset=utf-8;';

    // Prioritize tabular data (headers and rows)
    if (output.headers && Array.isArray(output.rows)) {
        const csvRows = [output.headers.join(',')];
        output.rows.forEach((row: any[]) => {
            // Basic CSV escaping for cells containing commas or newlines
            csvRows.push(row.map(cell => {
                const stringCell = String(cell);
                return (stringCell.includes(',') || stringCell.includes('\n') || stringCell.includes('"')) ? `"${stringCell.replace(/"/g, '""')}"` : stringCell;
            }).join(','));
        });
        dataToSave = csvRows.join('\n');
        filename += '.csv';
        mimeType = 'text/csv;charset=utf-8;';
    } else if (type === 'report' && output.summaryText) {
        dataToSave = `Report Title: ${output.reportTitle || 'N/A'}\n` +
                     `Generation Date: ${output.generationDate ? formatDate(output.generationDate) : 'N/A'}\n` +
                     `Total Processed Records: ${output.totalProcessedRecords || 'N/A'}\n\n` +
                     `Summary:\n${output.summaryText}\n\n`;
        if (output.charts && Array.isArray(output.charts) && output.charts.length > 0) {
            dataToSave += 'Charts Data:\n';
            output.charts.forEach((chart: any) => {
                dataToSave += `  ${chart.title} (${chart.type}):\n`;
                chart.data.forEach((d: any) => {
                    dataToSave += `    - ${d.label || d.name}: ${d.value}\n`;
                });
            });
        }
        if (output.reportIssues && output.reportIssues.length > 0) {
            dataToSave += '\nReport Issues:\n';
            output.reportIssues.forEach((issue: string) => {
                dataToSave += `- ${issue}\n`;
            });
        }
        filename += '.txt';
        mimeType = 'text/plain;charset=utf-8;';
    } else { // Default to JSON for other structured outputs
      dataToSave = JSON.stringify(output, null, 2);
      filename += '.json';
      mimeType = 'application/json;charset=utf-8;';
    }

    const blob = new Blob([dataToSave], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    // IMPORTANT: Replaced alert() with a toast notification for better UX
    toast.success(`Initiating download for "${filename}"`);
  };

  const handleViewReport = (output: any) => {
    setSelectedWorkflowOutput(output);
    setIsReportModalOpen(true);
  };

  // New handler for viewing errors
  const handleViewErrors = (errors: string[] | null) => {
    if (errors && errors.length > 0) {
      setSelectedErrorDetails(errors);
      setIsErrorDetailsModalOpen(true);
    } else {
      toast.info("No detailed errors available for this workflow result.");
    }
  };
  // --- End Button Handlers ---


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Results</h1>
          <p className="text-muted-foreground">
            View and download results from your completed workflows
          </p>
        </div>

        <div className="flex space-x-2">
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Download All
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search results..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="cleaned_data">Cleaned Data</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="merged_data">Merged Data</SelectItem>
                <SelectItem value="analyze_data">Analysis</SelectItem>
                <SelectItem value="validated_data">Validated Data</SelectItem> {/* New filter item */}
                <SelectItem value="message">Messages</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="results" className="space-y-4">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          {filteredResults.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  Complete some workflows to see results here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredResults.map((result) => (
                <Card key={result.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        {getTypeIcon(result.type)}
                        <div>
                          <h3 className="font-semibold">{result.workflowName}</h3>
                          <p className="text-sm text-muted-foreground">{result.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(result.status)}
                        <Badge variant={
                          result.status === 'completed' ? 'default' :
                          result.status === 'processing' || result.status === 'running' ? 'secondary' :
                          'destructive'
                        }>
                          {result.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">File Size</p>
                        <p className="font-medium">{result.fileSize}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Records</p>
                        <p className="font-medium">{result.recordCount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Errors</p>
                        <p className="font-medium text-red-600">{result.errorCount}</p>
                        {result.errorCount > 0 && result.errorDetails && (
                            <Button variant="link" size="sm" className="text-red-500 p-0 h-auto" onClick={() => handleViewErrors(result.errorDetails)}>
                                <Bug className="h-3 w-3 mr-1" /> View Details
                            </Button>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Created</p>
                        <p className="font-medium">{formatDate(result.createdAt)}</p>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handlePreview(result.actualOutput)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(result.actualOutput, result.workflowName, result.type)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      {result.type === 'report' && ( // Only show "View Report" if it's a report output
                        <Button variant="outline" size="sm" onClick={() => handleViewReport(result.actualOutput)}>
                          <BarChart3 className="h-4 w-4 mr-1" />
                          View Report
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Period</CardTitle>
              <CardDescription>Select the time period for analytics data.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="6months">Last 6 Months</SelectItem>
                  <SelectItem value="12months">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
              {isLoadingAnalytics ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-lg text-muted-foreground">Loading Analytics Data...</p>
                  <p className="text-sm text-muted-foreground mt-1">Fetching processing trends and quality distribution.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Processing Trends</CardTitle>
                        <CardDescription>Workflow completion rates over time</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {processingTrends.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={processingTrends}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="period" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="completed" stroke="#82ca9d" name="Workflows Completed" />
                              <Line type="monotone" dataKey="failed" stroke="#ff7300" name="Workflows Failed" />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-center text-muted-foreground py-8">No data available for processing trends in this period.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Data Quality Distribution</CardTitle>
                        <CardDescription>Breakdown of errors found in processed data</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {dataQualityDistribution.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                              <Pie
                                data={dataQualityDistribution}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {dataQualityDistribution.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6B6B'][index % 6]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-center text-muted-foreground py-8">No data available for quality distribution in this period.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>


{/* Insights Tab Content (UPDATED) */}
        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lightbulb className="mr-2 h-5 w-5 text-yellow-500" />
                Key AI-Generated Insights
              </CardTitle>
              <CardDescription>Actionable findings extracted from your business data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingAnalytics ? ( // Use isLoadingAnalytics for insights too
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-lg text-muted-foreground">Generating AI Insights...</p>
                  <p className="text-sm text-muted-foreground mt-1">This may take a moment as the AI model processes your data.</p>
                </div>
              ) : aiInsights.length > 0 ? (
                aiInsights.map((insight, index) => (
                  <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                    <h4 className="font-semibold text-lg">{insight.title}</h4>
                    <p className="text-sm text-muted-foreground">{insight.description}</p>
                    {insight.data && ( // Optionally display structured data if available
                        <pre className="mt-2 text-xs text-muted-foreground bg-gray-50 p-2 rounded-md overflow-auto">
                            {JSON.stringify(insight.data, null, 2)}
                        </pre>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No AI insights generated for this period.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NEW Decisions Tab Content */}
        <TabsContent value="decisions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Megaphone className="mr-2 h-5 w-5 text-green-500" />
                AI-Suggested Decisions
              </CardTitle>
              <CardDescription>Actionable recommendations based on the generated insights.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingAnalytics ? ( // Use isLoadingAnalytics for decisions too
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-lg text-muted-foreground">Generating Decision Recommendations...</p>
                  <p className="text-sm text-muted-foreground mt-1">The AI is formulating strategic actions.</p>
                </div>
              ) : decisionRecommendations.length > 0 ? (
                decisionRecommendations.map((decision, index) => (
                  <div key={index} className={`border-l-4 pl-4 py-2 ${
                    decision.urgency === 'high' ? 'border-red-500' :
                    decision.urgency === 'medium' ? 'border-orange-500' :
                    'border-green-500'
                  }`}>
                    <h4 className="font-semibold text-lg flex items-center">
                      <Badge variant="outline" className={`mr-2 capitalize ${
                        decision.urgency === 'high' ? 'text-red-600 border-red-300' :
                        decision.urgency === 'medium' ? 'text-orange-600 border-orange-300' :
                        'text-green-600 border-green-300'
                      }`}>
                        {decision.urgency} Urgency
                      </Badge>
                      {decision.recommendation}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">{decision.rationale}</p>
                    <p className="text-xs text-gray-500 mt-1">Category: <Badge variant="secondary" className="capitalize">{decision.category.replace(/_/g, ' ')}</Badge></p>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No AI-suggested decisions for this period.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Modals */}
      {isReportModalOpen && selectedWorkflowOutput && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          reportData={selectedWorkflowOutput as ReportOutput} // Cast to ReportOutput type
        />
      )}

      {isPreviewModalOpen && selectedWorkflowOutput && (
        <PreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          data={selectedWorkflowOutput as TabularOutput} // Cast to TabularOutput type
        />
      )}

      {isErrorDetailsModalOpen && selectedErrorDetails && ( // New Error Details Modal
        <ErrorDetailsModal
          isOpen={isErrorDetailsModalOpen}
          onClose={() => setIsErrorDetailsModalOpen(false)}
          errors={selectedErrorDetails}
        />
      )}
    </div>
  );
}