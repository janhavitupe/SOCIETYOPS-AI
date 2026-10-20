import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>That address does not match any page in SocietyOps AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">Go to your home page</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
