import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Lock, 
  Rocket, 
  ClipboardCheck, 
  Zap, 
  MessageSquare, 
  Users, 
  Clock, 
  Target,
  ShieldCheck,
  Building2,
  Calendar,
  AlertCircle
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// --- Types & Schemas ---

type EntitlementStatus = 'locked' | 'purchased' | 'submitted' | 'installed';

interface TemplateData {
  template: {
    id: string;
    name: string;
    description: string;
    isPremium: boolean;
    version: string;
  };
  entitlement: {
    status: EntitlementStatus;
    purchasedAt: string | null;
    onboardingSubmittedAt: string | null;
  } | null;
  install: {
    installStatus: string;
    installedAt: string | null;
  } | null;
}

const onboardingSchema = z.object({
  // Step 1: Business Eligibility
  isRegisteredEntity: z.enum(["yes", "no", "not_sure"]),
  
  // Step 2: Business Details
  legalName: z.string().min(2, "Legal name is required"),
  country: z.string().min(2, "Country is required"),
  website: z.string().url("Valid website URL is required"),
  
  // Step 3: WhatsApp Setup
  desiredNumber: z.string().min(8, "Valid phone number is required"),
  isNumberActive: z.enum(["yes", "no"]),
  willingToMigrate: z.enum(["yes", "no"]),
  hasSmsAccess: z.enum(["yes", "no"]),
  
  // Step 4: Meta Business Manager
  hasMetaBM: z.enum(["yes", "no"]),
  bmEmail: z.string().email("Valid BM admin email is required"),
  bmId: z.string().optional(),
  
  // Step 5: CRM & Team
  teamType: z.enum(["solo", "team"]),
  estimatedSeats: z.string(),
  notificationsEnabled: z.boolean().default(true),
  
  // Step 6: Lead Sources & Goals
  leadSources: z.string().min(5, "Please describe your lead sources"),
  primaryGoal: z.string().min(5, "Please describe your primary goal"),
  
  // Step 7: Scheduling
  timezone: z.string(),
  preferredCallWindows: z.string().min(5, "Preferred call windows required"),
  
  // Step 8: Notes
  additionalNotes: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

// --- Components ---

export function RealtorGrowthEngine() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const totalSteps = 8;

  const { data: templateData, isLoading } = useQuery<TemplateData>({
    queryKey: ["/api/templates/realtor-growth-engine"],
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/templates/realtor-growth-engine/purchase");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      toast({ title: "Template Unlocked", description: "You can now proceed to onboarding." });
    }
  });

  const submitOnboardingMutation = useMutation({
    mutationFn: async (values: OnboardingValues) => {
      const res = await apiRequest("POST", "/api/templates/realtor-growth-engine/onboarding/submit", { payload: values });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/realtor-growth-engine"] });
      toast({ title: "Onboarding Submitted", description: "Our team will review your details shortly." });
    }
  });

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      isRegisteredEntity: "yes",
      isNumberActive: "no",
      willingToMigrate: "yes",
      hasSmsAccess: "yes",
      hasMetaBM: "no",
      teamType: "solo",
      estimatedSeats: "1",
      notificationsEnabled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center">Loading...</div>;
  }

  const status = templateData?.entitlement?.status || 'locked';

  // --- Views ---

  const renderStepper = () => (
    <div className="flex items-center justify-center space-x-4 mb-8">
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center border-2",
          status !== 'locked' ? "bg-brand-green border-brand-green text-white" : "border-gray-300 text-gray-400"
        )}>
          {status !== 'locked' ? <CheckCircle2 className="w-6 h-6" /> : "1"}
        </div>
        <span className="text-xs mt-2 font-medium">Purchase</span>
      </div>
      <div className="w-12 h-0.5 bg-gray-200" />
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center border-2",
          status === 'submitted' || status === 'installed' ? "bg-brand-green border-brand-green text-white" : 
          status === 'purchased' ? "border-brand-green text-brand-green" : "border-gray-300 text-gray-400"
        )}>
          {status === 'submitted' || status === 'installed' ? <CheckCircle2 className="w-6 h-6" /> : "2"}
        </div>
        <span className="text-xs mt-2 font-medium">Onboarding</span>
      </div>
      <div className="w-12 h-0.5 bg-gray-200" />
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center border-2",
          status === 'installed' ? "bg-brand-green border-brand-green text-white" : "border-gray-300 text-gray-400"
        )}>
          {status === 'installed' ? <CheckCircle2 className="w-6 h-6" /> : "3"}
        </div>
        <span className="text-xs mt-2 font-medium">Go Live</span>
      </div>
    </div>
  );

  const DetailPage = () => (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Badge variant="secondary" className="mb-2 bg-amber-100 text-amber-800 border-amber-200">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Premium Template
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Realtor Growth Engine</h1>
          <p className="text-lg text-muted-foreground mt-2">
            The ultimate WhatsApp-first automation system for real estate professionals.
          </p>
        </div>
        {status === 'locked' && (
          <Button 
            size="lg" 
            className="bg-brand-green hover:bg-brand-green/90"
            onClick={() => purchaseMutation.mutate()}
            disabled={purchaseMutation.isPending}
            data-testid="button-purchase-template"
          >
            Unlock Now for $199
            <ChevronRight className="ml-2 w-4 h-4" />
          </Button>
        )}
        {status === 'purchased' && (
          <Button 
            size="lg" 
            variant="secondary"
            onClick={() => setLocation("/app/templates/realtor-growth-engine/onboarding")}
            data-testid="button-start-onboarding"
          >
            Start Onboarding
            <ChevronRight className="ml-2 w-4 h-4" />
          </Button>
        )}
      </div>

      {renderStepper()}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>What you get</CardTitle>
              <CardDescription>A complete, out-of-the-box automation system.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: Rocket, title: "8 High-Converting Workflows", desc: "From lead capture to closing." },
                { icon: MessageSquare, title: "Optimized Message Templates", desc: "Professionally written scripts." },
                { icon: Zap, title: "AI-Powered Lead Routing", desc: "Smart assignment based on criteria." },
                { icon: Target, title: "Retargeting Sequences", desc: "Re-engage cold leads automatically." },
                { icon: ClipboardCheck, title: "Property Viewing Automations", desc: "Schedule and confirm viewings." },
                { icon: Users, title: "Team Collaboration Tools", desc: "Built-in pipeline for agencies." },
              ].map((item, idx) => (
                <div key={idx} className="flex space-x-3">
                  <div className="mt-1 bg-brand-green/10 p-2 rounded-lg">
                    <item.icon className="w-5 h-5 text-brand-green" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-gray-200 ml-3 space-y-6">
                <li className="mb-10 ml-6">
                  <span className="absolute flex items-center justify-center w-8 h-8 bg-brand-green rounded-full -left-4 ring-8 ring-white">
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </span>
                  <h3 className="font-semibold leading-tight">Step 1: Setup & Compliance</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We handle the Meta Business verification and WhatsApp Official API setup to ensure 100% compliance.
                  </p>
                </li>
                <li className="mb-10 ml-6">
                  <span className="absolute flex items-center justify-center w-8 h-8 bg-brand-green rounded-full -left-4 ring-8 ring-white">
                    <Rocket className="w-4 h-4 text-white" />
                  </span>
                  <h3 className="font-semibold leading-tight">Step 2: Automated Provisioning</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Once verified, our engine deploys all 8 workflows, tags, and pipeline stages directly into your workspace.
                  </p>
                </li>
                <li className="ml-6">
                  <span className="absolute flex items-center justify-center w-8 h-8 bg-brand-green rounded-full -left-4 ring-8 ring-white">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </span>
                  <h3 className="font-semibold leading-tight">Step 3: Customization & Go Live</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    A dedicated onboarding specialist helps you tweak the messages to your voice and launches your first campaign.
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requirements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5" />
                <span className="text-sm">Registered Business Entity</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5" />
                <span className="text-sm">Meta Business Manager Access</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5" />
                <span className="text-sm">Official WhatsApp API (Meta)</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-brand-green mt-0.5" />
                <span className="text-sm">Pro Subscription Plan</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-green/5 border-brand-green/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <Clock className="w-4 h-4 mr-2 text-brand-green" />
                Limited Availability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                We only onboard 10 realtors per month to ensure premium white-glove setup and support.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const OnboardingForm = () => {
    const nextStep = async () => {
      const fields = getFieldsForStep(step);
      const result = await form.trigger(fields as any);
      if (result) setStep(s => Math.min(s + 1, totalSteps));
    };

    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    const getFieldsForStep = (s: number) => {
      switch(s) {
        case 1: return ["isRegisteredEntity"];
        case 2: return ["legalName", "country", "website"];
        case 3: return ["desiredNumber", "isNumberActive", "willingToMigrate", "hasSmsAccess"];
        case 4: return ["hasMetaBM", "bmEmail", "bmId"];
        case 5: return ["teamType", "estimatedSeats", "notificationsEnabled"];
        case 6: return ["leadSources", "primaryGoal"];
        case 7: return ["timezone", "preferredCallWindows"];
        case 8: return ["additionalNotes"];
        default: return [];
      }
    };

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold">Onboarding Form</h2>
            <span className="text-sm font-medium text-muted-foreground">Step {step} of {totalSteps}</span>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => submitOnboardingMutation.mutate(v))} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="isRegisteredEntity"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Is your real estate business a registered legal entity?</FormLabel>
                      <FormDescription>Necessary for Meta Business verification.</FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="yes" />
                            </FormControl>
                            <FormLabel className="font-normal">Yes, we are registered</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="no" />
                            </FormControl>
                            <FormLabel className="font-normal">No, I operate as an individual</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="not_sure" />
                            </FormControl>
                            <FormLabel className="font-normal">I'm not sure</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="legalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Legal Business Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Skyline Realty LLC" data-testid="input-legal-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Country</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. USA" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Website</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="desiredNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desired WhatsApp Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+1234567890" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isNumberActive"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Is this number currently used for WhatsApp?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="yes" /></FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="no" /></FormControl>
                            <FormLabel className="font-normal">No</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="willingToMigrate"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Are you willing to migrate this number to the Official API?</FormLabel>
                      <FormDescription>Existing chat history in standard WhatsApp will be lost.</FormDescription>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="yes" /></FormControl>
                            <FormLabel className="font-normal">Yes, I understand</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="no" /></FormControl>
                            <FormLabel className="font-normal">No, I'll use a new number</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="hasMetaBM"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Do you have a Meta Business Manager?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="yes" /></FormControl>
                            <FormLabel className="font-normal">Yes</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="no" /></FormControl>
                            <FormLabel className="font-normal">No / I'm not sure</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bmEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BM Admin Email</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="admin@example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bmId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BM ID (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="1234567890" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="teamType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Are you a solo agent or a team?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="solo" /></FormControl>
                            <FormLabel className="font-normal">Solo Agent</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl><RadioGroupItem value="team" /></FormControl>
                            <FormLabel className="font-normal">Real Estate Team / Agency</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="estimatedSeats"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated number of seats needed</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="leadSources"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Sources</FormLabel>
                      <FormDescription>Where do your leads come from? (e.g. Zillow, Facebook Ads, Referrals)</FormDescription>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="primaryGoal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Goal with WhatsApp Automation</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Timezone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="preferredCallWindows"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Windows for Onboarding Call</FormLabel>
                      <FormDescription>We'll schedule a 30-min strategy call.</FormDescription>
                      <FormControl>
                        <Textarea {...field} placeholder="e.g. Mon-Fri 10am-12pm EST" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 8 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="additionalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Any specific requirements or questions?" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-4 flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      By submitting this form, you authorize WhachatCRM to initiate the WhatsApp Business API setup on your behalf.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1}>
                <ChevronLeft className="mr-2 w-4 h-4" />
                Back
              </Button>
              {step < totalSteps ? (
                <Button type="button" onClick={nextStep} data-testid="button-next-step">
                  Next
                  <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  className="bg-brand-green hover:bg-brand-green/90" 
                  disabled={submitOnboardingMutation.isPending}
                  data-testid="button-submit-onboarding"
                >
                  Submit Onboarding
                  <Rocket className="ml-2 w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    );
  };

  const StatusPage = () => (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="mb-8 flex justify-center">
        <div className="w-20 h-20 bg-brand-green/10 rounded-full flex items-center justify-center">
          <ClipboardCheck className="w-10 h-10 text-brand-green" />
        </div>
      </div>
      <h2 className="text-3xl font-bold mb-4">Onboarding in Review</h2>
      <p className="text-lg text-muted-foreground mb-8">
        Thank you for submitting your onboarding details. Our team is currently reviewing your application and preparing your workspace.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-8">
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-semibold text-sm flex items-center mb-2">
              <Calendar className="w-4 h-4 mr-2 text-brand-green" />
              Next Steps
            </h4>
            <ul className="text-xs space-y-2 text-muted-foreground">
              <li>• Technical review of Meta BM (24h)</li>
              <li>• WhatsApp Number provisioning</li>
              <li>• Onboarding call scheduling</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-semibold text-sm flex items-center mb-2">
              <ShieldCheck className="w-4 h-4 mr-2 text-brand-green" />
              Support
            </h4>
            <p className="text-xs text-muted-foreground">
              Have questions? Reach out to us at <span className="font-medium text-brand-green">support@whachatcrm.com</span> or via the help center.
            </p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => setLocation("/app/templates")}>
        Back to Templates
      </Button>
    </div>
  );

  // --- Router Logic ---

  if (location === "/app/templates/realtor-growth-engine/onboarding") {
    if (status === 'locked') return <Redirect to="/app/templates/realtor-growth-engine" />;
    if (status === 'submitted' || status === 'installed') return <Redirect to="/app/templates/realtor-growth-engine/status" />;
    return <OnboardingForm />;
  }

  if (location === "/app/templates/realtor-growth-engine/status") {
    if (status === 'locked' || status === 'purchased') return <Redirect to="/app/templates/realtor-growth-engine" />;
    return <StatusPage />;
  }

  return <DetailPage />;
}

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(to);
  }, [to]);
  return null;
}
