"""Opt-in live Stage 4 verification. Disposable users/data; credentials never printed.
Run from repository root: backend/.venv/Scripts/python.exe backend/tests/live_stage4.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import secrets
from uuid import uuid4
from dotenv import dotenv_values
from supabase import create_client, ClientOptions
from postgrest.exceptions import APIError
from fastapi.testclient import TestClient
from backend import main
from backend.database import create_backend_client
from backend.repositories.incidents import stable_id

admin = create_backend_client()
front = dotenv_values('frontend/.env')
url, key = front.get('VITE_SUPABASE_URL'), front.get('VITE_SUPABASE_PUBLISHABLE_KEY')
if not url or not key or not key.startswith('sb_publishable_'):
    raise SystemExit('Public frontend Auth configuration is missing or invalid')
from os import environ
if url.rstrip('/') != environ['SUPABASE_URL'].rstrip('/'):
    raise SystemExit('Frontend/backend Supabase projects differ')
created_users = []
auth_clients = []
steps = []
def check(condition, name):
    if not condition: raise RuntimeError(name + ' failed')
    steps.append(name)

def signup_for_test(role):
    # Password exists only in memory. create_user with email_confirm sends no email.
    email = 'stage4-' + uuid4().hex + '@example.com'
    password = secrets.token_urlsafe(36)
    user = admin.auth.admin.create_user({'email':email,'password':password,'email_confirm':True,
        'user_metadata':{'role':'ADMIN'}}).user
    created_users.append(user.id)
    profile = admin.table('profiles').select('role').eq('id',user.id).execute().data[0]
    check(profile['role'] == 'CITIZEN', 'Signup metadata cannot promote ' + role)
    if role == 'OPERATOR': admin.table('profiles').update({'role':'OPERATOR'}).eq('id',user.id).execute()
    client = create_client(url,key,options=ClientOptions(persist_session=False,auto_refresh_token=False))
    auth_clients.append(client)
    session = client.auth.sign_in_with_password({'email':email,'password':password}).session
    return user.id, {'Authorization':'Bearer '+session.access_token}, client

try:
    citizen, citizen_headers, citizen_auth = signup_for_test('CITIZEN')
    operator, operator_headers, _ = signup_for_test('OPERATOR')
    other, other_headers, _ = signup_for_test('UNRELATED_CITIZEN')
    with TestClient(main.app) as api:
        check(api.get('/api/auth/me').status_code == 401, 'Missing token denied')
        check(api.get('/api/auth/me',headers={'Authorization':'Bearer invalid'}).status_code == 401, 'Invalid token denied')
        check(api.get('/api/auth/me',headers=citizen_headers).json().get('role') == 'CITIZEN', 'Real citizen JWT and profile verified')
        check(api.get('/api/auth/me',headers=operator_headers).json().get('role') == 'OPERATOR', 'Real operator JWT and profile verified')
        check(api.get('/api/incidents',headers=citizen_headers).status_code == 403, 'Citizen dashboard access denied')
        marker = 'Stage4 isolated verification ' + uuid4().hex
        result = api.post('/api/reports',headers=citizen_headers,json={'submission_id':str(uuid4()),
            'text':'A deep pothole needs road repair at the isolated test site '+marker,
            'language':'en','latitude':-80.123456,'longitude':-170.123456,'landmark_text':marker})
        check(result.status_code == 201, 'Live authenticated report submission')
        report = result.json()
        check(report.get('incident_id') == stable_id('incident_seed', report['internal_id']), 'Isolated incident created without matching existing data')
        prefix = '/api/incidents/' + report['incident_id']
        check(api.post(prefix+'/status',headers=citizen_headers,json={'status':'VERIFIED'}).status_code == 403, 'Citizen mutation denied')
        check(api.post(prefix+'/status',headers=operator_headers,json={'status':'RESOLVED'}).status_code == 409, 'Invalid jump rejected')
        detail = api.get(prefix,headers=operator_headers).json()
        stale_version = detail['updated_at']
        def action(endpoint, body, name):
            response = api.post(prefix+endpoint,headers=operator_headers,json=body)
            check(response.status_code == 200, name)
        action('/status',{'status':'VERIFIED','notes':'Private live verification note'}, 'Atomic status/history/audit write')
        for department in ['ROAD_MAINTENANCE','WATER_SUPPLY']:
            action('/assign',{'department':department}, 'Assignment to '+department)
        assignments = admin.table('incident_assignments').select('*').eq('incident_id',report['incident_id']).execute().data
        check(len(assignments)==2 and sum(r['completed_at'] is None for r in assignments)==1, 'Assignment history and active completion persisted')
        check(api.post(prefix+'/status',headers=operator_headers,json={'status':'ASSIGNED','expected_updated_at':stale_version}).status_code == 409, 'Stale version rejected')
        action('/response-plan',{'action':'MODIFY','response_plan':['Inspect the test location','Repair only after human review']}, 'Explicit JSON array validation and modified plan')
        action('/response-plan',{'action':'REJECT'}, 'Response plan rejection audited')
        action('/response-plan',{'action':'MODIFY','response_plan':['Inspect and safely repair test road damage']}, 'Rejected plan revised')
        action('/response-plan',{'action':'APPROVE'}, 'Human response plan approval')
        action('/status',{'status':'ASSIGNED'}, 'Verified to assigned')
        action('/status',{'status':'IN_PROGRESS'}, 'Approved plan permits in-progress')
        action('/notes',{'notes':'Private live operational note'}, 'Private note persisted')
        action('/status',{'status':'RESOLVED'}, 'Incident resolved with history')
        tracking_path = '/api/reports/'+report['public_id']+'/tracking'
        tracking = api.get(tracking_path,headers=citizen_headers).json()
        check(len(tracking['history'])==5 and 'Private' not in str(tracking) and operator not in str(tracking), 'Safe real tracking history')
        check(api.get(tracking_path,headers=other_headers).status_code==404, 'Unrelated tracking denied')
        body = {'public_id':report['public_id'],'incident_id':report['incident_id'],'response':'NO'}
        check(api.post('/api/feedback',headers=other_headers,json=body).status_code==403, 'Unrelated feedback denied')
        feedback = api.post('/api/feedback',headers=citizen_headers,json=body)
        check(feedback.status_code==201 and feedback.json()['review_requested'], 'Owned feedback and review flag persisted')
        check(api.post('/api/feedback',headers=citizen_headers,json=body).status_code==409, 'Duplicate feedback rejected')
        check(api.get(prefix,headers=operator_headers).json()['status']=='RESOLVED', 'Negative feedback does not reopen')
        history = admin.table('incident_status_history').select('*').eq('incident_id',report['incident_id']).execute().data
        check(any(r.get('changed_by')==operator for r in history), 'Status history actor persisted')
        audit = admin.table('audit_logs').select('action').eq('incident_id',report['incident_id']).execute().data
        check({'INCIDENT_STATUS_CHANGED','INCIDENT_DEPARTMENT_ASSIGNED','RESPONSE_PLAN_APPROVE','RESOLUTION_FEEDBACK_REVIEW_REQUESTED'} <= {r['action'] for r in audit}, 'Audit events persisted')
        fresh = create_backend_client()
        check(fresh.table('resolution_feedback').select('id').eq('report_id',report['internal_id']).execute().data != [], 'Fresh client reads durable feedback')
        fresh.postgrest.aclose()
        try:
            citizen_auth.rpc('civicops_change_incident_status',{'p_incident_id':report['incident_id'],'p_actor_id':operator,
                'p_expected_updated_at':detail['updated_at'],'p_new_status':'REOPENED'}).execute()
            raise RuntimeError('Browser RPC execution was allowed')
        except APIError as error:
            check(error.code in {'42501','PGRST202'}, 'Browser direct RPC execution denied')
    print('Live Stage 4 verification passed:',len(steps),'checks')
    for step in steps: print('PASS:',step)
except Exception as error:
    print('Live verification stopped:',type(error).__name__)
    # Fixed assertion messages are safe. Provider exception messages/bodies are not.
    if isinstance(error,RuntimeError): print(str(error))
    raise SystemExit(1) from None
finally:
    if created_users:
        reports = admin.table('reports').select('id').in_('reporter_id',created_users).execute().data
        report_ids = [r['id'] for r in reports]
        incident_ids = [stable_id('incident_seed',identity) for identity in report_ids]
        if incident_ids:
            links = admin.table('incident_reports').select('report_id').in_('incident_id',incident_ids).execute().data
            if any(link['report_id'] not in report_ids for link in links):
                raise RuntimeError('Cleanup refused: test incident contains unrelated reports')
            for table in ['resolution_feedback','incident_assignments','incident_status_history','audit_logs','incident_reports']:
                admin.table(table).delete().in_('incident_id',incident_ids).execute()
            admin.table('incidents').delete().in_('id',incident_ids).execute()
        if report_ids:
            admin.table('report_media').delete().in_('report_id',report_ids).execute()
            admin.table('reports').delete().in_('id',report_ids).execute()
        for identity in created_users: admin.auth.admin.delete_user(identity)
        print('Disposable verification records and accounts removed')
    for client in auth_clients:
        try: client.auth.sign_out()
        except Exception: pass
        client.postgrest.aclose()
    admin.postgrest.aclose()
