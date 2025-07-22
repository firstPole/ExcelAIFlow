import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot,  
  Play, 
  Pause, 
  Settings, 
  Activity, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Plus,
  Code,
  Database,
  FileText,
  Shield,
  TrendingUp,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

const mockAgents = [
  {
    id: 'schema-agent',
    name: 'SchemaAgent',
    type: 'analyze',
    description: 'Analyzes file structures and data schemas',
    status: 'active',
    health: 98,
    tasksCompleted: 156,
    avgProcessingTime: 2.1,
    successRate: 98.7,
    lastActive: '2024-01-15T10:30:00Z',
    capabilities: ['Schema Detection', 'Data Type Inference', 'Structure Analysis'],
    config: {
      maxFileSize: '100MB',
      timeout: 30,
      retryAttempts: 3
    }
  },
  {
    id: 'cleaning-agent',
    name: 'CleaningAgent',
    type: 'clean',
    description: 'Removes duplicates and fixes data formatting issues',
    status: 'active',
    health: 95,
    tasksCompleted: 134,
    avgProcessingTime: 8.5,
    successRate: 96.2,
    lastActive: '2024-01-15T10:25:00Z',
    capabilities: ['Duplicate Removal', 'Data Formatting', 'Null Value Handling'],
    config: {
      duplicateThreshold: 0.95,
      cleaningRules: 'standard',
      preserveOriginal: true
    }
  },
  {
    id: 'validation-agent',
    name: 'ValidationAgent',
    type: 'validate',
    description: 'Validates data quality and completeness',
    status: 'active',
    health: 99,
    tasksCompleted: 98,
    avgProcessingTime: 1.8,
    successRate: 99.1,
    lastActive: '2024-01-15T10:28:00Z',
    capabilities: ['Data Quality Checks', 'Completeness Validation', 'Constraint Verification'],
    config: {
      validationRules: 'strict',
      errorThreshold: 0.05,
      reportLevel: 'detailed'
    }
  },
  {
    id: 'merge-agent',
    name: 'MergeAgent',
    type: 'merge',
    description: 'Combines multiple data sources intelligently',
    status: 'idle',
    health: 88,
    tasksCompleted: 87,
    avgProcessingTime: 15.2,
    successRate: 94.3,
    lastActive: '2024-01-15T09:45:00Z',
    capabilities: ['Data Merging', 'Conflict Resolution', 'Schema Matching'],
    config: {
      mergeStrategy: 'fuzzy',
      conflictResolution: 'latest',
      keyMatching: 'auto'
    }
  },
  {
    id: 'analysis-agent',
    name: 'AnalysisAgent',
    type: 'analyze',
    description: 'Performs statistical analysis and generates insights',
    status: 'active',
    health: 92,
    tasksCompleted: 72,
    avgProcessingTime: 12.8,
    successRate: 97.2,
    lastActive: '2024-01-15T10:32:00Z',
    capabilities: ['Statistical Analysis', 'Pattern Recognition', 'Insight Generation'],
    config: {
      analysisDepth: 'comprehensive',
      statisticalTests: 'auto',
      confidenceLevel: 0.95
    }
  },
  {
    id: 'report-agent',
    name: 'ReportAgent',
    type: 'report',
    description: 'Generates comprehensive reports and visualizations',
    status: 'maintenance',
    health: 85,
    tasksCompleted: 45,
    avgProcessingTime: 6.3,
    successRate: 100,
    lastActive: '2024-01-15T08:15:00Z',
    capabilities: ['Report Generation', 'Data Visualization', 'Chart Creation'],
    config: {
      reportFormat: 'pdf',
      includeCharts: true,
      templateStyle: 'professional'
    }
  }
];

const agentTypes = [
  { value: 'analyze', label: 'Analysis', icon: TrendingUp, color: 'text-blue-600' },
  { value: 'clean', label: 'Cleaning', icon: Shield, color: 'text-green-600' },
  { value: 'merge', label: 'Merging', icon: Database, color: 'text-purple-600' },
  { value: 'validate', label: 'Validation', icon: CheckCircle, color: 'text-orange-600' },
  { value: 'report', label: 'Reporting', icon: FileText, color: 'text-indigo-600' }
];

export default function Agents() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredAgents = mockAgents.filter(agent => {
    const matchesType = filterType === 'all' || agent.type === filterType;
    const matchesStatus = filterStatus === 'all' || agent.status === filterStatus;
    return matchesType && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Activity className="h-4 w-4 text-green-600" />;
      case 'idle':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'maintenance':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <Bot className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTypeIcon = (type: string) => {
    const typeInfo = agentTypes.find(t => t.value === type);
    if (!typeInfo) return <Bot className="h-4 w-4" />;
    return <typeInfo.icon className={`h-4 w-4 ${typeInfo.color}`} />;
  };

  const handleAgentAction = (action: string, agentId: string) => {
    toast.success(`Agent ${action} successfully`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground">
            Manage and monitor your AI agents for data processing workflows
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {agentTypes.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Agent</DialogTitle>
                <DialogDescription>
                  Configure a new AI agent for your workflows
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Agent Name</Label>
                  <Input id="agent-name" placeholder="Enter agent name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-type">Agent Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select agent type" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setIsCreateDialogOpen(false)}>
                    Create Agent
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgents.map((agent) => (
          <Card key={agent.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getTypeIcon(agent.type)}
                  <CardTitle className="text-lg">{agent.name}</CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(agent.status)}
                  <Badge variant={
                    agent.status === 'active' ? 'default' :
                    agent.status === 'idle' ? 'secondary' :
                    'outline'
                  }>
                    {agent.status}
                  </Badge>
                </div>
              </div>
              <CardDescription>{agent.description}</CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Health</span>
                    <span className="font-medium">{agent.health}%</span>
                  </div>
                  <Progress value={agent.health} className="h-2" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Tasks</p>
                    <p className="font-medium">{agent.tasksCompleted}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Success Rate</p>
                    <p className="font-medium">{agent.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Time</p>
                    <p className="font-medium">{agent.avgProcessingTime}min</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-medium capitalize">{agent.type}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {agent.capabilities.slice(0, 2).map((capability, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {capability}
                    </Badge>
                  ))}
                  {agent.capabilities.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{agent.capabilities.length - 2} more
                    </Badge>
                  )}
                </div>
                
                <div className="flex space-x-2">
                  {agent.status === 'active' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleAgentAction('paused', agent.id)}
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      Pause
                    </Button>
                  )}
                  
                  {agent.status !== 'active' && (
                    <Button 
                      size="sm" 
                      onClick={() => handleAgentAction('started', agent.id)}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Configure
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent Details Dialog */}
      <Dialog open={!!selectedAgent} onOpenChange={() => setSelectedAgent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {selectedAgent && getTypeIcon(selectedAgent.type)}
              <span>{selectedAgent?.name}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedAgent?.description}
            </DialogDescription>
          </DialogHeader>
          
          {selectedAgent && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedAgent.status)}
                      <span className="capitalize">{selectedAgent.status}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Health</Label>
                    <div className="flex items-center space-x-2">
                      <Progress value={selectedAgent.health} className="flex-1" />
                      <span className="text-sm">{selectedAgent.health}%</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Capabilities</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.capabilities.map((capability, index) => (
                      <Badge key={index} variant="outline">
                        {capability}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tasks Completed</Label>
                    <p className="text-2xl font-bold">{selectedAgent.tasksCompleted}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Success Rate</Label>
                    <p className="text-2xl font-bold">{selectedAgent.successRate}%</p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="config" className="space-y-4">
                <div className="space-y-4">
                  {Object.entries(selectedAgent.config).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</Label>
                      <Input
                        id={key}
                        value={value}
                        onChange={() => {}}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="logs" className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-2">
                  <div className="text-green-600">[2024-01-15 10:30:00] INFO: Agent started successfully</div>
                  <div className="text-blue-600">[2024-01-15 10:30:15] DEBUG: Processing task batch-123</div>
                  <div className="text-green-600">[2024-01-15 10:30:32] INFO: Task completed successfully</div>
                  <div className="text-yellow-600">[2024-01-15 10:30:45] WARN: High memory usage detected</div>
                  <div className="text-green-600">[2024-01-15 10:31:00] INFO: Memory usage normalized</div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}