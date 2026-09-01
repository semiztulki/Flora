import { api } from "./client";
import { ReportAdminView, ReportCategory, ReportSubmitResult } from "../types";

export async function submitReport(payload: {
  reportedUin: number;
  category: ReportCategory;
  comment?: string;
  messageId?: number;
  groupMessageId?: number;
}): Promise<ReportSubmitResult> {
  const { data } = await api.post<ReportSubmitResult>("/reports", {
    reported_uin: payload.reportedUin,
    category: payload.category,
    comment: payload.comment,
    message_id: payload.messageId,
    group_message_id: payload.groupMessageId,
  });
  return data;
}

export async function fetchOpenReports(): Promise<ReportAdminView[]> {
  const { data } = await api.get<ReportAdminView[]>("/reports", { params: { resolved: false } });
  return data;
}

export async function resolveReport(reportId: number): Promise<void> {
  await api.post(`/reports/${reportId}/resolve`);
}
