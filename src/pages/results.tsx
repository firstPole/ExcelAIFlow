import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // ADDED: Import Label
import axios from 'axios';
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
  Megaphone, // For decisions/recommendations
  Globe, // Added for region_performance insight icon
  ShoppingCart, // For product_performance insight icon
  TrendingUp, // For sales_trend insight icon
  Zap, // For anomaly_detection
  Settings, // For operational_efficiency
  DollarSign, // For financial_overview
  Users, // For customer_relations
  ShieldAlert // For risk_management
} from 'lucide-react';
import { useWorkflow } from '@/contexts/workflow-context';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { WorkflowService, AiInsight, DecisionRecommendation, WorkflowResult, AiSettings } from '@/services/workflow.service';
import { UserService, UserSettings } from '@/services/user.service'; // Import UserService and UserSettings
import { toast } from 'sonner';

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
  errorDetails: string[] | null;
  startedAt?: string;
  completedAt?: string;
  taskName?: string;
}

// Define the structure for the Report task's output
interface ReportOutput {
  reportTitle: string;
  generationDate: string;
  totalProcessedRecords: number;
  summaryText: string;
  charts: Array<{
    type: 'bar' | 'pie' | 'line';
    title: string;
    data: Array<{ label: string; value: number } | { name: string; value: number }>;
  }>;
  headers?: string[];
  rows?: any[][];
  reportIssues: string[];
  metadata: {
    rowCount: number;
    columnCount: number;
    fileType: string;
    hasHeaders: boolean;
    reportGenerated: boolean;
    totalRevenue?: number;
    issuesFound: number;
  };
  sections?: any[]; // Added to match your previous check `output.sections`
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
        [key: string]: any;
    };
    message?: string;
    summary?: string;
    analysisIssues?: string[];
    cleaningReport?: {
      changesMade: string;
      issuesFound: number;
      details?: string[];
    };
    validationIssues?: Array<{
      row: number;
      issues: string[];
    }>;
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
                  {rows.slice(0, 100).map((row: any[], rowIndex: number) => ( // Limit to first 100 rows for preview
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
          {data.message && <p className="mt-4 text-sm text-gray-700">Message: {data.message}</p>}
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
                    ) : chart.type === 'line' ? (
                      <LineChart data={chart.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="value" stroke="#8884d8" />
                      </LineChart>
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
          {reportData.metadata && (
            <div className="mt-6 text-sm text-muted-foreground">
              <h4 className="font-semibold">Metadata:</h4>
              <p>Row Count: {reportData.metadata.rowCount}</p>
              <p>Column Count: {reportData.metadata.columnCount}</p>
              <p>File Type: {reportData.metadata.fileType}</p>
              <p>Has Headers: {reportData.metadata.hasHeaders ? 'Yes' : 'No'}</p>
              {reportData.metadata.totalRevenue !== undefined && <p>Total Revenue: {reportData.metadata.totalRevenue.toFixed(2)}</p>}
              <p>Issues Found (Metadata): {reportData.metadata.issuesFound}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


interface ErrorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: string[] | null;
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
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-grow overflow-y-auto">
          {errors && errors.length > 0 ? (
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
  const { workflows, getWorkflowResults } = useWorkflow();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actualResults, setActualResults] = useState<WorkflowResultDisplay[]>([]);

  // State for modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isErrorDetailsModalOpen, setIsErrorDetailsModalOpen] = useState(false);
  const [selectedWorkflowOutput, setSelectedWorkflowOutput] = useState<any>(null);
  const [selectedErrorDetails, setSelectedErrorDetails] = useState<string[] | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  
  // --- UPDATED STATE FOR ANALYTICS AND INSIGHTS DATA ---
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
  const [decisionRecommendations, setDecisionRecommendations] = useState<DecisionRecommendation[]>([]);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('7days');
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);

  // AI Settings states, now initialized from fetched user settings
  // These states will hold the *active* settings used for fetching analytics
  const [aiProvider, setAiProvider] = useState<string>('ollama'); // Default to ollama
  const [aiModel, setAiModel] = useState<string>('llama3');   // Default to llama3
  const [aiTemperature, setAiTemperature] = useState<number>(0.7); // Default
  const [aiMaxTokens, setAiMaxTokens] = useState<number>(768); // Default


  // Effect to fetch user AI settings on component mount
  useEffect(() => {
    const fetchUserAiSettings = async () => {
      try {
        const fetchedSettings: UserSettings = await UserService.getUserSettings();
        if (fetchedSettings && fetchedSettings.ai) {
          setAiProvider(fetchedSettings.ai.provider || 'ollama');
          setAiModel(fetchedSettings.ai.model || 'llama3');
          setAiTemperature(fetchedSettings.ai.temperature || 0.7);
          setAiMaxTokens(fetchedSettings.ai.maxTokens || 2048);
        }
      } catch (err) {
        console.error("Failed to fetch user AI settings, using defaults:", err);
        // Defaults ('ollama', 'llama3', 0.7, 2048) are already set in useState init
      }
    };
    fetchUserAiSettings();
  }, []); // Run once on mount


  useEffect(() => {
    console.log("Frontend Debug: useEffect triggered, current workflows:", workflows);

    const fetchWorkflowResults = async () => {
      setIsLoading(true);
      setError(null);
      const fetchedResults: WorkflowResultDisplay[] = [];

      for (const workflow of workflows) {
        console.log(`Frontend Debug: Processing workflow ID: ${workflow.id}, Name: ${workflow.name}, Status: ${workflow.status}`);

        if (workflow.status === 'completed' && workflow.id) {
          try {
            const resultsData = await getWorkflowResults(workflow.id);

            console.log(`Frontend Debug: Raw resultsData for workflow ${workflow.id}:`, resultsData);

            const latestResult = resultsData
                .sort((a: WorkflowResult, b: WorkflowResult) => new Date(b.completedAt || b.startedAt || '').getTime() - new Date(a.completedAt || a.startedAt || '').getTime())
                .find((r: WorkflowResult) => r.status === 'completed');

            console.log(`Frontend Debug: Latest completed result for workflow ${workflow.id}:`, latestResult);

            if (latestResult && latestResult.output) {
                let parsedOutput: any = latestResult.output;

                console.log(`Frontend Debug: Parsed output for workflow ${workflow.id}:`, parsedOutput);

                let recordCount = 0;
                let errorCount = 0;
                let resultType = 'unknown';
                let errorDetails: string[] = [];

                if (parsedOutput) {
                    if (parsedOutput.reportGenerated) {
                        recordCount = parsedOutput.totalProcessedRecords || 0;
                        errorCount = parsedOutput.metadata?.issuesFound || 0;
                        resultType = 'report';
                        if (parsedOutput.reportIssues && Array.isArray(parsedOutput.reportIssues)) {
                            errorDetails = parsedOutput.reportIssues;
                        }
                    } else if (parsedOutput.metadata?.merged) {
                        recordCount = parsedOutput.metadata.rowCount || 0;
                        errorCount = parsedOutput.metadata.issuesFound || 0;
                        resultType = 'merged_data';
                        if (parsedOutput.mergeIssues && Array.isArray(parsedOutput.mergeIssues)) {
                            errorDetails = parsedOutput.mergeIssues;
                        }
                    } else if (Array.isArray(parsedOutput)) {
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
                    } else if (parsedOutput.metadata?.validated) {
                        recordCount = parsedOutput.validRecordsCount || 0;
                        errorCount = parsedOutput.invalidRecordsCount || 0;
                        resultType = 'validated_data';
                        if (parsedOutput.validationIssues && Array.isArray(parsedOutput.validationIssues)) {
                            errorDetails = parsedOutput.validationIssues.flatMap((issue: any) => issue.issues || []);
                        }
                    } else if (parsedOutput.metadata?.analyzed) {
                        recordCount = parsedOutput.metadata.rowCount || 0;
                        errorCount = parsedOutput.metadata.issuesFound || 0;
                        resultType = 'analyze_data';
                        if (parsedOutput.analysisIssues && Array.isArray(parsedOutput.analysisIssues)) {
                            errorDetails = parsedOutput.analysisIssues;
                        }
                    } else if (parsedOutput.metadata?.cleaned) {
                        recordCount = parsedOutput.metadata.rowCount || 0;
                        errorCount = parsedOutput.metadata.issuesFound || 0;
                        resultType = 'cleaned_data';
                        if (parsedOutput.cleaningReport?.details && Array.isArray(parsedOutput.cleaningReport.details)) {
                            errorDetails = parsedOutput.cleaningReport.details;
                        }
                    } else if (parsedOutput.message) {
                        recordCount = 0;
                        errorCount = 0;
                        resultType = 'message';
                    }
                }

                if (latestResult.error && typeof latestResult.error === 'string') {
                    try {
                        const parsedRawError = JSON.parse(latestResult.error);
                        if (Array.isArray(parsedRawError)) {
                            errorDetails = errorDetails.concat(parsedRawError.map(e => String(e)));
                        } else if (typeof parsedRawError === 'string') {
                            errorDetails.push(parsedRawError);
                        } else {
                            errorDetails.push(`Raw error (parsed object): ${JSON.stringify(parsedRawError)}`);
                        }
                    } catch (parseErr) {
                        errorDetails.push(latestResult.error);
                    }
                }

                const newResultEntry: WorkflowResultDisplay = {
                    id: latestResult.id,
                    workflowName: workflow.name,
                    type: resultType,
                    status: latestResult.status,
                    createdAt: workflow.createdAt,
                    fileSize: 'N/A',
                    recordCount: recordCount,
                    errorCount: errorCount,
                    description: workflow.description,
                    actualOutput: parsedOutput,
                    errorDetails: errorDetails.length > 0 ? errorDetails : null,
                    startedAt: latestResult.startedAt,
                    completedAt: latestResult.completedAt,
                    taskName: latestResult.taskName
                };

                console.log(`Frontend Debug: Prepared WorkflowResultDisplay entry:`, newResultEntry);

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
      console.log("Frontend Debug: Final fetchedResults set to state:", fetchedResults);
    };

    if (workflows && workflows.length > 0) {
        fetchWorkflowResults();
    } else {
        setIsLoading(false);
        setActualResults([]);
        console.log("Frontend Debug: No workflows to process, setting actualResults to empty.");
    }
  }, [workflows, getWorkflowResults]);

  useEffect(() => {
    const fetchAllAnalyticsData = async () => {
      // Use the states that were initialized from user settings
      console.log(`Frontend Debug: fetchAllAnalyticsData started for period: ${analyticsPeriod}, provider: ${aiProvider}, model: ${aiModel}, temp: ${aiTemperature}, tokens: ${aiMaxTokens}`);
      setIsLoadingAnalytics(true);

      const currentAiSettings: AiSettings = {
        provider: aiProvider,
        model: aiModel,
        temperature: aiTemperature,
        maxTokens: aiMaxTokens,
      };

      try {
        const data = await WorkflowService.getAiInsightsAndDecisions(analyticsPeriod, currentAiSettings);
        console.log('Frontend Debug: getAiInsightsAndDecisions completed.');
        console.log('Frontend Debug: Raw response from getAiInsightsAndDecisions:', data);

        const {
          insights,
          decisions,
        } = data || {};

        const isValidInsight = (item: any): item is AiInsight =>
          item && typeof item.title === 'string' && typeof item.description === 'string' && typeof item.type === 'string';

        const isValidDecision = (item: any): item is DecisionRecommendation =>
          item && typeof item.recommendation === 'string' &&
          typeof item.rationale === 'string' &&
          typeof item.urgency === 'string' &&
          typeof item.category === 'string';

        const validInsights = Array.isArray(insights) ? insights.filter(isValidInsight) : [];
        const validDecisions = Array.isArray(decisions) ? decisions.filter(isValidDecision) : [];

        setAiInsights(validInsights);
        setDecisionRecommendations(validDecisions);

        if (!validInsights.length && !validDecisions.length) {
          toast.error('AI did not return valid insights or decisions for this period.');
          console.warn('Frontend Debug: AI did not return valid insights or decisions.');
        } else {
          toast.success('Analytics data, insights, and decisions refreshed!');
          console.log('Frontend Debug: Analytics data, insights, and decisions successfully refreshed.');
        }

      } catch (error: unknown) {
        console.error('Frontend Debug: Error fetching analytics data, insights, or decisions:', error);

        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.message || 'Unknown Axios error';
          console.error('Frontend Debug: AxiosError details:', {
            message,
            code: error.code,
            status: error.response?.status,
            data: error.response?.data,
            headers: error.response?.headers,
          });
          toast.error(`Error fetching analytics data: ${message}`);
        } else {
          const fallbackMessage = error instanceof Error ? error.message : 'Unknown error occurred.';
          toast.error(`Error fetching analytics data: ${fallbackMessage}`);
        }

        setAiInsights([]);
        setDecisionRecommendations([]);
      } finally {
        setIsLoadingAnalytics(false);
        console.log(`Frontend Debug: fetchAllAnalyticsData finished for period: ${analyticsPeriod}`);
      }
    };

    // Trigger fetch when period or AI settings change
    // These states are now controlled by UserService.getUserSettings()
    fetchAllAnalyticsData();
  }, [analyticsPeriod, aiProvider, aiModel, aiTemperature, aiMaxTokens]);

  const filteredResults = actualResults.filter(result => {
    const matchesSearch = result.workflowName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          result.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (result.taskName && result.taskName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === 'all' || result.type === filterType;
    const matchesStatus = filterStatus === 'all' || result.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
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
      case 'validated_data':
        return <CheckCircle className="h-4 w-4 text-indigo-600" />;
      case 'message':
        return <FileText className="h-4 w-4 text-gray-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatFileSize = (size: string) => size;

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
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

  const handlePreview = (output: any) => {
    if (output && output.headers && Array.isArray(output.rows)) {
      setSelectedWorkflowOutput(output as TabularOutput);
      setIsPreviewModalOpen(true);
    } else {
      toast.error("Invalid tabular data format for preview.");
    }
  };

  const handleDownload = (output: any, workflowName: string, type: string) => {
    if (!output) {
      toast.error("No output data to download.");
      return;
    }

    let filename = `${workflowName.replace(/\s+/g, '_')}_${type}_result`;
    let dataToSave = '';
    let mimeType = 'text/plain;charset=utf-8;';

    if (output.headers && Array.isArray(output.rows)) {
        const csvRows = [output.headers.join(',')];
        output.rows.forEach((row: any[]) => {
            csvRows.push(row.map(cell => {
                const stringCell = String(cell);
                return (stringCell.includes(',') || stringCell.includes('\n') || stringCell.includes('"')) ? `"${stringCell.replace(/"/g, '""')}"` : stringCell;
            }).join(','));
        });
        dataToSave = csvRows.join('\n');
        filename += '.csv';
        mimeType = 'text/csv;charset=utf-8;';
    } else if (type === 'report' && output.reportTitle) {
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
    } else {
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
    toast.success(`Initiating download for "${filename}"`);
  };

  const handleViewReport = (output: any) => {
    if (output && output.reportTitle && output.sections) {
      setSelectedWorkflowOutput(output as ReportOutput);
      setIsReportModalOpen(true);
    } else {
      toast.error("Invalid report data format.");
    }
  };

  const handleViewErrors = (errors: string[] | null) => {
    if (errors && errors.length > 0) {
      setSelectedErrorDetails(errors);
      setIsErrorDetailsModalOpen(true);
    } else {
      toast.info("No detailed errors available for this workflow result.");
    }
  };

  // Helper function to get icon based on dynamic insight type
  const getInsightIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('error') || lowerType.includes('quality')) return <Bug className="h-4 w-4 text-red-500" />;
    if (lowerType.includes('trend') || lowerType.includes('growth') || lowerType.includes('decline')) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (lowerType.includes('performance') || lowerType.includes('sales') || lowerType.includes('revenue')) return <ShoppingCart className="h-4 w-4 text-purple-500" />;
    if (lowerType.includes('region') || lowerType.includes('geographic')) return <Globe className="h-4 w-4 text-orange-500" />;
    if (lowerType.includes('anomaly') || lowerType.includes('spike')) return <Zap className="h-4 w-4 text-yellow-500" />;
    if (lowerType.includes('efficiency') || lowerType.includes('operational')) return <Settings className="h-4 w-4 text-blue-500" />;
    if (lowerType.includes('financial')) return <DollarSign className="h-4 w-4 text-green-700" />;
    if (lowerType.includes('customer')) return <Users className="h-4 w-4 text-indigo-500" />;
    if (lowerType.includes('risk')) return <ShieldAlert className="h-4 w-4 text-red-700" />;
    return <Lightbulb className="h-4 w-4 text-yellow-500" />; // Default icon
  };


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
                <SelectItem value="validated_data">Validated Data</SelectItem>
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
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-lg text-muted-foreground">Loading Workflow Results...</p>
              <p className="text-sm text-muted-foreground mt-1">Fetching outputs from completed tasks.</p>
            </div>
          ) : filteredResults.length === 0 ? (
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
                        <div className="font-medium text-red-600">
                          {result.errorCount}
                          {result.errorCount > 0 && result.errorDetails && result.errorDetails.length > 0 && (
                              <Button variant="link" size="sm" className="text-red-500 p-0 h-auto" onClick={() => handleViewErrors(result.errorDetails ?? null)}>
                                  <Bug className="h-3 w-3 mr-1" /> View Details
                              </Button>
                          )}
                        </div>
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
                      {result.type === 'report' && (
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
              <div className="flex flex-wrap gap-4 mb-4">
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
              </div> {/* End of flex container for selects */}

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
                      <CardContent className="min-h-[250px] flex items-center justify-center">
                        <p className="text-center text-muted-foreground py-8">Processing trends data is currently not available via this API. Please check backend aggregation logic.</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Data Quality Distribution</CardTitle>
                        <CardDescription>Breakdown of errors found in processed data</CardDescription>
                      </CardHeader>
                      <CardContent className="min-h-[250px] flex items-center justify-center">
                        <p className="text-center text-muted-foreground py-8">Data quality distribution data is currently not available via this API. Please check backend aggregation logic.</p>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>


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
              {isLoadingAnalytics ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-lg text-muted-foreground">Generating AI Insights...</p>
                  <p className="text-sm text-muted-foreground mt-1">This may take a moment as the AI model processes your data.</p>
                </div>
              ) : aiInsights.length > 0 ? (
                aiInsights.map((insight, index) => (
                  <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                    <h4 className="font-semibold text-lg flex items-center space-x-1">
                      {getInsightIcon(insight.type)} {/* Use the dynamic icon helper */}
                      <span>{insight.title}</span>
                    </h4>
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
              {isLoadingAnalytics ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                  <p className="text-lg text-muted-foreground">Generating Decision Recommendations...</p>
                  <p className="text-sm text-muted-foreground mt-1">The AI is formulating strategic actions.</p>
                </div>
              ) : decisionRecommendations.length > 0 ? (
                decisionRecommendations.map((decision, index) => (
                  <div key={index} className={`border-l-4 pl-4 py-2 ${
                    decision.urgency === 'High' ? 'border-red-500' :
                    decision.urgency === 'Medium' ? 'border-orange-500' :
                    'border-green-500'
                  }`}>
                    <h4 className="font-semibold text-lg flex items-center">
                      <Badge variant="outline" className={`mr-2 capitalize ${
                        decision.urgency === 'High' ? 'text-red-600 border-red-300' :
                        decision.urgency === 'Medium' ? 'text-orange-600 border-orange-300' :
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
          reportData={selectedWorkflowOutput as ReportOutput}
        />
      )}

      {isPreviewModalOpen && selectedWorkflowOutput && (
        <PreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          data={selectedWorkflowOutput as TabularOutput}
        />
      )}

      {isErrorDetailsModalOpen && selectedErrorDetails && (
        <ErrorDetailsModal
          isOpen={isErrorDetailsModalOpen}
          onClose={() => setIsErrorDetailsModalOpen(false)}
          errors={selectedErrorDetails}
        />
      )}
    </div>
  );
}
