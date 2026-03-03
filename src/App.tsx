import { useState, useRef } from 'react';
import { Upload, FileText, Settings, ChevronRight, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw, X, Copy, Check, FileUp, Type, BrainCircuit, CheckCircle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

interface MCQ {
  question: string;
  options: string[];
  answer: string;
}

export default function App() {
  const [extractedText, setExtractedText] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState("");
  const [mcqCount, setMcqCount] = useState(10);
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [parseError, setParseError] = useState("");
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState("Medium");
  const [isCopied, setIsCopied] = useState(false);
  const [inputType, setInputType] = useState<"pdf" | "text">("pdf");
  const [pastedText, setPastedText] = useState("");
  const resultsRef = useRef<HTMLElement>(null);

  const handleReset = () => {
    setExtractedText("");
    setPdfStatus("");
    setFileName("");
    setMcqs([]);
    setGeneratedResult("");
    setParseError("");
    setUserAnswers({});
    setIsSubmitted(false);
    setScore(0);
    setDifficulty("Medium");
    setPastedText("");
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.preventDefault();
    setFileName("");
    setExtractedText("");
    setPdfStatus("");
  };

  const handleCopy = () => {
    if (mcqs.length === 0) return;
    let textToCopy = "Generated MCQs:\n\n";
    mcqs.forEach((mcq, i) => {
      textToCopy += `Q${i + 1}. ${mcq.question}\n`;
      mcq.options.forEach(opt => textToCopy += `${opt}\n`);
      textToCopy += `\nAnswer: ${mcq.answer}\n\n`;
    });
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const generateMCQPrompt = (text: string, numberOfQuestions: number, difficultyLevel: string) => {
    return `Read the following text and generate exactly ${numberOfQuestions} multiple choice questions based ONLY on this text.
The difficulty level of the questions should be: ${difficultyLevel}.
Each question must have exactly 4 options (A, B, C, D).
Include the correct answer.
Return the response in this exact JSON format:
[{"question":"...","options":["A)...","B)...","C)...","D)..."],"answer":"A"}]

Text:
${text}`;
  };

  const callGeminiAPI = async (prompt: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      return response.text;
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  };

  const handleGenerate = async () => {
    const textToProcess = inputType === "pdf" ? extractedText : pastedText;

    if (!textToProcess) {
      setGeneratedResult(`Error: Please ${inputType === "pdf" ? "upload and extract text from a PDF file" : "paste some text"} first.`);
      return;
    }

    if (textToProcess.trim().length < 50) {
      setGeneratedResult("Error: The provided text is too short. Please provide more text.");
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      setGeneratedResult("Error: Gemini API key is missing. Please configure it in the AI Studio Secrets panel.");
      return;
    }

    setIsGenerating(true);
    setGeneratedResult("");
    setMcqs([]);
    setParseError("");
    setUserAnswers({});
    setIsSubmitted(false);
    setScore(0);

    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    try {
      const prompt = generateMCQPrompt(textToProcess, mcqCount, difficulty);
      const responseText = await callGeminiAPI(prompt);
      if (responseText) {
        setGeneratedResult(responseText);
        try {
          const parsed = JSON.parse(responseText);
          setMcqs(parsed);
        } catch (e) {
          setParseError("Failed to parse the generated questions. The AI returned an invalid format.");
        }
      }
    } catch (error) {
      setGeneratedResult("Error: Failed to generate response. Please check the console for details.");
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleOptionSelect = (questionIndex: number, option: string) => {
    if (isSubmitted) return;
    setUserAnswers(prev => ({
      ...prev,
      [questionIndex]: option.charAt(0)
    }));
  };

  const checkAnswers = () => {
    let currentScore = 0;
    mcqs.forEach((mcq, index) => {
      if (userAnswers[index] === mcq.answer) {
        currentScore++;
      }
    });
    setScore(currentScore);
    setIsSubmitted(true);
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);
    setPdfStatus("");
    setExtractedText("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = window.pdfjsLib;
      
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      const loadingTask = pdfjsLib.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      
      let fullText = "";
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }

      setExtractedText(fullText);
      setPdfStatus(`Successfully extracted text from ${numPages} pages`);
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      setPdfStatus("Error loading PDF. Please ensure it is a valid PDF file.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FAFAFA] font-sans text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-zinc-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-500/20">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 bg-clip-text text-transparent">
                QuizGenius
              </h1>
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider -mt-1">AI MCQ Generator</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid gap-8 lg:grid-cols-[380px_1fr] items-start">
        
        {/* Controls Section (Sidebar) */}
        <section className="bg-white p-6 rounded-3xl shadow-sm ring-1 ring-zinc-200/50 flex flex-col gap-6 sticky top-28">
          <div>
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-zinc-800">
              <Settings className="w-5 h-5 text-indigo-600" />
              Configuration
            </h2>
            
            <div className="space-y-6">
              {/* Input Type Toggle */}
              <div className="flex bg-zinc-100/80 p-1.5 rounded-xl border border-zinc-200/50">
                <button
                  onClick={() => setInputType("pdf")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${inputType === "pdf" ? "bg-white text-indigo-700 shadow-sm ring-1 ring-zinc-200/50" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"}`}
                >
                  <FileUp className="w-4 h-4" /> PDF Upload
                </button>
                <button
                  onClick={() => setInputType("text")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${inputType === "text" ? "bg-white text-indigo-700 shadow-sm ring-1 ring-zinc-200/50" : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"}`}
                >
                  <Type className="w-4 h-4" /> Paste Text
                </button>
              </div>

              {/* Input Area */}
              {inputType === "pdf" ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    Upload Document
                  </label>
                  <div className="relative">
                    <label className={`block border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer group ${fileName ? 'border-indigo-400 bg-indigo-50/30' : 'border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/20 bg-zinc-50/50'}`}>
                      {isLoading ? (
                        <Loader2 className="w-8 h-8 text-indigo-500 mx-auto mb-3 animate-spin" />
                      ) : fileName ? (
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                      ) : (
                        <div className="w-12 h-12 bg-white rounded-full shadow-sm ring-1 ring-zinc-200 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                          <Upload className="w-5 h-5 text-indigo-500" />
                        </div>
                      )}
                      
                      <p className="text-sm text-zinc-700 font-medium">
                        {isLoading ? "Extracting text..." : fileName ? fileName : "Click to upload or drag and drop"}
                      </p>
                      {!fileName && !isLoading && (
                        <p className="text-xs text-zinc-400 mt-1">PDF files only (max 10MB)</p>
                      )}
                      <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                    
                    {fileName && !isLoading && (
                      <button 
                        onClick={handleRemoveFile} 
                        className="absolute top-3 right-3 p-1.5 bg-white border border-zinc-200 text-zinc-400 rounded-full hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-colors shadow-sm"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {/* Status Message */}
                  {pdfStatus && (
                    <div className={`mt-3 text-sm flex items-center gap-1.5 font-medium ${pdfStatus.includes('Error') ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {pdfStatus.includes('Error') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      {pdfStatus}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    Paste Content
                  </label>
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Enter the context or study material here..."
                    className="w-full h-48 px-4 py-3 bg-zinc-50/50 border border-zinc-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none text-sm text-zinc-700 placeholder:text-zinc-400"
                  />
                  <div className="text-xs font-medium text-zinc-400 text-right px-1">
                    {pastedText.length} characters
                  </div>
                </div>
              )}

              {/* Number Input & Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="mcq-count" className="block text-sm font-medium text-zinc-700">
                    Question Count
                  </label>
                  <input 
                    type="number" 
                    id="mcq-count"
                    value={mcqCount}
                    onChange={(e) => setMcqCount(parseInt(e.target.value) || 1)}
                    min={1}
                    max={50}
                    className="w-full px-4 py-2.5 bg-zinc-50/50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm text-zinc-700 font-medium"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="difficulty" className="block text-sm font-medium text-zinc-700">
                    Difficulty
                  </label>
                  <select 
                    id="difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-50/50 border border-zinc-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm text-zinc-700 font-medium cursor-pointer appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-3">
                <button 
                  onClick={handleGenerate}
                  disabled={(inputType === "pdf" ? !extractedText : !pastedText) || isLoading || isGenerating}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:border-zinc-200 disabled:border disabled:cursor-not-allowed text-white font-medium py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Magic...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate MCQs
                    </>
                  )}
                </button>
                
                <button 
                  onClick={handleReset}
                  disabled={isGenerating}
                  className="w-full bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-600 font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset Everything
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Results Section */}
        <section ref={resultsRef} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm ring-1 ring-zinc-200/50 min-h-[600px] flex flex-col scroll-mt-28">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-5 mb-6">
            <h2 className="text-xl font-semibold text-zinc-800 flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-indigo-600" />
              Generated Quiz
            </h2>
            
            {mcqs.length > 0 && !isGenerating && (
              <button 
                onClick={handleCopy} 
                className="text-sm flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium transition-colors px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
              >
                {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {isCopied ? "Copied!" : "Copy Text"}
              </button>
            )}
          </div>
          
          {isGenerating ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-5">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
              </div>
              <p className="text-zinc-500 font-medium animate-pulse text-lg">Crafting your questions...</p>
            </div>
          ) : parseError ? (
            <div className="flex-1 overflow-auto">
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-5 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-6 h-6 mt-0.5 flex-shrink-0 text-rose-600" />
                <div>
                  <h3 className="font-semibold text-lg">Parsing Error</h3>
                  <p className="text-sm mt-1 text-rose-700/80 leading-relaxed">{parseError}</p>
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer font-medium text-rose-700 hover:text-rose-800 outline-none">View Raw Response</summary>
                    <pre className="mt-3 whitespace-pre-wrap bg-white/60 p-4 rounded-xl overflow-x-auto text-xs font-mono border border-rose-100">
                      {generatedResult}
                    </pre>
                  </details>
                </div>
              </div>
            </div>
          ) : mcqs.length > 0 ? (
            <div className="flex-1 overflow-auto flex flex-col gap-8">
              {isSubmitted && (
                <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-3xl p-8 text-center shadow-xl shadow-indigo-500/20 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                  <h3 className="text-indigo-100 font-medium mb-2 relative z-10 uppercase tracking-wider text-sm">Your Final Score</h3>
                  <div className="text-6xl font-bold text-white mb-4 relative z-10 tracking-tight">
                    {score} <span className="text-3xl text-indigo-200 font-medium">/ {mcqs.length}</span>
                  </div>
                  <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-white font-medium relative z-10 border border-white/10">
                    {Math.round((score / mcqs.length) * 100)}% Accuracy
                  </div>
                  <p className="text-xl font-medium text-white mt-6 relative z-10">
                    {(score / mcqs.length) >= 0.8 
                      ? "Outstanding Performance! 🏆" 
                      : (score / mcqs.length) >= 0.5 
                        ? "Good effort! Keep learning. 📚" 
                        : "Needs more practice! 💪"}
                  </p>
                </div>
              )}

              <div className="space-y-8">
                {mcqs.map((mcq, index) => (
                  <div key={index} className="bg-white border border-zinc-200 p-6 sm:p-8 rounded-3xl shadow-sm">
                    <h3 className="font-semibold text-zinc-800 mb-6 text-lg leading-relaxed flex items-start gap-3">
                      <span className="flex items-center justify-center bg-indigo-100 text-indigo-700 rounded-lg w-8 h-8 flex-shrink-0 text-sm mt-0.5">
                        {index + 1}
                      </span>
                      {mcq.question}
                    </h3>
                    <div className="space-y-3">
                      {mcq.options.map((option, optIndex) => {
                        const optionLetter = option.charAt(0);
                        const isSelected = userAnswers[index] === optionLetter;
                        const isCorrect = mcq.answer === optionLetter;
                        
                        let optionClasses = "relative flex items-start gap-4 p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ";
                        let circleClasses = "mt-0.5 flex items-center justify-center w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ";
                        
                        if (isSubmitted) {
                          if (isCorrect) {
                            optionClasses += "bg-emerald-50/50 border-emerald-500 text-emerald-900";
                            circleClasses += "border-emerald-500 bg-emerald-500";
                          } else if (isSelected && !isCorrect) {
                            optionClasses += "bg-rose-50/50 border-rose-500 text-rose-900";
                            circleClasses += "border-rose-500 bg-rose-500";
                          } else {
                            optionClasses += "border-zinc-100 bg-zinc-50/50 opacity-50";
                            circleClasses += "border-zinc-300";
                          }
                        } else {
                          if (isSelected) {
                            optionClasses += "border-indigo-500 bg-indigo-50/50 text-indigo-900";
                            circleClasses += "border-indigo-500 bg-indigo-500";
                          } else {
                            optionClasses += "border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50 text-zinc-700";
                            circleClasses += "border-zinc-300";
                          }
                        }

                        return (
                          <label key={optIndex} className={optionClasses}>
                            <div className={circleClasses}>
                              {(isSelected || (isSubmitted && isCorrect)) && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <input 
                              type="radio" 
                              name={`question-${index}`} 
                              className="sr-only"
                              checked={isSelected}
                              disabled={isSubmitted}
                              onChange={() => handleOptionSelect(index, option)}
                            />
                            <span className="font-medium leading-relaxed">{option}</span>
                            
                            {/* Status Icon for Submitted State */}
                            {isSubmitted && isCorrect && (
                              <CheckCircle className="w-5 h-5 text-emerald-500 absolute right-4 top-1/2 -translate-y-1/2" />
                            )}
                            {isSubmitted && isSelected && !isCorrect && (
                              <X className="w-5 h-5 text-rose-500 absolute right-4 top-1/2 -translate-y-1/2" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              
              {!isSubmitted && (
                <div className="sticky bottom-4 z-10 flex justify-end">
                  <button 
                    onClick={checkAnswers}
                    className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-4 px-8 rounded-2xl transition-all active:scale-[0.98] shadow-xl shadow-zinc-900/20 flex items-center justify-center gap-2 text-lg"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Submit Answers
                  </button>
                </div>
              )}
            </div>
          ) : generatedResult ? (
            <div className="flex-1 overflow-auto prose prose-zinc max-w-none">
              <div className="whitespace-pre-wrap text-zinc-700 bg-zinc-50 p-6 rounded-2xl border border-zinc-200">
                {generatedResult}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-5">
              <div className="w-20 h-20 rounded-full bg-zinc-50 flex items-center justify-center mb-2 ring-1 ring-zinc-100">
                <BrainCircuit className="w-10 h-10 text-zinc-300" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-600">Ready to Generate</h3>
              <p className="text-sm text-zinc-500 max-w-sm text-center leading-relaxed">
                Upload a document or paste your study material on the left, configure your settings, and let AI craft the perfect quiz for you.
              </p>
            </div>
          )}
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200/60 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2 text-zinc-500 font-medium">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Powered by Gemini AI
          </div>
          <p className="text-zinc-400 text-xs">Generate intelligent quizzes in seconds.</p>
        </div>
      </footer>
    </div>
  );
}
