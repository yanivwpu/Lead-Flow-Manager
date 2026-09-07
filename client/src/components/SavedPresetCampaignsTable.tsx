import type { MouseEvent } from "react";
import { format } from "date-fns";
import {
  Copy,
  Eye,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Rocket,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPresetCampaignStepCount } from "@shared/campaignPlaceholders";
import { getSavedCampaignSourceLabel } from "@shared/localizedTemplates";
import type { PresetCampaignListItem } from "@/lib/presetCampaignTypes";

type Props = {
  campaigns: PresetCampaignListItem[];
  onOpen: (id: string, edit?: boolean) => void;
  onActivate: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function SavedPresetCampaignsTable({
  campaigns,
  onOpen,
  onActivate,
  onPause,
  onResume,
  onDuplicate,
  onDelete,
}: Props) {
  return (
    <div className="overflow-x-auto overflow-y-visible rounded-lg border border-gray-100 touch-pan-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead className="hidden sm:table-cell">Based on</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Channel</TableHead>
            <TableHead className="text-right">Steps</TableHead>
            <TableHead className="text-right hidden sm:table-cell tabular-nums">Enrolled</TableHead>
            <TableHead className="text-right hidden md:table-cell tabular-nums">Sent</TableHead>
            <TableHead className="text-right hidden md:table-cell tabular-nums">Failed</TableHead>
            <TableHead className="hidden lg:table-cell">Updated</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((row) => {
            const steps =
              typeof row.stepCount === "number"
                ? row.stepCount
                : getPresetCampaignStepCount(row.messages);
            const ex = row.executionStats;
            const updated =
              row.updatedAt && !Number.isNaN(new Date(row.updatedAt).getTime())
                ? format(new Date(row.updatedAt), "MMM d, yyyy p")
                : "—";
            return (
              <TableRow
                key={row.id}
                data-testid={`saved-campaign-${row.id}`}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onOpen(row.id)}
              >
                <TableCell className="font-medium text-gray-900 max-w-[140px] truncate">
                  {row.name}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-gray-700 max-w-[200px] truncate">
                  {getSavedCampaignSourceLabel(row.sourcePresetId)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="text-[11px] font-normal whitespace-normal max-w-[200px] text-left h-auto py-1"
                  >
                    {row.statusLabel || row.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell capitalize text-gray-700">
                  {row.channel}
                </TableCell>
                <TableCell className="text-right tabular-nums">{steps}</TableCell>
                <TableCell className="text-right hidden sm:table-cell tabular-nums text-gray-700">
                  {ex?.enrollmentCount ?? 0}
                </TableCell>
                <TableCell className="text-right hidden md:table-cell tabular-nums text-gray-700">
                  {ex?.sentStepEvents ?? 0}
                </TableCell>
                <TableCell className="text-right hidden md:table-cell tabular-nums text-gray-700">
                  {ex?.failedStepEvents ?? 0}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-gray-500 text-sm whitespace-nowrap">
                  {updated}
                </TableCell>
                <TableCell
                  className="text-right p-1"
                  onClick={(e: MouseEvent<HTMLTableCellElement>) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label="Campaign actions"
                        data-testid={`saved-campaign-actions-${row.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onOpen(row.id)} className="cursor-pointer">
                        <Eye className="h-4 w-4 mr-2 shrink-0" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onOpen(row.id, true)}
                        className="cursor-pointer"
                      >
                        <Pencil className="h-4 w-4 mr-2 shrink-0" />
                        Edit
                      </DropdownMenuItem>
                      {(row.status === "draft" || row.status === "active_pending") && (
                        <DropdownMenuItem className="cursor-pointer" onClick={() => onActivate(row.id)}>
                          <Rocket className="h-4 w-4 mr-2 shrink-0" />
                          Activate
                        </DropdownMenuItem>
                      )}
                      {(row.status === "active_pending" || row.status === "active") && (
                        <DropdownMenuItem className="cursor-pointer" onClick={() => onPause(row.id)}>
                          <Pause className="h-4 w-4 mr-2 shrink-0" />
                          Pause
                        </DropdownMenuItem>
                      )}
                      {row.status === "paused" && (
                        <DropdownMenuItem className="cursor-pointer" onClick={() => onResume(row.id)}>
                          <Play className="h-4 w-4 mr-2 shrink-0" />
                          Resume
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer" onClick={() => onDuplicate(row.id)}>
                        <Copy className="h-4 w-4 mr-2 shrink-0" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer text-red-600 focus:text-red-600"
                        onClick={() => onDelete(row.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2 shrink-0" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
