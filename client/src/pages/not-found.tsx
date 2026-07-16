import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Helmet } from "react-helmet";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Helmet>
        <title>404 Page Not Found | WhachatCRM</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            This page does not exist. Check the URL or return to the homepage.
          </p>
          <p className="mt-6">
            <Link href="/">
              <a className="text-sm font-medium text-brand-green hover:underline">Go to homepage</a>
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
