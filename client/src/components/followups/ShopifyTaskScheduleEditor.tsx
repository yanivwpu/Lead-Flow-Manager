import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type TeamChoice = { id: string; label: string };
type Schedule = {
  id: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  reminderMinutes: number | null;
  reminderDue: boolean;
};
function localDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function ShopifyTaskScheduleEditor({
  task, choices, ready, queryKey
}:{
  task: Schedule; choices: TeamChoice[]; ready: boolean; queryKey: readonly unknown[]
}) {
  const [assignee, setAssignee] = useState(task.assigneeUserId ?? "");
  const [due, setDue] = useState(localDateTime(task.dueAt));
  const [reminder, setReminder] = useState(task.reminderMinutes == null ? "" : String(task.reminderMinutes));
  const client = useQueryClient();
  useEffect(() => {
    setAssignee(task.assigneeUserId ?? "");
    setDue(localDateTime(task.dueAt));
    setReminder(task.reminderMinutes == null ? "" : String(task.reminderMinutes));
  }, [task.assigneeUserId,task.dueAt,task.reminderMinutes]);
  const save = useMutation({
    mutationFn: async () => {
      const timestamp = due ? new Date(due) : null;
      if (timestamp && Number.isNaN(timestamp.getTime())) throw new Error("Invalid due date");
      const response = await fetch("/api/shopify/ecommerce/order-support-task-schedule", {
        method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"schedule_internal_order_task",taskId:task.id,
          assigneeUserId:assignee || null,
          dueAt:timestamp?.toISOString() ?? null,
          reminderMinutes:due && reminder !== "" ? Number(reminder) : null
        })
      });
      if (!response.ok) throw new Error("Schedule unavailable or assignee not active");
    },
    onSuccess:async () => {await client.invalidateQueries({queryKey});}
  });
  const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now();
  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2" data-testid={`shopify-task-schedule-${task.id}`}>
      {task.dueAt && <p className="text-xs text-slate-600">
        Due {new Date(task.dueAt).toLocaleString()}
        {overdue ? <span className="ml-2 font-semibold text-red-700">Overdue</span> :
          task.reminderDue ? <span className="ml-2 font-semibold text-amber-700">Due soon</span> : null}
      </p>}
      {ready ? <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-xs text-slate-700 space-y-1">
            <span>Assign to</span>
            <select className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
              aria-label="Shopify task assignee" value={assignee} onChange={e=>setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-700 space-y-1">
            <span>Due date and time</span>
            <input type="datetime-local" className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
              value={due} onChange={e=>setDue(e.target.value)} aria-label="Shopify task due date"/>
          </label>
          <label className="text-xs text-slate-700 space-y-1">
            <span>In-app reminder</span>
            <select className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
              aria-label="Shopify task in-app reminder" value={reminder}
              disabled={!due} onChange={e=>setReminder(e.target.value)}>
              <option value="">Off</option>
              <option value="0">At due time</option>
              <option value="15">15 min before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </label>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={save.isPending}
          onClick={()=>save.mutate()}>Save task schedule</Button>
        {save.isError && <p role="alert" className="text-xs text-red-700">Schedule could not be saved. Verify the assignee and due date.</p>}
      </> : <p className="text-xs text-slate-500">Assignment and due dates are awaiting staging database activation.</p>}
      <p className="text-xs text-slate-500">Reminders appear here while viewing Tasks. No automatic email, push, SMS or WhatsApp is sent.</p>
    </div>
  );
}
