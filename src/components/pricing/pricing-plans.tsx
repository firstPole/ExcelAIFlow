import React from 'react';
import { Check, Zap, Crown, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { analyticsService } from '@/services/analytics.service';

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  limits: {
    files: number;
    workflows: number;
    storage: number; // in GB
    agents: number;
  };
  popular?: boolean;
  cta: string;
}

const plans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Perfect for trying out ExcelFlow AI',
    icon: <Zap className="w-6 h-6" />,
    features: [
      '3 file processing per month',
      'Basic workflow templates',
      'Standard AI agents',
      'Email support',
      'Basic analytics'
    ],
    limits: {
      files: 3,
      workflows: 5,
      storage: 0.1,
      agents: 2
    },
    cta: 'Get Started Free'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    period: 'month',
    description: 'For professionals and small teams',
    icon: <Crown className="w-6 h-6" />,
    features: [
      'Unlimited file processing',
      'Advanced workflow builder',
      'All AI agents included',
      'Priority support',
      'Advanced analytics',
      'Custom templates',
      'API access'
    ],
    limits: {
      files: -1, // unlimited
      workflows: -1,
      storage: 10,
      agents: -1
    },
    popular: true,
    cta: 'Upgrade to Pro'
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    period: 'month',
    description: 'For large teams and organizations',
    icon: <Building className="w-6 h-6" />,
    features: [
      'Everything in Pro',
      'Custom AI model configuration',
      'Advanced database options',
      'Performance optimization',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
      'Advanced security'
    ],
    limits: {
      files: -1,
      workflows: -1,
      storage: 100,
      agents: -1
    },
    cta: 'Contact Sales'
  }
];

interface PricingPlansProps {
  currentPlan?: string;
  onPlanSelect: (planId: string) => void;
}

export function PricingPlans({ currentPlan = 'free', onPlanSelect }: PricingPlansProps) {
  const handlePlanSelect = async (planId: string) => {
    await analyticsService.trackPlanInteraction('plan_selected', planId);
    onPlanSelect(planId);
  };

  const formatLimit = (limit: number, unit: string) => {
    if (limit === -1) return 'Unlimited';
    return `${limit} ${unit}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {plans.map((plan) => (
        <Card 
          key={plan.id} 
          className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''} ${currentPlan === plan.id ? 'ring-2 ring-primary' : ''}`}
        >
          {plan.popular && (
            <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary">
              Most Popular
            </Badge>
          )}
          
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-2">
              {plan.icon}
            </div>
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <CardDescription>{plan.description}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${plan.price}</span>
              <span className="text-muted-foreground">/{plan.period}</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Features
              </h4>
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Limits
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Files: {formatLimit(plan.limits.files, '/month')}</div>
                <div>Workflows: {formatLimit(plan.limits.workflows, '')}</div>
                <div>Storage: {formatLimit(plan.limits.storage, 'GB')}</div>
                <div>Agents: {formatLimit(plan.limits.agents, '')}</div>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button 
              className="w-full" 
              variant={currentPlan === plan.id ? "outline" : plan.popular ? "default" : "outline"}
              onClick={() => handlePlanSelect(plan.id)}
              disabled={currentPlan === plan.id}
            >
              {currentPlan === plan.id ? 'Current Plan' : plan.cta}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}