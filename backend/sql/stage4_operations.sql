-- Stage 4: apply as the database owner in Supabase SQL Editor.
-- No tables, columns, RLS policies, signup triggers or user roles are changed.
-- Only the server service_role may execute these functions. JWT verification
-- and the actor UUID come from FastAPI; profiles roles are checked again here.
-- Each RPC is one PostgreSQL transaction. Any exception rolls back every write.
BEGIN;

CREATE OR REPLACE FUNCTION public.civicops_change_incident_status(
  p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz,
  p_new_status text, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.incidents%ROWTYPE; actor_role text; targets text[]; old_status text; t timestamptz := clock_timestamp();
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
  -- BEGIN GENERATED STATUS POLICY
  -- Source: backend/services/operations.py; regenerate with python -m backend.sql.render_status_policy
  targets := CASE i.status
    WHEN 'RECEIVED' THEN ARRAY['VERIFIED','NEEDS_REVIEW']
    WHEN 'NEEDS_REVIEW' THEN ARRAY['VERIFIED','REJECTED']
    WHEN 'VERIFIED' THEN ARRAY['ASSIGNED','NEEDS_REVIEW']
    WHEN 'ASSIGNED' THEN ARRAY['IN_PROGRESS','NEEDS_REVIEW']
    WHEN 'IN_PROGRESS' THEN ARRAY['RESOLVED','NEEDS_REVIEW']
    WHEN 'RESOLVED' THEN ARRAY['REOPENED']
    WHEN 'REOPENED' THEN ARRAY['ASSIGNED','IN_PROGRESS','NEEDS_REVIEW']
    ELSE ARRAY[]::text[] END;
  -- END GENERATED STATUS POLICY
  IF p_new_status IS NULL OR NOT (p_new_status = ANY(targets)) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Invalid status transition';
  END IF;
  IF length(coalesce(p_notes,'')) > 2000 OR (p_new_status = 'REJECTED' AND length(btrim(coalesce(p_notes,''))) = 0) THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid notes or missing rejection reason';
  END IF;
  IF p_new_status = 'ASSIGNED' AND i.current_department_id IS NULL THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Assign a department first';
  END IF;
  IF p_new_status = 'IN_PROGRESS' AND i.response_plan_status <> 'APPROVED' THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Human response plan approval required';
  END IF;
  old_status := i.status;
  UPDATE public.incidents SET status = p_new_status, updated_at = t,
    resolved_at = CASE WHEN p_new_status = 'RESOLVED' THEN t WHEN p_new_status = 'REOPENED' THEN NULL ELSE resolved_at END
    WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.incident_status_history(incident_id,old_status,new_status,notes,changed_by,created_at)
    VALUES(i.id,old_status,p_new_status,p_notes,p_actor_id,t);
  INSERT INTO public.audit_logs(actor_type,actor_id,incident_id,action,old_value,new_value,details,created_at)
    VALUES(actor_role,p_actor_id,i.id,'INCIDENT_STATUS_CHANGED',jsonb_build_object('status',old_status),
      jsonb_build_object('status',p_new_status),'{}'::jsonb,t);
  RETURN jsonb_build_object('incident_id',i.id,'status',i.status,'updated_at',i.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.civicops_assign_incident_department(
  p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz,
  p_department_id uuid, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.incidents%ROWTYPE; actor_role text; old_department uuid; assignment_id uuid; t timestamptz := clock_timestamp();
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id FOR SHARE;
  IF actor_role IS NULL OR actor_role NOT IN ('OPERATOR','ADMIN') THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Operator access required'; END IF;
  SELECT * INTO i FROM public.incidents WHERE id = p_incident_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Incident not found'; END IF;
  IF p_expected_updated_at IS NULL OR i.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Incident changed; refresh before retrying';
  END IF;
  IF i.status IN ('RESOLVED','REJECTED') THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'Cannot assign a closed incident'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.departments WHERE id = p_department_id AND is_active) THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Active department required';
  END IF;
  IF length(coalesce(p_notes,'')) > 2000 THEN RAISE SQLSTATE 'PT422' USING MESSAGE = 'Notes too long'; END IF;
  old_department := i.current_department_id;
  UPDATE public.incident_assignments SET completed_at = t
    WHERE incident_id = i.id AND completed_at IS NULL;
  INSERT INTO public.incident_assignments(incident_id,department_id,assigned_by,assigned_at,notes)
    VALUES(i.id,p_department_id,p_actor_id,t,p_notes) RETURNING id INTO assignment_id;
  UPDATE public.incidents SET current_department_id = p_department_id, updated_at = t WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.audit_logs(actor_type,actor_id,incident_id,action,old_value,new_value,details,created_at)
    VALUES(actor_role,p_actor_id,i.id,'INCIDENT_DEPARTMENT_ASSIGNED',jsonb_build_object('department_id',old_department),
      jsonb_build_object('department_id',p_department_id),jsonb_build_object('assignment_id',assignment_id),t);
  RETURN jsonb_build_object('incident_id',i.id,'department_id',i.current_department_id,'assignment_id',assignment_id,'updated_at',i.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.civicops_review_incident_response_plan(
  p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz,
  p_action text, p_response_plan jsonb DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.incidents%ROWTYPE; actor_role text; old_plan jsonb; old_plan_status text; t timestamptz := clock_timestamp();
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id FOR SHARE;
  IF actor_role IS NULL OR actor_role NOT IN ('OPERATOR','ADMIN') THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Operator access required'; END IF;
  SELECT * INTO i FROM public.incidents WHERE id = p_incident_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Incident not found'; END IF;
  IF p_expected_updated_at IS NULL OR i.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Incident changed; refresh before retrying';
  END IF;
  IF i.status IN ('RESOLVED','REJECTED') THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'Cannot review a closed incident'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('APPROVE','MODIFY','REJECT') OR length(coalesce(p_notes,'')) > 2000 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid plan action';
  END IF;
  IF p_action = 'MODIFY' THEN
    IF p_response_plan IS NULL OR jsonb_typeof(p_response_plan) <> 'array' THEN
      RAISE SQLSTATE 'PT422' USING MESSAGE = 'Plan must be an array';
    END IF;
    IF jsonb_array_length(p_response_plan) NOT BETWEEN 1 AND 30 OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_response_plan) AS elem(value)
      WHERE jsonb_typeof(value) <> 'string' OR length(btrim(value #>> '{}')) = 0 OR length(value #>> '{}') > 1000
    ) THEN RAISE SQLSTATE 'PT422' USING MESSAGE = 'Plan must contain nonempty text steps'; END IF;
  ELSIF p_response_plan IS NOT NULL THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Only modify accepts a replacement plan';
  END IF;
  IF p_action = 'APPROVE' AND (jsonb_typeof(i.response_plan) <> 'array' OR jsonb_array_length(i.response_plan) = 0
     OR i.response_plan_status NOT IN ('PENDING','MODIFIED')) THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'An unapproved nonempty plan is required';
  END IF;
  old_plan := i.response_plan; old_plan_status := i.response_plan_status;
  UPDATE public.incidents SET
    response_plan = CASE WHEN p_action = 'MODIFY' THEN p_response_plan ELSE response_plan END,
    response_plan_status = CASE p_action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'MODIFY' THEN 'MODIFIED' ELSE 'REJECTED' END,
    response_plan_approved_by = CASE WHEN p_action = 'APPROVE' THEN p_actor_id ELSE NULL END,
    response_plan_approved_at = CASE WHEN p_action = 'APPROVE' THEN t ELSE NULL END,
    updated_at = t WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.audit_logs(actor_type,actor_id,incident_id,action,old_value,new_value,details,created_at)
    VALUES(actor_role,p_actor_id,i.id,'RESPONSE_PLAN_' || p_action,
      jsonb_build_object('response_plan',old_plan,'response_plan_status',old_plan_status),
      jsonb_build_object('response_plan',i.response_plan,'response_plan_status',i.response_plan_status),
      jsonb_build_object('notes',p_notes),t);
  RETURN jsonb_build_object('incident_id',i.id,'response_plan',i.response_plan,'response_plan_status',i.response_plan_status,'updated_at',i.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.civicops_submit_resolution_feedback(
  p_report_id uuid, p_incident_id uuid, p_actor_id uuid, p_response text, p_comment text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor_role text; i public.incidents%ROWTYPE; feedback_id uuid; t timestamptz := clock_timestamp();
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id FOR SHARE;
  IF actor_role IS DISTINCT FROM 'CITIZEN' THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Citizen access required'; END IF;
  SELECT * INTO i FROM public.incidents WHERE id = p_incident_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING MESSAGE = 'Incident not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.reports r JOIN public.incident_reports ir ON ir.report_id = r.id
    WHERE r.id = p_report_id AND r.reporter_id = p_actor_id AND r.archived_at IS NULL AND ir.incident_id = i.id) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'Feedback requires your linked report';
  END IF;
  IF i.status <> 'RESOLVED' THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'Feedback requires a resolved incident'; END IF;
  IF p_response IS NULL OR p_response NOT IN ('YES','PARTIALLY','NO') OR length(coalesce(p_comment,'')) > 2000 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid feedback';
  END IF;
  -- Existing UNIQUE(report_id, incident_id) rejects duplicates; no upsert.
  INSERT INTO public.resolution_feedback(report_id,incident_id,user_id,response,comment,created_at)
    VALUES(p_report_id,i.id,p_actor_id,p_response,p_comment,t) RETURNING id INTO feedback_id;
  INSERT INTO public.audit_logs(actor_type,actor_id,report_id,incident_id,action,details,created_at)
    VALUES('USER',p_actor_id,p_report_id,i.id,
      CASE WHEN p_response = 'NO' THEN 'RESOLUTION_FEEDBACK_REVIEW_REQUESTED' ELSE 'RESOLUTION_FEEDBACK_SUBMITTED' END,
      jsonb_build_object('response',p_response,'review_requested',p_response IN ('NO','PARTIALLY')),t);
  -- Feedback never changes incident status or implicitly reopens an incident.
  RETURN jsonb_build_object('feedback_id',feedback_id,'response',p_response,'review_requested',p_response IN ('NO','PARTIALLY'));
END;
$$;

REVOKE ALL ON FUNCTION public.civicops_change_incident_status(uuid,uuid,timestamptz,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.civicops_assign_incident_department(uuid,uuid,timestamptz,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.civicops_review_incident_response_plan(uuid,uuid,timestamptz,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.civicops_submit_resolution_feedback(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.civicops_change_incident_status(uuid,uuid,timestamptz,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.civicops_assign_incident_department(uuid,uuid,timestamptz,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.civicops_review_incident_response_plan(uuid,uuid,timestamptz,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.civicops_submit_resolution_feedback(uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
