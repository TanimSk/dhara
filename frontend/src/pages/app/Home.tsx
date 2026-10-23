import { Navigate } from "react-router-dom";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { post } from "../../lib/api";
import { useAuth, useRole } from "../../lib/auth";
import { useLibraries } from "../../hooks/queries";
import { Button, Card, EmptyState, Input, LoadingBlock, useToast } from "../../components/ui";

export default function Home() {
  const { data, isLoading } = useLibraries();
  const { membership } = useAuth();
  const { isManager } = useRole();
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => post("/libraries", { name }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      navigate(`/app/libraries/${d.library.id}`);
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  if (isLoading) return <LoadingBlock />;
  if (data && data.length > 0) return <Navigate to={`/app/libraries/${data[0].id}`} replace />;

  return (
    <div className="max-w-xl mx-auto pt-10 animate-fade-up">
      <div className="text-center mb-8">
        <h1 className="font-display text-[44px] leading-[1.05]">Welcome, {membership?.organization.name}</h1>
        <p className="mt-3 text-[15px] text-ink-3">Start by creating a library - a home for one course, batch or brand.</p>
      </div>
      <Card className="p-7">
        {isManager ? (
          <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
            <Input autoFocus placeholder="e.g. HSC Physics 2026" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>Create library</Button>
          </form>
        ) : (
          <EmptyState icon={<FolderPlus className="size-6" />} title="No libraries yet" description="Ask an owner or admin of your organization to create one." />
        )}
      </Card>
    </div>
  );
}
