
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
import { GraduationCap, Lightbulb, History, HelpCircle, Activity, Trash2, Info } from 'lucide-react';

import { RodState, AppMode, Formula, Challenge, UserStats, AppSettings } from './types';
import { createInitialRods, calculateTotalValue, identifyFormula, generateChallenge } from './services/AbacusLogic';

import AbacusFrame from './components/AbacusFrame';
import Rod from './components/Rod';
import Controls from './components/Controls';
import FormulaReference from './components/FormulaReference';
import FormulaAccordion from './components/FormulaAccordion';

const App: React.FC = () => {
  const [rods, setRods] = useState<RodState[]>(createInitialRods());
  const [mode, setMode] = useState<AppMode>(AppMode.Free);
  const [lastFormula, setLastFormula] = useState<Formula | null>(null);
  const [activeRodId, setActiveRodId] = useState<number | null>(null);
  
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);

  // Settings - Persisted
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('abacus_settings');
      return saved ? JSON.parse(saved) : {
        soundEnabled: true,
        voiceEnabled: true,
        showHints: true,
        mentalMode: false
      };
    } catch (e) {
      return { soundEnabled: true, voiceEnabled: true, showHints: true, mentalMode: false };
    }
  });

  // Challenge State
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  
  // Stats - Persisted
  const [stats, setStats] = useState<UserStats>(() => {
    try {
      const saved = localStorage.getItem('abacus_stats');
      return saved ? JSON.parse(saved) : {
        totalOperations: 0,
        correctAnswers: 0,
        accuracyHistory: [
          { time: '开始', accuracy: 0 }
        ]
      };
    } catch (e) {
      return { totalOperations: 0, correctAnswers: 0, accuracyHistory: [{ time: '开始', accuracy: 0 }] };
    }
  });

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('abacus_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('abacus_stats', JSON.stringify(stats));
  }, [stats]);

  const currentTotal = calculateTotalValue(rods);
  const lastSpeakTime = useRef(0);

  // Speech Synthesis Helper
  const speak = useCallback((text: string) => {
    if (!settings.voiceEnabled) return;
    const now = Date.now();
    if (now - lastSpeakTime.current < 500) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.2;
      window.speechSynthesis.speak(utterance);
      lastSpeakTime.current = now;
    }
  }, [settings.voiceEnabled]);

  // Handle Rod Changes
  const handleRodChange = useCallback((id: number, newState: Partial<RodState>) => {
    setActiveRodId(id);
    
    setRods(prev => {
      const newRods = [...prev];
      const oldRod = newRods[id];
      const updatedRod = { ...oldRod, ...newState };
      newRods[id] = updatedRod;

      const oldVal = (oldRod.activeHeavenCount * 5) + oldRod.activeEarthCount;
      const newVal = (updatedRod.activeHeavenCount * 5) + updatedRod.activeEarthCount;

      const formula = identifyFormula(oldVal, newVal);
      if (formula) {
        setLastFormula(formula);
        speak(formula.koujue);
      }

      return newRods;
    });

    setStats(prev => ({
      ...prev,
      totalOperations: prev.totalOperations + 1
    }));
  }, [speak]);

  const handleReset = () => {
    setRods(createInitialRods());
    setLastFormula(null);
    setFeedbackMsg('');
    setActiveRodId(null);
    if (mode === AppMode.Training) speak("清盘");
  };

  const clearStats = () => {
    if(window.confirm('确定要清除所有历史训练数据吗？')) {
      setStats({
        totalOperations: 0,
        correctAnswers: 0,
        accuracyHistory: [{ time: '重置', accuracy: 0 }]
      });
    }
  };

  const toggleSetting = (key: keyof AppSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Challenge Logic
  const startChallenge = () => {
    // Pick random type including MUL/DIV
    const types: any[] = ['ADD', 'SUB', 'MUL', 'DIV'];
    const rType = types[Math.floor(Math.random() * types.length)];
    const newChallenge = generateChallenge(rType);
    
    setChallenge({
      id: Date.now().toString(),
      type: rType,
      question: newChallenge.question,
      targetValue: newChallenge.targetValue,
      steps: newChallenge.steps,
      currentStepIndex: 0,
      ruleDescription: newChallenge.ruleDescription
    });
    handleReset();
    speak(`请计算: ${newChallenge.question}`);
    setMode(AppMode.Training);
  };

  // Validation Logic
  useEffect(() => {
    if (mode === AppMode.Training && challenge) {
      let isCorrect = false;

      // Smart Validation based on problem type
      if (challenge.type === 'MUL' || challenge.type === 'DIV') {
         // For Mul/Div, ignore trailing zeros on BOTH sides to allow for left-aligned "Forward Multiplication"
         // Example: Target 42. User 42000. 42 matches 42.
         // Example: Target 600. User 60000. 6 matches 6.
         const boardValString = currentTotal.toString().replace(/0+$/, ''); 
         const targetValString = challenge.targetValue.toString().replace(/0+$/, '');
         
         if (currentTotal > 0 && boardValString === targetValString) {
            isCorrect = true;
         }
      } else {
         // For Add/Sub, exact match required (fixed unit position)
         if (currentTotal === challenge.targetValue) {
            isCorrect = true;
         }
      }

      if (isCorrect) {
        setFeedbackMsg('回答正确! 🎉');
        speak("回答正确");
        
        // Update Stats
        setStats(prev => {
           const newCorrect = prev.correctAnswers + 1;
           const newHistory = [...prev.accuracyHistory, { 
             time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
             accuracy: Math.min(100, (newCorrect / (newCorrect + 0.5)) * 100) 
           }].slice(-10);
           
           return {
             ...prev,
             correctAnswers: newCorrect,
             accuracyHistory: newHistory
           };
        });
      } else {
         // Hints
         if (challenge.type === 'ADD' || challenge.type === 'SUB') {
            if (currentTotal > challenge.targetValue) setFeedbackMsg('数值偏大...');
            else if (currentTotal > 0) setFeedbackMsg('计算中...');
            else setFeedbackMsg('');
         } else {
            // Mul/Div hints are harder due to floating alignment
            if (currentTotal > 0) setFeedbackMsg('计算中...');
            else setFeedbackMsg('');
         }
      }
    }
  }, [currentTotal, mode, challenge, speak]);

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 font-sans text-gray-800 overflow-x-hidden">
      
      {/* Top Header & Controls Area */}
      <div className="w-full bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-4 md:px-8 py-3 space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <GraduationCap className="text-amber-700" size={28} />
              <h1 className="text-xl md:text-2xl font-serif-sc font-bold text-gray-900 tracking-wide">
                智慧珠算仿真系统
              </h1>
            </div>

            {/* Controls */}
            <div className="flex-1 w-full md:w-auto">
               <Controls 
                  mode={mode} 
                  setMode={setMode} 
                  onReset={handleReset} 
                  currentTotal={currentTotal}
                  settings={settings}
                  toggleSetting={toggleSetting}
                  generateProblem={startChallenge}
                  onOpenReference={() => setIsReferenceOpen(true)}
                />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Abacus */}
      <div className="flex-1 w-full flex flex-col items-center justify-center p-4 md:p-8 bg-wood-light/10 overflow-auto">
         
         <div className="transform transition-all duration-500 hover:scale-[1.01] flex flex-col items-center">
            
            {/* External Result Display - Aligned with Rods */}
            <div className="mb-2 bg-gray-800/90 p-2 md:p-3 rounded-xl shadow-lg border border-amber-900/30 flex justify-center items-center backdrop-blur-sm">
                <div className="flex flex-row items-end justify-center px-4 md:px-8 xl:px-12">
                   {rods.map((rod) => (
                      <div key={rod.id} className="flex flex-col items-center mx-1 md:mx-2 xl:mx-3">
                        <div className={`
                          w-12 md:w-16 xl:w-24 text-center font-mono font-bold text-xl md:text-2xl xl:text-3xl
                          transition-all duration-300
                          ${settings.mentalMode ? 'opacity-0' : 'opacity-100'}
                          ${rod.value > 0 ? 'text-amber-400' : 'text-gray-600'}
                        `}>
                          {rod.value}
                        </div>
                      </div>
                   ))}
                </div>
            </div>

            <AbacusFrame>
              {rods.map((rod) => (
                  <Rod 
                      key={rod.id} 
                      state={rod} 
                      onChange={handleRodChange} 
                      isActiveRod={activeRodId === rod.id}
                      isMentalMode={settings.mentalMode}
                  />
              ))}
            </AbacusFrame>

         </div>
      </div>

      {/* Bottom Dashboard: Info Panels & Footer Modules */}
      <div className="w-full bg-white border-t border-gray-200 p-4 md:p-6 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Panel 1: Training Mode / Question */}
          <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100 flex flex-col h-full relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
               <HelpCircle size={80} className="text-blue-500" />
            </div>
            <h3 className="text-blue-800 font-bold flex items-center gap-2 mb-3">
              <HelpCircle size={18} /> 练习模式 & 题目
            </h3>
            
            {mode === AppMode.Training && challenge ? (
              <div className="flex flex-col items-center justify-center flex-1 space-y-2 z-10 w-full">
                 <div className="text-sm text-gray-500 font-semibold uppercase tracking-wider">当前算式</div>
                 <div className="text-5xl font-mono font-bold text-blue-700">{challenge.question}</div>
                 
                 {/* Positioning Rule Display */}
                 {challenge.ruleDescription && (
                    <div className="w-full bg-white/60 p-2 rounded text-xs md:text-sm text-blue-900 border border-blue-200 mt-2 flex items-start gap-2">
                       <Info size={16} className="shrink-0 mt-0.5" />
                       <span className="text-left font-serif-sc">{challenge.ruleDescription}</span>
                    </div>
                 )}

                 <div className={`px-3 py-1 rounded-full text-sm font-bold mt-2 ${feedbackMsg.includes('正确') ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {feedbackMsg || '请拨珠计算'}
                 </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-center z-10">
                 <p className="text-gray-500 mb-4 text-sm">当前为自由练习模式。如需挑战，请点击下方按钮。</p>
                 <button onClick={startChallenge} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md transition font-bold text-sm">
                   开始智能随机训练
                 </button>
              </div>
            )}
          </div>

          {/* Panel 2: Smart Formula (Koujue) */}
          <div className="bg-amber-50/50 p-5 rounded-xl border border-amber-100 flex flex-col h-full relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
               <Lightbulb size={80} className="text-amber-500" />
            </div>
            <h3 className="text-amber-800 font-bold flex items-center gap-2 mb-3">
              <Lightbulb size={18} /> 智能口诀识别
            </h3>
            
            <div className="flex flex-col items-center justify-center flex-1 z-10">
              {lastFormula ? (
                <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-3xl font-serif-sc font-bold text-amber-900 mb-2">{lastFormula.koujue}</div>
                  <div className="text-amber-700 bg-amber-100/80 px-4 py-2 rounded-lg text-sm font-medium">
                    {lastFormula.description}
                  </div>
                </div>
              ) : (
                <div className="text-gray-400 italic text-sm">
                  实时检测您的拨珠动作并显示对应口诀
                </div>
              )}
            </div>
          </div>

          {/* Panel 3: Stats */}
          <div className="bg-purple-50/50 p-5 rounded-xl border border-purple-100 flex flex-col h-full relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
               <Activity size={80} className="text-purple-500" />
            </div>
            <div className="flex items-center justify-between mb-3 z-10 relative">
               <h3 className="text-purple-800 font-bold flex items-center gap-2">
                 <History size={18} /> 训练数据概览
               </h3>
               <button onClick={clearStats} title="清除数据" className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 size={14} />
               </button>
            </div>
            
            <div className="flex gap-4 text-sm font-bold mb-2 z-10 relative px-2">
                 <span className="bg-white/60 px-2 py-1 rounded text-purple-700 flex-1 text-center">操作数: {stats.totalOperations}</span>
                 <span className="bg-white/60 px-2 py-1 rounded text-green-700 flex-1 text-center">正确数: {stats.correctAnswers}</span>
            </div>

            <div className="flex-1 w-full min-h-[100px] z-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.accuracyHistory}>
                  <defs>
                    <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                    cursor={{ stroke: '#8884d8', strokeWidth: 1 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="accuracy" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAcc)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Formula Accordion - Placed at the bottom of the dashboard section */}
          <div className="col-span-1 lg:col-span-3 mt-4 border-t border-gray-100 pt-6">
             <FormulaAccordion />
          </div>

          {/* Project Attribution Footer */}
          <div className="col-span-1 lg:col-span-3 text-center pt-2 pb-2">
             <p className="text-gray-500 font-serif-sc font-medium text-sm md:text-base tracking-wide">
               福建经济学校 教育部社区教育实践创新项目成果
             </p>
          </div>

        </div>
      </div>
      
      {/* Modal for Formula Reference */}
      <FormulaReference isOpen={isReferenceOpen} onClose={() => setIsReferenceOpen(false)} />

    </div>
  );
};

export default App;
