import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-picker'; // Assuming this component exists
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Zap,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  Filter,
  AlertTriangle,
  Loader2 // For loading indicators
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { analyticsService, UserBehavior } from '@/services/analytics.service'; // Import analyticsService and relevant types
import { DateRange } from 'react-day-picker'; // Assuming DatePickerWithRange uses this type

// Define interfaces for the actual data you expect from the backend
interface WorkflowPerformanceData {
  name: string; // e.g., 'Jan', 'Feb' or '2024-01-01'
  workflows: number;
  success: number; // Number of successful workflows
  failed: number;  // Number of failed workflows
  avgTime: number; // Average processing time
}

interface TaskTypeDistributionData {
  name: string; // e.g., 'Clean', 'Merge'
  value: number; // Count or percentage
  color: string; // Color for the pie chart segment
}

interface AgentPerformanceData {
  name: string; // Agent name
  tasks: number; // Tasks completed by this agent
  success: number; // Success rate of this agent
  avgTime: number; // Average processing time for this agent
  status: 'active' | 'idle' | 'maintenance' | 'error'; // Agent status
}

interface AnalyticsDashboardData {
  totalWorkflows: number;
  successfulWorkflows: number;
  failedWorkflows: number;
  avgProcessingTime: number; // In minutes
  activeAgents: number;
  workflowPerformance: WorkflowPerformanceData[];
  taskTypeDistribution: TaskTypeDistributionData[];
  agentPerformance: AgentPerformanceData[];
}

export default function Analytics() {
  const { user, hasPermission, isLoading: isLoadingAuth } = useAuth();

  // Only allow product owner role to access advanced analytics
  const isProductOwner = user?.role === 'product_owner';

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setMonth(new Date().getMonth() - 6)), // Last 6 months
    to: new Date(),
  });
  const [selectedMetric, setSelectedMetric] = useState('workflows'); // Default metric
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardData | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalyticsData = useCallback(async () => {
    if (!isProductOwner) {
      setIsLoadingAnalytics(false);
      return;
    }

    setIsLoadingAnalytics(true);
    setError(null); // Clear previous errors
    try {
      // You might need to adjust the API call based on how your backend expects date ranges
      const fromDate = dateRange?.from?.toISOString();
      const toDate = dateRange?.to?.toISOString();

      // Assuming analyticsService has a method to get dashboard summary data
      const data: AnalyticsDashboardData = await analyticsService.getDashboardSummary({ fromDate, toDate });

      // Assign colors to task types if not provided by backend
      const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#d0ed57', '#a4de6c', '#8dd1e1'];
      const taskTypeDistributionWithColors = data.taskTypeDistribution.map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length]
      }));

      setAnalyticsData({ ...data, taskTypeDistribution: taskTypeDistributionWithColors });
    } catch (err: any) {
      console.error('Failed to fetch analytics data:', err);
      setError(err.message || 'Failed to load analytics data.');
      setAnalyticsData(null); // Clear data on error
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [isProductOwner, dateRange]); // Re-fetch when date range or product owner status changes

  useEffect(() => {
    // Only fetch if authentication is ready
    if (!isLoadingAuth) {
      fetchAnalyticsData();
    }
  }, [isLoadingAuth, fetchAnalyticsData]); // Depend on isLoadingAuth and the memoized fetch function

  // If authentication is still loading, show a generic loading state
  if (isLoadingAuth) {
    return (
      <div className="flex justify-center items-center h-screen text-lg text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading Authentication...
      </div>
    );
  }

  // Access control for non-product owners
  if (!isProductOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground">
          Advanced analytics are only available to Product Owner accounts.
        </p>
      </div>
    );
  }

  // Show loading state for analytics data
  if (isLoadingAnalytics) {
    return (
      <div className="flex justify-center items-center h-screen text-lg text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading Analytics Data...
      </div>
    );
  }

  // Show error message if fetching failed
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-4 text-red-600">
        <AlertCircle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Analytics</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchAnalyticsData} className="mt-4">Retry</Button>
      </div>
    );
  }

  // If no data is available after loading, display a message
  if (!analyticsData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
        <BarChart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Analytics Data Available</h2>
        <p className="text-muted-foreground">
          There is no data to display for the selected period. Try adjusting the date range.
        </p>
        <DatePickerWithRange
          date={dateRange}
          setDate={setDateRange}
          className="mt-4"
        />
      </div>
    );
  }

  // Calculate dynamic stats based on fetched data
  const totalWorkflows = analyticsData.totalWorkflows;
  const successRate = totalWorkflows > 0 ? ((analyticsData.successfulWorkflows / totalWorkflows) * 100).toFixed(1) : '0';
  const avgProcessingTime = analyticsData.avgProcessingTime.toFixed(1);
  const activeAgents = analyticsData.activeAgents;

  // Placeholder for change calculation (requires historical data, which is not in current DTO)
  // For production, you'd fetch previous period data to calculate these.
  const getChangeAndTrend = (currentValue: number, previousValue: number) => {
    if (previousValue === 0) return { change: 'N/A', trend: 'neutral' };
    const change = ((currentValue - previousValue) / previousValue) * 100;
    const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    return { change: `${change.toFixed(1)}%`, trend };
  };

  // Dummy previous values for demonstration; replace with actual historical data
  const prevTotalWorkflows = 290;
  const prevSuccessfulWorkflows = 270;
  const prevAvgProcessingTime = 12.5;

  const stats = [
    {
      title: 'Total Workflows',
      value: totalWorkflows.toString(),
      ...getChangeAndTrend(totalWorkflows, prevTotalWorkflows),
      icon: Zap,
      color: 'text-blue-600'
    },
    {
      title: 'Success Rate',
      value: `${successRate}%`,
      ...getChangeAndTrend(parseFloat(successRate), (prevSuccessfulWorkflows / prevTotalWorkflows) * 100),
      icon: CheckCircle,
      color: 'text-green-600'
    },
    {
      title: 'Avg Processing Time',
      value: `${avgProcessingTime}min`,
      ...getChangeAndTrend(analyticsData.avgProcessingTime, prevAvgProcessingTime),
      icon: Clock,
      color: 'text-orange-600'
    },
    {
      title: 'Active Agents',
      value: activeAgents.toString(),
      change: '0%', // This would also need historical data
      trend: 'neutral',
      icon: Users,
      color: 'text-purple-600'
    }
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Insights and performance metrics for your workflows
          </p>
        </div>

        <div className="flex space-x-2">
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workflows">Workflows</SelectItem>
              <SelectItem value="tasks">Tasks</SelectItem>
              <SelectItem value="agents">Agents</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
            </SelectContent>
          </Select>

          <DatePickerWithRange
            date={dateRange}
            setDate={setDateRange}
            onSelect={fetchAnalyticsData} // Trigger fetch when date range changes
            className="w-auto"
          />

          <Button variant="outline" onClick={fetchAnalyticsData}>
            <Filter className="mr-2 h-4 w-4" />
            Apply Filters
          </Button>

          <Button variant="outline" onClick={() => console.log('Exporting analytics data')}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center space-x-1 text-xs">
                {stat.trend === 'up' && <TrendingUp className="h-3 w-3 text-green-600" />}
                {stat.trend === 'down' && <TrendingDown className="h-3 w-3 text-red-600" />}
                <span className={
                  stat.trend === 'up' ? 'text-green-600' :
                  stat.trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
                }>
                  {stat.change}
                </span>
                <span className="text-muted-foreground">from last period</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workflow Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Workflow Performance</CardTitle>
            <CardDescription>Success rates and completion times over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={analyticsData.workflowPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend /> {/* Added Legend for clarity */}
                <Area
                  type="monotone"
                  dataKey="success"
                  stackId="1"
                  stroke="#8884d8"
                  fill="#8884d8"
                  fillOpacity={0.6}
                  name="Successful Workflows"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stackId="1"
                  stroke="#FA8072" // Changed color for failed to be distinct
                  fill="#FA8072"
                  fillOpacity={0.6}
                  name="Failed Workflows"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Task Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Task Type Distribution</CardTitle>
            <CardDescription>Most common types of tasks processed</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData.taskTypeDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {analyticsData.taskTypeDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend /> {/* Added Legend for clarity */}
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Performance</CardTitle>
          <CardDescription>Individual agent statistics and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.agentPerformance.length > 0 ? (
              analyticsData.agentPerformance.map((agent, index) => (
                <div key={agent.name} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{agent.name}</h4>
                    <Badge variant={agent.success > 95 ? 'default' : 'secondary'}>
                      {agent.success}% Success
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Tasks Completed</p>
                      <p className="font-medium">{agent.tasks}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg. Processing Time</p>
                      <p className="font-medium">{agent.avgTime}min</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${
                          agent.status === 'active' ? 'bg-green-500' :
                          agent.status === 'idle' ? 'bg-yellow-500' :
                          agent.status === 'maintenance' ? 'bg-orange-500' :
                          'bg-red-500' // For 'error' status
                        }`}></div>
                        <span className={`font-medium ${
                          agent.status === 'active' ? 'text-green-600' :
                          agent.status === 'idle' ? 'text-yellow-600' :
                          agent.status === 'maintenance' ? 'text-orange-600' :
                          'text-red-600'
                        }`}>{agent.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center">No agent performance data available.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Processing Time Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Time Trends</CardTitle>
          <CardDescription>Average workflow processing time over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analyticsData.workflowPerformance}> {/* Using workflowPerformance for time trends */}
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="avgTime"
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ fill: '#8884d8' }}
                name="Avg. Processing Time (min)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}