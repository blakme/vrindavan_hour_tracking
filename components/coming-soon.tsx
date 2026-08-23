'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground">{description}</p>
      <Card className="mt-6 border-dashed border-border">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Construction className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Coming in the next step</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This screen is scaffolded and ready for the feature-by-feature build.
            Auth is working — let&apos;s review before continuing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
