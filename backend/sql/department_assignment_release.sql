-- Apply after department_portal.sql. Additive, repeatable RPC-only patch.
BEGIN;
CREATE OR REPLACE FUNCTION public.civicops_assign_and_release_incident(
  p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz,
  p_department_id uuid, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.incidents%ROWTYPE; actor_role text; result jsonb;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id FOR SHARE;
  IF actor_role IS NULL OR actor_role NOT IN ('OPERATOR','ADMIN') THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'Operator access required';
  END IF;
  SELECT * INTO i FROM public.incidents WHERE id = p_incident_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Incident not found'; END IF;
  IF p_expected_updated_at IS NULL OR i.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Incident changed; refresh before retrying';
  END IF;
  IF i.status NOT IN ('VERIFIED','ASSIGNED','ACCEPTED','IN_PROGRESS','RESOLVED_PENDING_VERIFICATION','REOPENED') THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Verify the incident before assigning and releasing it';
  END IF;
  -- Nested RPC calls run in THIS transaction, not separate HTTP requests.
  -- Any failure rolls back assignment, release, history and all audit events.
  result := public.civicops_assign_incident_department(
    p_incident_id,p_actor_id,p_expected_updated_at,p_department_id,p_notes);
  SELECT * INTO i FROM public.incidents WHERE id = p_incident_id;
  IF i.status <> 'ASSIGNED' THEN
    PERFORM public.civicops_change_incident_status(
      p_incident_id,p_actor_id,i.updated_at,'ASSIGNED',p_notes);
    SELECT * INTO i FROM public.incidents WHERE id = p_incident_id;
  END IF;
  RETURN result || jsonb_build_object('status',i.status,'updated_at',i.updated_at);
END;
$$;
REVOKE ALL ON FUNCTION public.civicops_assign_and_release_incident(uuid,uuid,timestamptz,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.civicops_assign_and_release_incident(uuid,uuid,timestamptz,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
