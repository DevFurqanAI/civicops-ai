import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { AlertCircle, Shield, Clock, CheckCircle, MapPin, ArrowLeft, Bot, Filter, AlertTriangle, ShieldCheck, UserCog, ServerCrash, Inbox } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const mockIncidents = [
  { id: 'INC-901', title: 'Severe Flooding on Main Road', category: 'Infrastructure', priority: 'CRITICAL', status: 'Under Review', location: { lat: 31.5204, lng: 74.3587, text: 'Gulberg III' }, evidence: 'HIGH', reports: 14, spamRisk: 'LOW', aiConfidence: 94, aiSummary: "Multiple visual reports confirm severe waterlogging. Immediate dispatch of WASA drainage units recommended.", suggestedDept: 'WASA', independentReports: 12 },
  { id: 'INC-902', title: 'Suspicious Activity Reported', category: 'Security', priority: 'HIGH', status: 'Assigned', location: { lat: 31.5497, lng: 74.3436, text: 'Liberty Market' }, evidence: 'MEDIUM', reports: 3, spamRisk: 'LOW', aiConfidence: 78, aiSummary: "Audio analysis detected raised voices. Matching patterns with 2 recent reports.", suggestedDept: 'Police', independentReports: 3 },
  { id: 'INC-903', title: 'Broken Streetlights', category: 'Maintenance', priority: 'LOW', status: 'Received', location: { lat: 31.4697, lng: 74.2728, text: 'Johar Town' }, evidence: 'LOW', reports: 5, spamRisk: 'HIGH', aiConfidence: 45, aiSummary: "Multiple identical reports originating from the same device IP. Flagged for manual review.", suggestedDept: 'LDA', independentReports: 1 }
];

export default function OperationsDashboard() {
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  
  // Task 13: Manage API states (success, empty, error)
  const [apiState, setApiState] = useState<'success' | 'empty' | 'error'>('success');
  const [incidents, setIncidents] = useState(mockIncidents);

  // Debug controls to show judges the different states
  const toggleApiState = (state: 'success' | 'empty' | 'error') => {
    setApiState(state);
    if (state === 'empty') setIncidents([]);
    if (state === 'success') setIncidents(mockIncidents);
  };

  const activeData = incidents.find(inc => inc.id === selectedIncident);

  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      const matchPriority = filterPriority === 'ALL' || inc.priority === filterPriority;
      const matchCategory = filterCategory === 'ALL' || inc.category === filterCategory;
      return matchPriority && matchCategory;
    });
  }, [filterPriority, filterCategory, incidents]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative">
      
      {/* Hackathon Debug Bar - Remove in production */}
      <div className="bg-slate-800 text-xs text-white p-2 flex justify-center gap-4 z-50">
        <span className="opacity-50">Simulate Backend:</span>
        <button onClick={() => toggleApiState('success')} className={`hover:text-emerald-400 ${apiState === 'success' ? 'text-emerald-400 font-bold' : ''}`}>Normal</button>
        <button onClick={() => toggleApiState('empty')} className={`hover:text-amber-400 ${apiState === 'empty' ? 'text-amber-400 font-bold' : ''}`}>Empty DB</button>
        <button onClick={() => toggleApiState('error')} className={`hover:text-red-400 ${apiState === 'error' ? 'text-red-400 font-bold' : ''}`}>Server Down</button>
      </div>

      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md z-20 relative">
        <div className="flex items-center gap-3">
          <Shield className="text-red-500" size={28} />
          <h1 className="text-xl font-bold tracking-wide">CivicOps <span className="text-slate-400 font-light">Command Center</span></h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${apiState === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            {apiState === 'success' ? 'System Online' : 'System Offline'}
          </span>
          <div className="w-10 h-10 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center font-bold text-slate-300">OP</div>
        </div>
      </header>

      {/* Task 13: API Error State */}
      {apiState === 'error' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-red-50 text-red-500 p-6 rounded-full mb-4">
            <ServerCrash size={64} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Unable to load data.</h2>
          <p className="text-slate-500 max-w-md">The CivicOps backend is currently unresponsive. Please check your connection and try again.</p>
          <button onClick={() => toggleApiState('success')} className="mt-6 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-colors">Retry Connection</button>
        </div>
      ) : (
        <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
          {/* Summary Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-slate-100 p-3 rounded-xl text-slate-600"><AlertCircle size={24} /></div>
              <div><p className="text-sm font-medium text-slate-500">Active Incidents</p><p className="text-2xl font-bold text-slate-800">{incidents.length}</p></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-red-50 p-3 rounded-xl text-red-600"><Shield size={24} /></div>
              <div><p className="text-sm font-medium text-slate-500">Critical Priority</p><p className="text-2xl font-bold text-red-600">{incidents.filter(i => i.priority === 'CRITICAL').length}</p></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-amber-50 p-3 rounded-xl text-amber-600"><Clock size={24} /></div>
              <div><p className="text-sm font-medium text-slate-500">Awaiting Verification</p><p className="text-2xl font-bold text-amber-600">{incidents.filter(i => i.status === 'Under Review' || i.status === 'Received').length}</p></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><CheckCircle size={24} /></div>
              <div><p className="text-sm font-medium text-slate-500">Resolved Today</p><p className="text-2xl font-bold text-emerald-600">12</p></div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
            
            {/* Interactive Map */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative z-10 flex flex-col">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                <h2 className="font-bold text-slate-800 flex items-center gap-2"><MapPin size={18} className="text-slate-400" /> Live Incident Map</h2>
              </div>
              <div className="flex-1 w-full h-full bg-slate-100">
                <MapContainer center={[31.5204, 74.3587]} zoom={12} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                  <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {filteredIncidents.map((incident) => (
                    <Marker key={incident.id} position={[incident.location.lat, incident.location.lng]}>
                      <Popup>
                        <div className="font-sans">
                          <strong className="block text-slate-800">{incident.title}</strong>
                          <span className="text-xs text-slate-500">{incident.location.text}</span>
                          <div className="mt-2 text-xs font-bold text-red-600">{incident.priority} PRIORITY</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>

            {/* Right Panel: Queue & Details */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
              {activeData ? (
                // Full Incident Details & Operator Controls
                <div className="flex-1 flex flex-col absolute inset-0 bg-white z-20 overflow-y-auto">
                  <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3 sticky top-0 z-30">
                    <button onClick={() => setSelectedIncident(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={20} /></button>
                    <h2 className="font-bold text-slate-800">Incident Processing</h2>
                  </div>
                  
                  <div className="p-5 space-y-6">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold px-2 py-1 rounded bg-slate-200 text-slate-700">{activeData.id}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${activeData.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' : activeData.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>{activeData.priority} PRIORITY</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800">{activeData.title}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><MapPin size={14} /> {activeData.location.text}</p>
                    </div>
                    
                    {/* Security & Trust Panel */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p className="text-xs font-medium text-slate-500 mb-1">Evidence Confidence</p>
                        <div className="flex items-center gap-2">
                          {activeData.evidence === 'HIGH' ? <ShieldCheck size={18} className="text-emerald-500" /> : <Shield size={18} className="text-slate-400" />}
                          <span className={`font-bold ${activeData.evidence === 'HIGH' ? 'text-emerald-700' : 'text-slate-700'}`}>{activeData.evidence}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{activeData.independentReports} independent reports matched</p>
                      </div>
                      <div className={`border rounded-xl p-3 ${activeData.spamRisk === 'HIGH' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-xs font-medium text-slate-500 mb-1">Spam Risk</p>
                        <div className="flex items-center gap-2">
                          {activeData.spamRisk === 'HIGH' ? <AlertTriangle size={18} className="text-red-500" /> : <CheckCircle size={18} className="text-emerald-500" />}
                          <span className={`font-bold ${activeData.spamRisk === 'HIGH' ? 'text-red-700' : 'text-emerald-700'}`}>{activeData.spamRisk}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{activeData.spamRisk === 'HIGH' ? 'Identical payload signatures detected' : 'Standard submission pattern'}</p>
                      </div>
                    </div>

                    {/* AI Verification Panel */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-indigo-700 font-bold"><Bot size={20} /> AI Analysis</div>
                      <p className="text-sm text-indigo-900 leading-relaxed">{activeData.aiSummary}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-indigo-200/50">
                        <span className="text-xs font-medium text-indigo-600">AI Routing Suggestion</span>
                        <span className="text-sm font-bold text-indigo-700">{activeData.suggestedDept}</span>
                      </div>
                    </div>

                    {/* Operator Controls */}
                    <div className="border-t border-slate-100 pt-4 space-y-4">
                      <div className="flex items-center gap-2 text-slate-800 font-bold mb-2"><UserCog size={20} /> Operator Controls</div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Assign Department</label>
                          <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500" defaultValue={activeData.suggestedDept}>
                            <option value="WASA">WASA (Water & Sanitation)</option>
                            <option value="Police">Police Department</option>
                            <option value="LDA">LDA (Development)</option>
                            <option value="Rescue1122">Rescue 1122</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Update Status</label>
                          <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500" defaultValue={activeData.status}>
                            <option value="Received">Received</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Assigned">Assigned / Verified</option>
                            <option value="In Progress">In Progress</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Resolution Notes / Directives</label>
                        <textarea rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none" placeholder="Add internal notes or dispatch instructions..." />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm">Save & Dispatch</button>
                        <button className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold py-3 rounded-xl transition-colors text-sm border border-emerald-200">Mark as Resolved</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Incident Queue with Filters
                <div className="flex-1 flex flex-col bg-white h-full">
                  <div className="p-4 border-b border-slate-100 bg-white space-y-3">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2">Incident Queue</h2>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select onChange={(e) => setFilterPriority(e.target.value)} className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 outline-none">
                          <option value="ALL">All Priorities</option>
                          <option value="CRITICAL">Critical</option>
                          <option value="HIGH">High</option>
                          <option value="LOW">Low</option>
                        </select>
                      </div>
                      <div className="flex-1 relative">
                        <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select onChange={(e) => setFilterCategory(e.target.value)} className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 outline-none">
                          <option value="ALL">All Categories</option>
                          <option value="Infrastructure">Infrastructure</option>
                          <option value="Security">Security</option>
                          <option value="Maintenance">Maintenance</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    
                    {/* Task 13: Empty Database State */}
                    {apiState === 'empty' ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-12">
                        <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-3">
                          <Inbox size={40} />
                        </div>
                        <h3 className="font-bold text-slate-700">No active incidents found.</h3>
                        <p className="text-xs text-slate-500 mt-1">Your jurisdiction is currently secure.</p>
                      </div>
                    ) : filteredIncidents.length === 0 ? (
                      <div className="text-center text-slate-400 py-8 text-sm">No incidents match these filters.</div>
                    ) : (
                      filteredIncidents.map((incident) => (
                        <div key={incident.id} onClick={() => setSelectedIncident(incident.id)} className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold px-2 py-1 rounded bg-slate-200 text-slate-700">{incident.id}</span>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${incident.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' : incident.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>{incident.priority}</span>
                          </div>
                          <h3 className="font-semibold text-slate-800 text-sm">{incident.title}</h3>
                          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                            <span className="flex items-center gap-1"><MapPin size={12} /> {incident.location.text}</span>
                            <span>{incident.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}