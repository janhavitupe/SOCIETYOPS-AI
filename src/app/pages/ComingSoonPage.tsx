import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Reserved homes for roles that have no accounts yet. The routes and role
 * guards exist now so Phases 1 and 2 add screens rather than restructure.
 */
function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export function WorkerHomePage() {
  return <ComingSoon title="My jobs" description="The worker view arrives with staff and vendor accounts." />;
}

export function PlatformHomePage() {
  return <ComingSoon title="Platform admin" description="The platform console arrives with multi-society support." />;
}
