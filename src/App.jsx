import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, getDoc, updateDoc, 
  onSnapshot, serverTimestamp, arrayUnion, increment 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  Gavel, Scale, FileText, CheckCircle, XCircle, 
  MessageSquare, Users, Sparkles, ArrowRight, Copy, Share2, 
  AlertCircle, Shield, FileCheck, RefreshCw, PenTool, RotateCcw
} from 'lucide-react';

// --- CONFIGURATION & CONSTANTS ---

// API Key for Gemini (Injected by environment or pasted manually)
// TODO: PASTE YOUR GEMINI API KEY HERE
const apiKey = "AIzaSyBDPcyklRkyj-ff_IoIlaqjGVFmiZr_OVk"; 

// Firebase Config
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyCekQWUR1vHzeCPcAXJ7tImfwUW_3KApTg",
  authDomain: "virtu-mediate1.firebaseapp.com",
  projectId: "virtu-mediate1",
  storageBucket: "virtu-mediate1.firebasestorage.app",
  messagingSenderId: "979645369452",
  appId: "1:979645369452:web:4c3ed27be9785d19bd1c49"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'virtu-mediate-demo';

// --- HELPER FUNCTIONS ---

const generateCaseId = () => {
  return 'CASE-' + Math.floor(1000 + Math.random() * 9000);
};

// Exponential backoff for API calls
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

// Gemini API Call Wrapper
const callGemini = async (prompt, systemInstruction = "") => {
  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };
    
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const result = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Error:", error);
    return null;
  }
};

// --- COMPONENTS ---

const LoadingSpinner = ({ text }) => (
  <div className="flex flex-col items-center justify-center p-8 space-y-4">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    <p className="text-gray-500 animate-pulse">{text || "Processing..."}</p>
  </div>
);

const SettlementDoc = ({ caseData }) => {
  return (
    <div className="bg-white p-8 border-2 border-gray-200 shadow-lg max-w-2xl mx-auto my-8 font-serif">
      <div className="text-center border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-bold uppercase tracking-widest">Settlement Agreement</h1>
        <p className="text-sm mt-2 text-gray-600">Generated via VirtuMediate Virtual Mediation System</p>
        <p className="text-sm text-gray-600">Date: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="space-y-6 text-justify">
        <p>
          This Settlement Agreement ("Agreement") is entered into between <strong>{caseData.p1Name}</strong> ("Party 1") and <strong>{caseData.p2Name}</strong> ("Party 2") regarding the dispute referenced as <strong>{caseData.caseId}</strong>.
        </p>

        <div className="bg-gray-50 p-4 border border-gray-200">
          <h3 className="font-bold mb-2">Background of Dispute:</h3>
          <p className="italic text-gray-700">{caseData.aiSummary || "Dispute regarding shared resources/funds."}</p>
        </div>

        <div>
          <h3 className="font-bold mb-2">Terms of Settlement:</h3>
          <p>The Parties hereby agree to the following terms as full and final settlement of all claims:</p>
          <div className="mt-3 p-4 border-l-4 border-indigo-600 bg-indigo-50">
             {caseData.agreedOption?.description || "Terms agreed upon in mediation."}
          </div>
        </div>

        <p>
          By accepting this digital agreement, both parties acknowledge that this resolution is voluntary, fair, and binding. This document serves as a formal record of the understanding reached.
        </p>
      </div>

      <div className="mt-12 flex justify-between px-8">
        <div className="text-center">
          <div className="border-b border-black w-40 mb-2"></div>
          <p className="font-bold">{caseData.p1Name}</p>
          <p className="text-xs text-gray-500">Digitally Verified</p>
        </div>
        <div className="text-center">
          <div className="border-b border-black w-40 mb-2"></div>
          <p className="font-bold">{caseData.p2Name}</p>
          <p className="text-xs text-gray-500">Digitally Verified</p>
        </div>
      </div>

      <div className="mt-12 text-center text-xs text-gray-400">
        <p>VirtuMediate System ID: {caseData.id}</p>
        <p>This is a generated prototype document.</p>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION ---

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); // landing, create, join, dashboard, room
  const [activeCaseId, setActiveCaseId] = useState('');
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Auth Setup
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // Real-time Case Listener
  useEffect(() => {
    if (!activeCaseId || !user) return;

    const unsub = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'cases', activeCaseId),
      (docSnap) => {
        if (docSnap.exists()) {
          setCaseData({ id: docSnap.id, ...docSnap.data() });
        } else {
          setError("Case not found.");
        }
      },
      (err) => console.error("Snapshot error:", err)
    );

    return () => unsub();
  }, [activeCaseId, user]);

  // --- ACTIONS ---

  const handleCreateCase = async (formData) => {
    if (!user) return;
    setLoading(true);
    const newCaseId = generateCaseId();
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', newCaseId), {
        caseId: newCaseId,
        creatorId: user.uid,
        p1Name: formData.name,
        p1Statement: formData.statement,
        p1Ideal: formData.idealOutcome,
        type: formData.type,
        amount: formData.amount,
        createdAt: serverTimestamp(),
        status: 'WAITING_FOR_PARTY_2', 
        p2Name: '',
        p2Statement: '',
        aiSummary: '',
        options: [],
        votes: { p1: null, p2: null },
        // NEW: Track rounds and history for the loop
        roundCount: 1,
        history: [] 
      });
      setActiveCaseId(newCaseId);
      setView('room');
    } catch (err) {
      console.error(err);
      setError("Failed to create case.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinCase = async (formData) => {
    if (!user) return;
    setLoading(true);
    
    try {
      const caseRef = doc(db, 'artifacts', appId, 'public', 'data', 'cases', formData.caseId);
      const snap = await getDoc(caseRef);
      
      if (!snap.exists()) {
        setError("Case ID not found. Please check and try again.");
        setLoading(false);
        return;
      }

      const currentData = snap.data();
      if (currentData.status !== 'WAITING_FOR_PARTY_2' && !currentData.p2Name) {
        setError("This case is already in progress.");
        setLoading(false);
        return;
      }

      await updateDoc(caseRef, {
        p2Id: user.uid,
        p2Name: formData.name,
        p2Statement: formData.statement,
        p2Ideal: formData.idealOutcome,
        status: 'READY_FOR_ANALYSIS'
      });
      
      setActiveCaseId(formData.caseId);
      setView('room');
    } catch (err) {
      console.error(err);
      setError("Failed to join case.");
    } finally {
      setLoading(false);
    }
  };

  const runAIAnalysis = async () => {
    if (!caseData) return;
    setLoading(true);

    const systemPrompt = `You are an expert legal mediator. 
    Your goal is to analyze a dispute between two parties, find the Zone of Possible Agreement (ZOPA), and suggest 3 distinct settlement options.
    If there is "History" of rejected offers, you MUST propose NEW options closer to the middle ground.
    Maintain a neutral, professional, and empathetic tone.
    Output MUST be valid JSON with this structure:
    {
      "summary": "A 3-sentence neutral summary of the facts and conflict.",
      "conflictPoints": ["point 1", "point 2"],
      "sharedInterests": ["interest 1", "interest 2"],
      "options": [
        { "id": "A", "title": "Option Title", "description": "Full details of who gives what.", "p1Advantage": "Why P1 might like this", "p2Advantage": "Why P2 might like this" },
        { "id": "B", "title": "Option Title", "description": "...", "p1Advantage": "...", "p2Advantage": "..." },
        { "id": "C", "title": "Option Title", "description": "...", "p1Advantage": "...", "p2Advantage": "..." }
      ]
    }`;

    // Include History in prompt so AI learns from rejections
    const historyText = caseData.history && caseData.history.length > 0 
      ? `PREVIOUS NEGOTIATION ROUNDS (Do NOT repeat these failures): \n${caseData.history.join('\n')}` 
      : "No previous rounds.";

    const userPrompt = `
      Case Type: ${caseData.type}
      Disputed Amount: ${caseData.amount}
      
      Party 1 (${caseData.p1Name}) says: "${caseData.p1Statement}"
      Party 1 wants: "${caseData.p1Ideal}"
      
      Party 2 (${caseData.p2Name}) says: "${caseData.p2Statement}"
      Party 2 wants: "${caseData.p2Ideal}"

      ${historyText}
    `;

    try {
      const aiResult = await callGemini(userPrompt, systemPrompt);
      if (aiResult) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', activeCaseId), {
          aiSummary: aiResult.summary,
          conflictPoints: aiResult.conflictPoints,
          sharedInterests: aiResult.sharedInterests,
          options: aiResult.options,
          status: 'NEGOTIATION',
          votes: { p1: null, p2: null }
        });
      }
    } catch (err) {
      setError("AI Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (optionId) => {
    if (!user || !caseData) return;
    
    const isP1 = user.uid === caseData.creatorId;
    const voteField = isP1 ? 'votes.p1' : 'votes.p2';
    
    const newVotes = { ...caseData.votes, [isP1 ? 'p1' : 'p2']: optionId };
    
    let newStatus = caseData.status;
    let agreedOptionData = null;

    if (newVotes.p1 && newVotes.p2 && newVotes.p1 === newVotes.p2) {
      newStatus = 'SETTLED';
      agreedOptionData = caseData.options.find(o => o.id === newVotes.p1);
    }

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', activeCaseId), {
      [voteField]: optionId,
      status: newStatus,
      ...(agreedOptionData ? { agreedOption: agreedOptionData } : {})
    });
  };

  // --- NEW STEP 9: COUNTER OFFER LOGIC ---
  const handleCounterOffer = async (counterReason) => {
    if (!caseData || loading) return;
    setLoading(true);

    try {
      const currentRound = caseData.roundCount || 1;
      
      // Check Limit (10 Rounds)
      if (currentRound >= 10) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', activeCaseId), {
          status: 'NOT_SETTLED'
        });
        setLoading(false);
        return;
      }

      const isP1 = user.uid === caseData.creatorId;
      const actor = isP1 ? caseData.p1Name : caseData.p2Name;
      
      // Log the rejection reason to history so AI can read it next time
      const note = `[Round ${currentRound} REJECTION] ${actor} rejected current options. Reason: "${counterReason}"`;

      // Reset the loop: Increment Round, Add History, Set Status back to READY
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cases', activeCaseId), {
        status: 'READY_FOR_ANALYSIS', // This triggers the UI to show the "Start AI" button again
        roundCount: increment(1),
        history: arrayUnion(note),
        votes: { p1: null, p2: null }, // Clear votes
        options: [] // Clear old options
      });

    } catch(e) {
      console.error(e);
      setError("Counter-offer failed");
    } finally {
      setLoading(false);
    }
  };

  // --- SUB-VIEWS ---

  const LandingView = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 text-center px-4">
      <div className="bg-white p-4 rounded-full shadow-md mb-6">
        <Scale className="w-12 h-12 text-indigo-600" />
      </div>
      <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 mb-4 tracking-tight">
        Virtu<span className="text-indigo-600">Mediate</span>
      </h1>
      <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-10">
        The AI-powered court-annexed mediation system. Resolve disputes fairly, quickly, and without human bias.
      </p>
      
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-md">
        <button 
          onClick={() => setView('create')}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-6 rounded-xl font-semibold shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <Gavel className="w-5 h-5" />
          File New Dispute
        </button>
        <button 
          onClick={() => setView('join')}
          className="flex-1 bg-white hover:bg-gray-50 text-slate-700 border border-slate-200 py-4 px-6 rounded-xl font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <Users className="w-5 h-5" />
          Join Existing Case
        </button>
      </div>
      <p className="mt-8 text-xs text-gray-400">Prototype for Academic Demonstration</p>
    </div>
  );

  const CreateCaseView = () => {
    const [form, setForm] = useState({ name: '', type: 'Civil', amount: '', statement: '', idealOutcome: '' });
    
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-indigo-600 px-8 py-6 text-white flex items-center gap-3">
            <PenTool className="w-6 h-6" />
            <h2 className="text-xl font-bold">File a Dispute (Party 1)</h2>
          </div>
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name / Entity Name</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. John Doe"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dispute Type</label>
                <select 
                  className="w-full p-3 border border-slate-300 rounded-lg"
                  value={form.type}
                  onChange={e => setForm({...form, type: e.target.value})}
                >
                  <option>Civil (Money/Contract)</option>
                  <option>Consumer Complaint</option>
                  <option>Family/Property</option>
                  <option>Workplace/Team</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Disputed Amount (if any)</label>
                <input 
                  type="text" 
                  className="w-full p-3 border border-slate-300 rounded-lg"
                  placeholder="e.g. ₹5,000"
                  value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Side of the Story</label>
              <textarea 
                className="w-full p-3 border border-slate-300 rounded-lg h-32"
                placeholder="Explain what happened objectively..."
                value={form.statement}
                onChange={e => setForm({...form, statement: e.target.value})}
              ></textarea>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Ideal Outcome</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-300 rounded-lg"
                placeholder="e.g. I want 50% of the prize money."
                value={form.idealOutcome}
                onChange={e => setForm({...form, idealOutcome: e.target.value})}
              />
            </div>
            
            <div className="flex gap-4 pt-4">
               <button onClick={() => setView('landing')} className="flex-1 py-3 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
               <button 
                onClick={() => handleCreateCase(form)}
                disabled={!form.name || !form.statement || loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold shadow-md disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Case'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const JoinCaseView = () => {
    const [form, setForm] = useState({ caseId: '', name: '', statement: '', idealOutcome: '' });

    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-emerald-600 px-8 py-6 text-white flex items-center gap-3">
            <Users className="w-6 h-6" />
            <h2 className="text-xl font-bold">Join Dispute (Party 2)</h2>
          </div>
          <div className="p-8 space-y-6">
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">You need a Case ID from Party 1 to join. This ensures you are entering the correct mediation room.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Case ID</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-300 rounded-lg font-mono tracking-wider uppercase"
                placeholder="CASE-XXXX"
                value={form.caseId}
                onChange={e => setForm({...form, caseId: e.target.value.toUpperCase()})}
              />
            </div>
            
            <hr className="border-slate-100" />
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-300 rounded-lg"
                placeholder="e.g. Jane Smith"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Side of the Story</label>
              <textarea 
                className="w-full p-3 border border-slate-300 rounded-lg h-32"
                placeholder="Explain your perspective..."
                value={form.statement}
                onChange={e => setForm({...form, statement: e.target.value})}
              ></textarea>
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Ideal Outcome</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-300 rounded-lg"
                placeholder="e.g. I want 70% because I did the technical work."
                value={form.idealOutcome}
                onChange={e => setForm({...form, idealOutcome: e.target.value})}
              />
            </div>

            <div className="flex gap-4 pt-4">
               <button onClick={() => setView('landing')} className="flex-1 py-3 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
               <button 
                onClick={() => handleJoinCase(form)}
                disabled={!form.caseId || !form.name || !form.statement || loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold shadow-md disabled:opacity-50"
              >
                {loading ? 'Joining...' : 'Join Mediation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const MediationRoom = () => {
    if (!caseData) return <LoadingSpinner />;
    
    // Check if I am Party 1 or Party 2
    const isP1 = user.uid === caseData.creatorId;
    const myRole = isP1 ? 'Party 1' : 'Party 2';
    const myName = isP1 ? caseData.p1Name : caseData.p2Name;
    const opponentName = isP1 ? (caseData.p2Name || "Waiting for Opponent...") : caseData.p1Name;

    // Status-based Renderers
    const renderWaiting = () => (
      <div className="text-center py-12">
        <div className="inline-block p-4 rounded-full bg-blue-50 mb-4 animate-pulse">
          <Share2 className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">Waiting for Party 2 to Join</h3>
        <p className="text-slate-600 mt-2 mb-6">Share the Case ID below with the other party so they can enter the mediation room.</p>
        
        <div className="bg-slate-100 p-4 rounded-lg inline-flex items-center gap-4 border border-slate-300">
          <span className="font-mono text-2xl font-bold tracking-widest text-slate-900">{caseData.caseId}</span>
          <button 
            onClick={() => {navigator.clipboard.writeText(caseData.caseId); alert("Copied!");}}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <Copy className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <p className="mt-8 text-sm text-slate-400">Once they submit their details, this screen will update automatically.</p>
      </div>
    );

    const renderReady = () => (
      <div className="text-center py-12">
        <div className="inline-block p-4 rounded-full bg-emerald-50 mb-4">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">
           {caseData.roundCount > 1 ? `Ready for Round ${caseData.roundCount}` : "Both Parties Are Present"}
        </h3>
        <p className="text-slate-600 mt-2 mb-8 max-w-lg mx-auto">
          {caseData.roundCount > 1 
            ? "The previous options were rejected. The AI is ready to analyze the counter-offers and suggest new terms."
            : `VirtuMediate has received statements from ${caseData.p1Name} and ${caseData.p2Name}. The AI Mediator is ready to analyze the conflict.`}
        </p>
        
        <button 
          onClick={runAIAnalysis}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg py-4 px-10 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center gap-3 mx-auto"
        >
          {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Sparkles className="w-5 h-5" />}
          {caseData.roundCount > 1 ? "Generate New Options" : "Start AI Mediation"}
        </button>
      </div>
    );

    const renderNegotiation = () => {
      const myVote = isP1 ? caseData.votes?.p1 : caseData.votes?.p2;
      const oppVote = isP1 ? caseData.votes?.p2 : caseData.votes?.p1;
      // Local state for counter offer input
      const [showCounter, setShowCounter] = useState(false);
      const [counterText, setCounterText] = useState('');

      return (
        <div className="space-y-8 animate-fadeIn">
          {/* Round Indicator */}
          <div className="flex justify-between items-center bg-indigo-900 text-white px-6 py-2 rounded-lg">
             <span className="font-bold">Negotiation Round {caseData.roundCount || 1} / 10</span>
             <span className="text-xs opacity-70">Case ID: {caseData.caseId}</span>
          </div>

          {/* AI Summary Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800">AI Neutral Summary</h3>
              </div>
              <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Analysis Complete</span>
            </div>
            <div className="p-6">
              <p className="text-slate-700 leading-relaxed text-lg italic border-l-4 border-indigo-300 pl-4">
                "{caseData.aiSummary}"
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div className="bg-red-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-red-800 text-sm mb-2 flex items-center gap-2"><XCircle className="w-4 h-4" /> Conflict Points</h4>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {caseData.conflictPoints?.map((cp, i) => <li key={i}>{cp}</li>)}
                  </ul>
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-emerald-800 text-sm mb-2 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Shared Interests</h4>
                  <ul className="list-disc list-inside text-sm text-emerald-700 space-y-1">
                    {caseData.sharedInterests?.map((si, i) => <li key={i}>{si}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Options Section */}
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Scale className="w-6 h-6 text-indigo-600" /> 
              Suggested Settlement Options
            </h3>
            <p className="text-slate-500 mb-6">Both parties must vote for the same option to reach a settlement.</p>
            
            <div className="grid lg:grid-cols-3 gap-6">
              {caseData.options?.map((option) => {
                const isSelected = myVote === option.id;
                const isOpponentSelected = oppVote === option.id;
                
                return (
                  <div key={option.id} className={`relative rounded-xl border-2 transition-all p-6 bg-white shadow-sm flex flex-col ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'}`}>
                    
                    {isOpponentSelected && (
                      <div className="absolute -top-3 right-4 bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-bold border border-amber-200 shadow-sm">
                        {opponentName} voted for this
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-indigo-50 text-indigo-700 w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl">
                        {option.id}
                      </div>
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Option</span>
                    </div>
                    
                    <h4 className="font-bold text-lg text-slate-800 mb-2">{option.title}</h4>
                    <p className="text-slate-600 text-sm mb-6 flex-grow">{option.description}</p>
                    
                    <div className="space-y-3 mb-6">
                      <div className="text-xs bg-slate-50 p-2 rounded text-slate-600">
                        <span className="font-semibold text-slate-900 block mb-1">For {caseData.p1Name}:</span> 
                        {option.p1Advantage}
                      </div>
                      <div className="text-xs bg-slate-50 p-2 rounded text-slate-600">
                        <span className="font-semibold text-slate-900 block mb-1">For {caseData.p2Name}:</span> 
                        {option.p2Advantage}
                      </div>
                    </div>

                    <button 
                      onClick={() => handleVote(option.id)}
                      className={`w-full py-3 rounded-lg font-bold transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {isSelected ? 'Selected' : 'Vote for this Option'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* --- COUNTER OFFER UI (Added Feature) --- */}
            <div className="mt-12 bg-gray-100 rounded-xl p-6 text-center border border-gray-200">
               {!showCounter ? (
                  <div>
                    <h4 className="font-bold text-slate-700">None of these options work for you?</h4>
                    <p className="text-sm text-slate-500 mb-4">You can reject all options and propose a counter-offer. The AI will recalculate and start the next round.</p>
                    <button 
                      onClick={() => setShowCounter(true)}
                      className="bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-red-600 hover:border-red-300 font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto"
                    >
                      <RotateCcw className="w-4 h-4" /> Reject & Counter-Offer
                    </button>
                  </div>
               ) : (
                  <div className="max-w-xl mx-auto text-left">
                     <h4 className="font-bold text-slate-800 mb-2">Make a Counter-Offer</h4>
                     <label className="text-xs text-slate-500 mb-1 block">Explain why you are rejecting these options and what you want instead:</label>
                     <textarea 
                        className="w-full p-3 border border-slate-300 rounded-lg h-24 mb-3"
                        placeholder="e.g. Option A is too low, I need at least 60%..."
                        value={counterText}
                        onChange={(e) => setCounterText(e.target.value)}
                     ></textarea>
                     <div className="flex gap-3">
                        <button 
                          onClick={() => setShowCounter(false)}
                          className="flex-1 py-2 text-slate-500 hover:bg-slate-200 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => handleCounterOffer(counterText)}
                          disabled={!counterText || loading}
                          className="flex-1 bg-slate-800 hover:bg-black text-white py-2 rounded-lg font-bold"
                        >
                          {loading ? 'Processing...' : 'Submit Counter-Offer'}
                        </button>
                     </div>
                  </div>
               )}
            </div>

          </div>
        </div>
      );
    };

    const renderSettled = () => (
      <div className="flex flex-col items-center">
        <div className="bg-green-100 text-green-700 px-6 py-2 rounded-full font-bold mb-8 flex items-center gap-2">
          <FileCheck className="w-5 h-5" />
          Mediation Successful!
        </div>
        <SettlementDoc caseData={caseData} />
        <button 
          onClick={() => window.print()} 
          className="mt-6 flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium"
        >
          <Gavel className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>
    );
    
    // Render Fail State
    const renderNotSettled = () => (
      <div className="flex flex-col items-center py-12">
         <div className="bg-red-100 text-red-700 px-6 py-4 rounded-xl font-bold mb-4 flex items-center gap-2">
          <XCircle className="w-6 h-6" />
          Mediation Failed
        </div>
        <p className="max-w-md text-center text-slate-600">
           The negotiation exceeded 10 rounds without an agreement. We recommend seeking offline legal counsel or arbitration.
        </p>
      </div>
    );

    // --- ROOM RENDERER ---
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-1.5 rounded text-white">
                <Gavel className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-slate-800 leading-tight">VirtuMediate Room</h1>
                <p className="text-xs text-slate-500">Case ID: {caseData.caseId}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden md:block">
                <p className="text-sm font-semibold text-slate-800">{myName}</p>
                <p className="text-xs text-slate-500">{myRole}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                {myName.charAt(0)}
              </div>
              <button onClick={() => { setView('landing'); setActiveCaseId(null); setCaseData(null); }} className="text-xs text-red-500 hover:text-red-700 ml-2">
                Exit
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> {error}
            </div>
          )}

          {caseData.status === 'WAITING_FOR_PARTY_2' && renderWaiting()}
          {caseData.status === 'READY_FOR_ANALYSIS' && renderReady()}
          {caseData.status === 'NEGOTIATION' && renderNegotiation()}
          {caseData.status === 'SETTLED' && renderSettled()}
          {caseData.status === 'NOT_SETTLED' && renderNotSettled()}

          {/* Activity Log (Simplified Chat) */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Mediation Activity Log</h4>
            <div className="space-y-3 opacity-70">
              <div className="flex gap-3 items-center text-sm text-slate-600">
                <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                Case created by {caseData.p1Name} on {new Date(caseData.createdAt?.seconds * 1000).toLocaleString()}.
              </div>
              {caseData.p2Name && (
                <div className="flex gap-3 items-center text-sm text-slate-600">
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  {caseData.p2Name} joined the mediation.
                </div>
              )}
              {caseData.history && caseData.history.map((log, i) => (
                  <div key={i} className="flex gap-3 items-center text-sm text-slate-600">
                     <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                     {log}
                  </div>
              ))}
              {caseData.status === 'NEGOTIATION' && (
                <div className="flex gap-3 items-center text-sm text-slate-600">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  AI Analysis generated. Negotiation in progress.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  };

  if (view === 'create') return <CreateCaseView />;
  if (view === 'join') return <JoinCaseView />;
  if (view === 'room') return <MediationRoom />;
  return <LandingView />;
}