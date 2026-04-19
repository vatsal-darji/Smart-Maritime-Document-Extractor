export type UpdateQueueLogHistoryType = {
  id?: bigint;
  queue_id?: string;
  process_name?: string;
  status?: string;
  data?: string | null;
  error?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};
