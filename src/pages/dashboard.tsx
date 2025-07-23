import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Workflow,
  BarChart3,
  Settings,
  Upload as UploadIcon,
  Plus,
  Zap,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  FileText,
  Loader2 // Import Loader2 for loading indicator
} from 'lucide-react';
import { useWorkflow } from '@/contexts/workflow-context';
import { useAuth } from '@/contexts/auth-context';
import { UsageMeter } from '@/components/usage/usage-meter'; // Assuming this component exists
import { analyticsService } from '@/services/analytics.service';
import { Link, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  // Destructure workflows and loading state from useWorkflow
  const { workflows, runWorkflow, isLoadingWorkflows } = useWorkflow();
  // Destructure user and loading state from useAuth
  const { user, isLoading: isLoadingAuth } = useAuth();
  const navigate = useNavigate();

  // Filter workflows based on their status
  const runningWorkflows = workflows.filter(w => w.status === 'running');
  const completedWorkflows = workflows.filter(w => w.status === 'completed');
  // const failedWorkflows = workflows.filter(w => w.status === 'failed'); // Not directly used in stats, but good to have

  // Get recent workflows (e.g., last 5, sorted by creation date)
  // Ensure workflows are sorted to get truly "recent" ones
  const recentWorkflows = [...workflows] // Create a copy to avoid mutating original state
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Track page view for analytics
  useEffect(() => {
    analyticsService.trackPageView('dashboard');
  }, []);

  // Define usage limits based on user subscription
  const usage = {
    files: {
      current: user?.usage?.processedFiles || 0,
      limit: user?.subscription === 'free' ? 3 : -1, // -1 for unlimited
      label: 'Files Processed',
      unit: 'files'
    },
    workflows: {
      current: user?.usage?.workflowsCreated || 0,
      limit: user?.subscription === 'free' ? 5 : -1,
      label: 'Workflows Created',
      unit: 'workflows'
    },
    storage: {
      current: user?.usage?.storageUsed || 0,
      limit: user?.subscription === 'free' ? 100 : user?.subscription === 'pro' ? 10000 : 100000, // Example limits in MB
      label: 'Storage Used',
      unit: 'MB'
    }
  };

  // Determine if user is near or has reached free plan limits
  const isFreePlan = user?.subscription === 'free';
  const isNearLimit = isFreePlan && (
    (user?.usage?.processedFiles || 0) >= (usage.files.limit !== -1 ? usage.files.limit - 1 : Infinity) ||
    (user?.usage?.workflowsCreated || 0) >= (usage.workflows.limit !== -1 ? usage.workflows.limit - 1 : Infinity)
  );

  const hasReachedLimit = isFreePlan && (
    (user?.usage?.processedFiles || 0) >= (usage.files.limit !== -1 ? usage.files.limit : Infinity) ||
    (user?.usage?.workflowsCreated || 0) >= (usage.workflows.limit !== -1 ? usage.workflows.limit : Infinity)
  );

  // Handle upgrade button click
  const handleUpgrade = () => {
    analyticsService.trackPlanInteraction('upgrade_clicked', user?.subscription || 'free');
    navigate('/settings'); // Navigate to settings page where pricing plans are displayed
  };

  // Calculate dynamic statistics based on fetched workflows
  const stats = [
    {
      title: "Total Workflows",
      value: workflows.length,
      description: "All time",
      icon: Workflow,
      color: "text-blue-600"
    },
    {
      title: "Running",
      value: runningWorkflows.length,
      description: "Currently active",
      icon: Play,
      color: "text-blue-600" // Changed to blue to match general running icon
    },
    {
      title: "Completed",
      value: completedWorkflows.length,
      description: "Successfully finished",
      icon: CheckCircle,
      color: "text-green-600"
    },
    {
      title: "Success Rate",
      value: workflows.length > 0 ? `${Math.round((completedWorkflows.length / workflows.length) * 100)}%` : "0%",
      description: "Overall performance",
      icon: TrendingUp,
      color: "text-purple-600"
    }
  ];

  // Show loading indicator if authentication or workflows are still loading
  if (isLoadingAuth || isLoadingWorkflows) {
    return (
      <div className="flex justify-center items-center h-screen text-lg text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading Dashboard...
      </div>
    );
  }

  // If user data is not available after loading (e.g., not logged in), redirect to login
  // This assumes AuthProvider handles redirection if no token is found.
  if (!user) {
    // You might want a more explicit message or redirect here,
    // but the AuthProvider should ideally handle unauthenticated access to protected routes.
    return (
      <div className="flex flex-col items-center justify-center h-screen text-lg text-muted-foreground p-4">
        <AlertCircle className="h-12 w-12 mb-4 text-red-500" />
        <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-muted-foreground mb-4">Please log in to view your dashboard.</p>
        <Button onClick={() => navigate('/login')}>Go to Login</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user.name || user.email}! Here's what's happening with your workflows.
          </p>
        </div>
        <div className="flex space-x-2">
          <Link to="/upload">
            <Button>
              <UploadIcon className="mr-2 h-4 w-4" />
              Upload Files
            </Button>
          </Link>
          <Link to="/workflows">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          </Link>
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
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Workflows */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Workflows</CardTitle>
            <CardDescription>Your latest workflow activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentWorkflows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No workflows yet. Create your first workflow to get started.
                </p>
              ) : (
                recentWorkflows.map((workflow) => (
                  <div key={workflow.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {workflow.status === 'running' && (
                          <Play className="h-4 w-4 text-blue-600" />
                        )}
                        {workflow.status === 'completed' && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {workflow.status === 'failed' && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        {workflow.status === 'draft' && (
                          <Clock className="h-4 w-4 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{workflow.name}</p>
                        <p className="text-sm text-muted-foreground">
  {workflow.tasks?.length ?? 0} tasks • {workflow.fileIds?.length ?? 0} files
</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={
                        workflow.status === 'completed' ? 'default' :
                        workflow.status === 'running' ? 'secondary' :
                        workflow.status === 'failed' ? 'destructive' : 'outline'
                      }>
                        {workflow.status}
                      </Badge>
                      {workflow.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runWorkflow(workflow.id)}
                        >
                          Run
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Active Tasks</CardTitle>
            <CardDescription>Currently running tasks and their progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {runningWorkflows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No active tasks. Start a workflow to see progress here.
                </p>
              ) : (
                runningWorkflows.map((workflow) => (
                  <div key={workflow.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{workflow.name}</p>
                      <Badge variant="secondary">Running</Badge>
                    </div>
                    {/* Assuming tasks within a running workflow also have progress */}
                    {workflow.tasks.map((task) => (
                      <div key={task.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{task.name}</span>
                          <span className="text-muted-foreground">{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} className="h-2" />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage and Upgrade Prompt for Free Users */}
      {user?.subscription === 'free' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageMeter
              usage={usage}
              plan={user?.subscription || 'free'}
              onUpgrade={handleUpgrade}
            />
          </div>

          {(isNearLimit || hasReachedLimit) && (
            <Card className={`${hasReachedLimit ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'}`}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  {hasReachedLimit ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Zap className="w-5 h-5 text-yellow-500" />
                  )}
                  <CardTitle className="text-lg">
                    {hasReachedLimit ? 'Limit Reached!' : 'Almost There!'}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">
                  {hasReachedLimit
                    ? 'You\'ve reached your free plan limits. Upgrade to continue processing files.'
                    : 'You\'re close to your free plan limits. Upgrade for unlimited access.'
                  }
                </p>
                <Button
                  className="w-full"
                  onClick={handleUpgrade}
                  data-analytics="dashboard-upgrade-prompt"
                >
                  Upgrade to Pro
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common workflows and templates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/upload"> {/* Wrap button in Link */}
              <Button variant="outline" className="h-20 flex flex-col space-y-2 w-full">
                <UploadIcon className="h-6 w-6" />
                <span>Upload & Clean</span>
              </Button>
            </Link>
            <Link to="/workflows"> {/* Example link for Merge Files */}
              <Button variant="outline" className="h-20 flex flex-col space-y-2 w-full">
                <FileText className="h-6 w-6" />
                <span>Merge Files</span>
              </Button>
            </Link>
            <Link to="/workflows"> {/* Example link for Generate Report */}
              <Button variant="outline" className="h-20 flex flex-col space-y-2 w-full">
                <TrendingUp className="h-6 w-6" />
                <span>Generate Report</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}