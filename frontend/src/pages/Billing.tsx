import React from 'react';
import { PageHeader } from '@/components/ui';
import CostSummaryCards from '@/components/billing/CostSummaryCards';
import CostBreakdownChart from '@/components/billing/CostBreakdownChart';
import CostPredictionChart from '@/components/billing/CostPredictionChart';
import CostSuggestions from '@/components/billing/CostSuggestions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing & Cost Analysis"
        description="AWS cost breakdown, trends, and optimization opportunities."
      />

      <CostSummaryCards />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CostBreakdownChart />
          <CostPredictionChart />
        </div>

        <div className="space-y-6">
          <CostSuggestions />
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-sm">Usage Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Top services by spend, hourly usage, and anomalous billing events will appear here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
