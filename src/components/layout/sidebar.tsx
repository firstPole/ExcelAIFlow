import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Upload, 
  Workflow, 
  FileText, 
  Settings, 
  Zap,
  TrendingUp,
  Database,
  Bot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflow } from '@/contexts/workflow-context';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Upload Files', href: '/upload', icon: Upload },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Results', href: '/results', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { workflows } = useWorkflow();

  const runningWorkflows = workflows.filter(w => w.status === 'running').length;

  return (
    <div className="flex h-full w-64 flex-col bg-background border-r">
      <div className="flex items-center h-16 px-6 border-b">
        <div className="flex items-center space-x-2">
          <Zap className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold">ExcelFlow AI</h1>
            <p className="text-xs text-muted-foreground">v1.0.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link key={item.name} to={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start h-10",
                  isActive && "bg-secondary"
                )}
              >
                <item.icon className="mr-3 h-4 w-4" />
                {item.name}
                {item.name === 'Workflows' && runningWorkflows > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {runningWorkflows}
                  </Badge>
                )}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">System Status</span>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Agents Active</span>
              <span className="text-green-600">5/5</span>
            </div>
            <div className="flex justify-between">
              <span>Model</span>
              <span>LLaMA3</span>
            </div>
            <div className="flex justify-between">
              <span>Queue</span>
              <span>{runningWorkflows} tasks</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}