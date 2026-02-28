// apps/frontend/src/components/seller-prep/ProgressTimeline.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle, XCircle, Clock } from "lucide-react";
import { format, parseISO, differenceInDays, startOfDay } from "date-fns";

interface TimelineItem {
  id: string;
  title: string;
  status: string;
  completedAt?: string;
  skippedAt?: string;
  createdAt?: string;
}

interface ProgressTimelineProps {
  items: TimelineItem[];
  startDate: string; // When plan was created
}

export function ProgressTimeline({ items, startDate }: ProgressTimelineProps) {
  // Get all completed/skipped items with dates
  const completedItems = items
    .filter((item) => item.completedAt || item.skippedAt)
    .map((item) => ({
      ...item,
      actionDate: item.completedAt || item.skippedAt!,
      action: item.completedAt ? "completed" : "skipped",
    }))
    .sort((a, b) => new Date(a.actionDate).getTime() - new Date(b.actionDate).getTime());

  // Calculate stats
  const totalItems = items.length;
  const doneItems = items.filter((i) => i.status === "DONE").length;
  const skippedItems = items.filter((i) => i.status === "SKIPPED").length;
  const remainingItems = totalItems - doneItems - skippedItems;

  const daysSinceStart = differenceInDays(new Date(), parseISO(startDate));
  const tasksPerWeek = completedItems.length > 0 
    ? ((completedItems.length / Math.max(daysSinceStart, 1)) * 7).toFixed(1)
    : "0";

  // Estimate completion date
  const estimatedDaysRemaining = remainingItems > 0 && parseFloat(tasksPerWeek) > 0
    ? Math.ceil(remainingItems / (parseFloat(tasksPerWeek) / 7))
    : 0;
  
  const estimatedCompletionDate = estimatedDaysRemaining > 0
    ? new Date(Date.now() + estimatedDaysRemaining * 24 * 60 * 60 * 1000)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Progress Timeline
        </CardTitle>
        <CardDescription>
          Track your preparation journey over time
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <div className="text-2xl font-bold text-green-700">{doneItems}</div>
            <div className="text-xs text-green-600">Completed</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-2xl font-bold text-gray-700">{skippedItems}</div>
            <div className="text-xs text-gray-600">Skipped</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{tasksPerWeek}</div>
            <div className="text-xs text-blue-600">Tasks/Week</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{daysSinceStart}</div>
            <div className="text-xs text-purple-600">Days Active</div>
          </div>
        </div>

        {/* Estimated Completion */}
        {estimatedCompletionDate && remainingItems > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                Estimated Completion
              </span>
            </div>
            <p className="text-sm text-blue-800">
              At your current pace, you'll complete all tasks by{" "}
              <strong>{format(estimatedCompletionDate, "MMMM d, yyyy")}</strong>
              {" "}({estimatedDaysRemaining} days remaining)
            </p>
          </div>
        )}

        {/* Timeline */}
        {completedItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tasks completed yet. Start checking off items to see your progress!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Activity History</h4>
            <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
              {completedItems.map((item, idx) => {
                const isCompleted = item.action === "completed";
                const date = parseISO(item.actionDate);
                
                return (
                  <div key={item.id} className="relative pl-6 pb-2">
                    {/* Timeline dot */}
                    <div
                      className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${
                        isCompleted
                          ? "bg-green-500 border-green-500"
                          : "bg-gray-400 border-gray-400"
                      }`}
                    />

                    {/* Content */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-gray-600" />
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {format(date, "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <Badge
                        variant={isCompleted ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {isCompleted ? "Completed" : "Skipped"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Motivational Message */}
        {doneItems > 0 && remainingItems > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm text-gray-600">
              🎯 Keep going! You've completed <strong>{doneItems}</strong> of{" "}
              <strong>{totalItems}</strong> tasks.{" "}
              {remainingItems === 1 
                ? "Just 1 more to go!" 
                : `${remainingItems} more to go!`}
            </p>
          </div>
        )}

        {/* All Done Message */}
        {remainingItems === 0 && doneItems > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-green-900">
              🎉 Congratulations! All tasks completed!
            </p>
            <p className="text-xs text-green-700 mt-1">
              Your home is ready to list. Time to connect with an agent!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}