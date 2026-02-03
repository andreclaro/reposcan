"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BatchScanForm from "@/components/batch-scan-form";
import GitHubOrgScanner from "@/components/github-org-scanner";
import { Github, Upload } from "lucide-react";

export default function ToolsTabs() {
  return (
    <Tabs defaultValue="github-org" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="github-org" className="gap-2">
          <Github className="h-4 w-4" />
          GitHub org
        </TabsTrigger>
        <TabsTrigger value="batch-csv" className="gap-2">
          <Upload className="h-4 w-4" />
          Batch CSV
        </TabsTrigger>
      </TabsList>
      <TabsContent value="github-org" className="mt-6">
        <GitHubOrgScanner />
      </TabsContent>
      <TabsContent value="batch-csv" className="mt-6">
        <BatchScanForm />
      </TabsContent>
    </Tabs>
  );
}
