"""Check the reviewed artifact matches policy and grants; not a live SQL test."""
from pathlib import Path
from backend.sql.render_status_policy import policy_sql, START, END

SQL = Path(__file__).resolve().parents[1] / "sql" / "stage4_operations.sql"
def test_generated_transitions_match_central_policy():
    source = SQL.read_text(encoding="utf-8")
    assert source[source.index(START):source.index(END)+len(END)] == policy_sql()

def test_each_rpc_has_server_only_grants_and_no_security_definer():
    source = SQL.read_text(encoding="utf-8")
    names = ["civicops_change_incident_status", "civicops_assign_incident_department",
             "civicops_review_incident_response_plan", "civicops_submit_resolution_feedback"]
    for name in names:
        assert f"REVOKE ALL ON FUNCTION public.{name}" in source
        assert f"GRANT EXECUTE ON FUNCTION public.{name}" in source
    assert source.count("FROM PUBLIC, anon, authenticated;") == 4
    assert source.count("TO service_role;") == 4
    assert "SECURITY DEFINER" not in source
    assert source.count("SECURITY INVOKER SET search_path = ''") == 4


def test_assignment_closes_only_prior_active_rows_before_insert():
    source = SQL.read_text(encoding="utf-8")
    assignment = source.split("CREATE OR REPLACE FUNCTION public.civicops_assign_incident_department(", 1)[1].split("\n$$;", 1)[0]
    close = "UPDATE public.incident_assignments SET completed_at = t\n    WHERE incident_id = i.id AND completed_at IS NULL;"
    assert close in assignment
    assert assignment.index("FOR UPDATE") < assignment.index(close)
    assert assignment.index(close) < assignment.index("INSERT INTO public.incident_assignments")
    assert "VALUES(i.id,p_department_id,p_actor_id,t,p_notes)" in assignment
    assert "DELETE FROM public.incident_assignments" not in assignment


def test_plan_validation_uses_explicit_json_value_column():
    source = SQL.read_text(encoding="utf-8")
    plan = source.split("CREATE OR REPLACE FUNCTION public.civicops_review_incident_response_plan(", 1)[1].split("\n$$;", 1)[0]
    assert "FROM jsonb_array_elements(p_response_plan) AS elem(value)" in plan
    assert "jsonb_typeof(value) <> 'string'" in plan
    assert "length(btrim(value #>> '{}')) = 0" in plan
    assert "length(value #>> '{}') > 1000" in plan
    assert "jsonb_typeof(item)" not in plan
