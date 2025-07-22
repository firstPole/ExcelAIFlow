import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Zap } from 'lucide-react';
import { analyticsService } from '@/services/analytics.service';

interface UsageLimit {
  current: number;
  limit: number;
  label: string;
  unit: string;
}

interface UsageMeterProps {
  usage: {
    files: UsageLimit;
    workflows: UsageLimit;
    storage: UsageLimit;
  };
  plan: string;
  onUpgrade: () => void;
}

export function UsageMeter({ usage, plan, onUpgrade }: UsageMeterProps) {
  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0; // unlimited
    return Math.min((current / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 75) return 'text-yellow-500';
    return 'text-green-500';
  };

  const handleUpgradeClick = async () => {
    // This function is already correctly tracking the interaction
    await analyticsService.trackPlanInteraction('upgrade_clicked', plan);
    onUpgrade(); // Call the prop function provided by the parent (Dashboard)
  };

  // These calculations are already dynamic based on the `usage` prop
  const isNearLimit = Object.values(usage).some(u =>
    u.limit !== -1 && getUsagePercentage(u.current, u.limit) >= 80
  );

  const hasReachedLimit = Object.values(usage).some(u =>
    u.limit !== -1 && u.current >= u.limit
  );

  return (
    <Card className={`${hasReachedLimit ? 'border-red-500' : isNearLimit ? 'border-yellow-500' : ''}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Usage Overview</CardTitle>
            <CardDescription>Current plan: {plan.charAt(0).toUpperCase() + plan.slice(1)}</CardDescription>
          </div>
          {(isNearLimit || hasReachedLimit) && (
            <AlertTriangle className={`w-5 h-5 ${hasReachedLimit ? 'text-red-500' : 'text-yellow-500'}`} />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {Object.entries(usage).map(([key, data]) => {
          const percentage = getUsagePercentage(data.current, data.limit);
          const isUnlimited = data.limit === -1;

          return (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{data.label}</span>
                <span className={`text-sm ${getUsageColor(percentage)}`}>
                  {data.current} {isUnlimited ? data.unit : `/ ${data.limit} ${data.unit}`}
                </span>
              </div>
              {!isUnlimited && (
                <Progress
                  value={percentage}
                  className={`h-2 ${percentage >= 90 ? 'bg-red-100' : percentage >= 75 ? 'bg-yellow-100' : 'bg-green-100'}`}
                />
              )}
              {!isUnlimited && percentage >= 90 && (
                <p className="text-xs text-red-600">
                  {percentage >= 100 ? 'Limit reached!' : 'Approaching limit'}
                </p>
              )}
            </div>
          );
        })}

        {plan === 'free' && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Unlock More</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Upgrade to Pro for unlimited processing and advanced features
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={handleUpgradeClick}
              data-analytics="usage-upgrade-button"
            >
              Upgrade Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}