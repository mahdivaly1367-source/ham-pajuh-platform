CREATE UNIQUE INDEX collaboration_request_pending_unique
ON collaboration_request(project_id, user_id)
WHERE status = 'pending';
