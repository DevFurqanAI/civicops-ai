"""Opt-in live Stage 5 verification. Disposable users/data; credentials never printed.
Run from repository root: backend/.venv/Scripts/python.exe backend/tests/live_stage5.py
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
created_storage_paths = []
def check(condition, name):
    if not condition: raise RuntimeError(name + ' failed')
    steps.append(name)

def signup_for_test(role):
    # Password exists only in memory. create_user with email_confirm sends no email.
    email = 'stage5-' + uuid4().hex + '@example.com'
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
        marker = 'Stage5 isolated verification ' + uuid4().hex
        result = api.post('/api/reports',headers=citizen_headers,json={'submission_id':str(uuid4()),
            'text':'A deep pothole needs road repair at the isolated test site '+marker,
            'language':'en','latitude':-80.123456,'longitude':-170.123456,'landmark_text':marker})
        check(result.status_code == 201, 'Live authenticated report submission')
        report = result.json()
        check(report.get('incident_id') == stable_id('incident_seed', report['internal_id']), 'Isolated incident created without matching existing data')
        from io import BytesIO
        from PIL import Image
        import wave
        image = BytesIO(); Image.new('RGB',(24,20),'red').save(image,'PNG')
        media_prefix = '/api/reports/' + report['public_id'] + '/media'
        from backend.routes.media import evidence_id
        upload_id = str(uuid4())
        image_id = evidence_id(report['internal_id'], upload_id)
        created_storage_paths.append(report['internal_id']+'/'+image_id+'.jpg')
        upload_args = {'params':{'upload_id':upload_id,'filename':'evidence.png'},'content':image.getvalue(),
            'headers':{**citizen_headers,'Content-Type':'image/png'}}
        uploaded = api.post(media_prefix,**upload_args)
        check(uploaded.status_code == 201, 'Live private image upload and metadata')
        image_item = uploaded.json()
        check('storage_path' not in image_item and 'url' not in image_item, 'Media API hides object paths and URLs')
        check(api.post(media_prefix,**upload_args).json() == image_item, 'Live image upload retry is idempotent')
        check(api.get(media_prefix,headers=other_headers).status_code == 404, 'Unrelated citizen cannot list media')
        check(api.get(media_prefix+'/'+image_id,headers=other_headers).status_code == 404, 'Unrelated citizen cannot fetch media')
        check(api.get(media_prefix+'/'+image_id,headers=citizen_headers).content[:2] == b'\xff\xd8', 'Owner reads normalized image through FastAPI')
        check(api.get(media_prefix+'/'+image_id,headers=operator_headers).status_code == 200, 'Operator reads authorized report evidence')
        check(not admin.storage.get_bucket('report-evidence').public, 'Evidence bucket is private')
        denied = citizen_auth.storage.from_('report-evidence').list(report['internal_id'])
        check(not denied, 'Citizen cannot list private objects directly')
        try:
            citizen_auth.storage.from_('report-evidence').download(created_storage_paths[-1])
            raise RuntimeError('Citizen direct object download allowed')
        except RuntimeError: raise
        except Exception: check(True, 'Citizen direct object download denied')
        audio = BytesIO()
        with wave.open(audio,'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(8000); wav.writeframes(b'\x00\x00'*8000)
        audio_upload_id = str(uuid4())
        audio_id = evidence_id(report['internal_id'], audio_upload_id)
        created_storage_paths.append(report['internal_id']+'/'+audio_id+'.webm')
        uploaded_audio = api.post(media_prefix,params={'upload_id':audio_upload_id,'filename':'voice.wav'},content=audio.getvalue(),
            headers={**citizen_headers,'Content-Type':'audio/wav'})
        check(uploaded_audio.status_code == 201 and uploaded_audio.json()['media_type'] == 'AUDIO', 'Live audio validation normalization and persistence')
        check(api.get(media_prefix+'/'+audio_id,headers=citizen_headers).headers['content-type'] == 'audio/webm', 'Owner reads normalized voice evidence')
        check(len(api.get('/api/incidents/'+report['incident_id']+'/media',headers=operator_headers).json()) == 2, 'Dashboard lists linked private evidence')
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
    print('Live Stage 5 verification passed:',len(steps),'checks')
    for step in steps: print('PASS:',step)
except Exception as error:
    print('Live verification stopped:',type(error).__name__)
    # Fixed assertion messages are safe. Provider exception messages/bodies are not.
    if isinstance(error,RuntimeError): print(str(error))
    raise SystemExit(1) from None
finally:
    try:
        if created_storage_paths:
            admin.storage.from_('report-evidence').remove(created_storage_paths)
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
    except Exception as cleanup_error:
        print("Verification cleanup requires attention:", type(cleanup_error).__name__)
        raise SystemExit(1) from None
