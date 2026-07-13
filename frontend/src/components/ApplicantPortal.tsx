import React, { useState, useEffect, useRef } from 'react';
import { 
  ClipboardList, ScreenShare, Play, Timer, ArrowLeft, ArrowRight, 
  CheckCircle2, ShieldAlert, Loader2, 
  CheckCircle, List, StopCircle
} from 'lucide-react';
import { User } from '../types';
import { getSafeFormattedHtml } from '../utils/richText';
import { apiRequest } from '../config/api';

interface ApplicantPortalProps {
  applicantUser: User;
  onLogout: () => void;
}

export default function ApplicantPortal({ applicantUser, onLogout }: ApplicantPortalProps) {
  const [assessment, setAssessment] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [statusRecord, setStatusRecord] = useState<any | null>(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<{ [qId: string]: string }>({});

  // Screen recording state
  const [recordingSupported, setRecordingSupported] = useState(true);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [recordingPermission, setRecordingPermission] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const testActiveRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const recordedChunks = useRef<Blob[]>([]);

  // Timer & Assessment state
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
  const [testActive, setTestActive] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error' | null>('saved');

  // Page States
  const [stage, setStage] = useState<'instruction' | 'recording-consent' | 'test' | 'completed'>('instruction');
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitValidationMessage, setSubmitValidationMessage] = useState<string | null>(null);
  const [unansweredQuestionIds, setUnansweredQuestionIds] = useState<string[]>([]);

  // Auto-save debounce timeout ref
  const debounceTimers = useRef<{ [qId: string]: NodeJS.Timeout }>({});
  const retryTimers = useRef<{ [qId: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    // Check if browser screen recording is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setRecordingSupported(false);
    }
    fetchAssessmentData();
  }, []);

  useEffect(() => {
    testActiveRef.current = testActive;
  }, [testActive]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      Object.values(retryTimers.current).forEach(clearTimeout);
      if (!isSubmittingRef.current) {
        stopRecordingResources();
      }
    };
  }, []);

  // Timer Countdown Effect
  useEffect(() => {
    if (!testActive || timeLeftSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimeLeftSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoSubmitOnExpiry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [testActive, timeLeftSeconds]);

  const fetchAssessmentData = async () => {
    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/applicant/assessment?applicantId=${applicantUser.id}`);
      
      if (data.success) {
        const incomingStatusRecord = data.data.statusRecord ?? null;
        const returnedStatus = incomingStatusRecord?.status ?? 'NOT_STARTED';
        const assessmentId = data.data.assessment?.id ?? null;

        setAssessment(data.data.assessment);
        setQuestions(data.data.questions);
        setStatusRecord(incomingStatusRecord);
        console.log("Applicant portal status received:", {
          applicantId: applicantUser.id,
          assessmentId,
          returnedStatus,
          source: "GET /api/applicant/assessment",
          statusRecord: incomingStatusRecord,
          localStorageCompletionState: null,
          storageSourceUsedForCompletion: false
        });
        if (data.data.answers || data.data.questions) {
          const restoredAnswers = { ...(data.data.answers || {}) };
          data.data.questions.forEach((question: any) => {
            const draft = localStorage.getItem(`assessment_answer_${question.id}`);
            if (draft !== null) {
              restoredAnswers[question.id] = draft;
            }
          });
          setAnswers(restoredAnswers);
        }
        
        // Setup initial stage
        if (!incomingStatusRecord) {
          clearStaleAssessmentStatusStorage(assessmentId);
          setStage('instruction');
          setTestActive(false);
          setTimeLeftSeconds(0);
        } else {
          const status = incomingStatusRecord.status;
          if (status === 'SUBMITTED' || status === 'EXPIRED') {
            setStage('completed');
          } else if (status === 'IN_PROGRESS') {
            // Re-joining an active assessment (recovery!)
            setStage('test');
            setTestActive(true);
            
            // Calculate remaining time
            const startTime = new Date(data.data.statusRecord.startTime).getTime();
            const timeLimitMs = data.data.assessment.timeLimitMinutes * 60 * 1000;
            const elapsedMs = Date.now() - startTime;
            const remainingSecs = Math.max(0, Math.floor((timeLimitMs - elapsedMs) / 1000));
            
            if (remainingSecs <= 0) {
              setStage('completed');
              setTestActive(false);
            } else {
              setTimeLeftSeconds(remainingSecs);
            }
          }
        }
      } else {
        setErrorMsg(data.message || 'No active assessments found');
      }
    } catch (err) {
      setErrorMsg('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  };

  const clearStaleAssessmentStatusStorage = (assessmentId: string | null) => {
    const staleKeys = [
      `assessment_status_${applicantUser.id}`,
      `assessment_stage_${applicantUser.id}`,
      `assessment_completed_${applicantUser.id}`,
      assessmentId ? `assessment_status_${assessmentId}` : null,
      assessmentId ? `assessment_stage_${assessmentId}` : null,
      assessmentId ? `assessment_completed_${assessmentId}` : null,
    ].filter(Boolean) as string[];

    Object.keys(localStorage).forEach((key) => {
      if (
        key.startsWith('assessment_status_') ||
        key.startsWith('assessment_stage_') ||
        key.startsWith('assessment_completed_')
      ) {
        staleKeys.push(key);
      }
    });

    const uniqueKeys = Array.from(new Set(staleKeys));
    uniqueKeys.forEach((key) => localStorage.removeItem(key));

    if (uniqueKeys.length > 0) {
      console.log("Cleared stale applicant assessment status storage:", {
        applicantId: applicantUser.id,
        assessmentId,
        keys: uniqueKeys
      });
    }
  };

  // Screen recording trigger
  const requestScreenSharing = async () => {
    setErrorMsg(null);
    try {
      // Prompt with maximum cross-browser settings
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false // Screen recording audio is optional and often blocks in browsers, video is sufficient
      });

      setScreenStream(stream);
      screenStreamRef.current = stream;
      setRecordingPermission(true);

      // Listen for the applicant stopping the sharing via browser bar
      stream.getVideoTracks()[0].onended = () => {
        handleScreenShareInterrupted();
      };
    } catch (err: any) {
      console.error("Screen share permission failed:", err);
      setRecordingPermission(false);
      setErrorMsg("Screen recording permission is required to proceed. Please click the button and select a screen/tab to share.");
    }
  };

  const handleScreenShareInterrupted = () => {
    // If they stopped sharing during active test, warn them or auto-submit
    setRecordingActive(false);
    setRecordingPermission(false);
    setScreenStream(null);
    screenStreamRef.current = null;
    if (testActiveRef.current && !isSubmittingRef.current) {
      setErrorMsg("CRITICAL: Screen sharing was stopped by user. Anti-cheat protocol triggered submission.");
      handleForceSubmit();
    }
  };

  const handleStartAssessment = async () => {
    if (!recordingPermission || !screenStream || !assessment) {
      setErrorMsg("Please grant screen recording permissions before starting.");
      return;
    }

    try {
      setStartingAssessment(true);
      const data: any = await apiRequest('/api/applicant/assessment/start', {
        method: 'POST',
        body: JSON.stringify({
          applicantId: applicantUser.id,
          assessmentId: assessment.id
        })
      });
      
      if (data.success) {
        const recorderStarted = startMediaRecorder(screenStream);
        if (!recorderStarted) {
          return;
        }
        setStatusRecord(data.data);
        const refreshedData: any = await apiRequest(`/api/applicant/assessment?applicantId=${applicantUser.id}`);
        if (refreshedData.success) {
          setAssessment(refreshedData.data.assessment);
          setQuestions(refreshedData.data.questions);
          setStatusRecord(refreshedData.data.statusRecord || data.data);
          setAnswers(refreshedData.data.answers || {});
        }
        setTimeLeftSeconds(assessment.timeLimitMinutes * 60);
        setTestActive(true);
        setStage('test');
      } else {
        setErrorMsg(data.message);
      }
    } catch (err) {
      setErrorMsg("Failed to start assessment. Please check your internet connection.");
    } finally {
      setStartingAssessment(false);
    }
  };

  const startMediaRecorder = (stream: MediaStream) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      return true;
    }

    if (!stream || stream.getVideoTracks().length === 0) {
      console.error("No screen stream available.");
      setErrorMsg("Screen recording stream is not available. Please grant permission again.");
      return false;
    }

    try {
      recordedChunks.current = [];

      let recorder: MediaRecorder;

      const preferredOptions = { mimeType: "video/webm;codecs=vp9,opus" };

      if (MediaRecorder.isTypeSupported(preferredOptions.mimeType)) {
        recorder = new MediaRecorder(stream, preferredOptions);
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) {
        recorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp8,opus",
        });
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        recorder = new MediaRecorder(stream, {
          mimeType: "video/webm",
        });
      } else {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setErrorMsg("Recording encountered an error, but your assessment will continue.");
      };

      recorder.onstop = () => {
        console.log("MediaRecorder stopped.");
        setRecordingActive(false);
      };

      const videoTrack = stream.getVideoTracks()[0];

      if (videoTrack) {
        videoTrack.onended = () => {
          console.warn("Screen sharing was stopped by the user or browser.");
          handleScreenShareInterrupted();
        };
      }

      recorder.start(5000);

      mediaRecorderRef.current = recorder;
      screenStreamRef.current = stream;
      setRecordingActive(true);
      setRecordingStartTime(Date.now());

      console.log("MediaRecorder started:", recorder.state);
      return true;
    } catch (err) {
      console.error("Failed to start MediaRecorder:", err);
      setErrorMsg("Failed to start screen recording. Please try again.");
      return false;
    }
  };

  const stopRecordingResources = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    const stream = screenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    screenStreamRef.current = null;
    setScreenStream(null);
    setRecordingPermission(false);
    setRecordingActive(false);
  };

  // Auto-saves answers with debouncing
  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (value.trim().length > 0) {
      setUnansweredQuestionIds(prev => prev.filter(id => id !== questionId));
      setSubmitValidationMessage(null);
    }

    localStorage.setItem(`assessment_answer_${questionId}`, value);

    setAutoSaveStatus('saving');

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }
    if (retryTimers.current[questionId]) {
      clearTimeout(retryTimers.current[questionId]);
    }

    debounceTimers.current[questionId] = setTimeout(() => {
      saveAnswerToBackend(questionId, value);
    }, 1500);
  };

  const saveAnswerToBackend = async (questionId: string, text: string) => {
    if (!statusRecord) return;

    try {
      const data: any = await apiRequest('/api/applicant/answers/save', {
        method: 'POST',
        body: JSON.stringify({
          applicantAssessmentId: statusRecord.id,
          questionId,
          answerText: text
        })
      });

      if (data.success) {
        setAutoSaveStatus('saved');
        localStorage.removeItem(`assessment_answer_${questionId}`);
      } else {
        setAutoSaveStatus('error');
        scheduleAutosaveRetry(questionId, text);
      }
    } catch (err) {
      console.error("Autosave failed:", err);
      setAutoSaveStatus('error');
      scheduleAutosaveRetry(questionId, text);
    }
  };

  const scheduleAutosaveRetry = (questionId: string, text: string) => {
    if (retryTimers.current[questionId]) {
      clearTimeout(retryTimers.current[questionId]);
    }

    retryTimers.current[questionId] = setTimeout(() => {
      saveAnswerToBackend(questionId, text);
    }, 3000);
  };

  const getUnansweredQuestionIds = () => {
    return questions
      .filter((question) => !answers[question.id] || answers[question.id].trim().length === 0)
      .map((question) => question.id);
  };

  const blockSubmitForMissingAnswers = (missingQuestionIds: string[], message = 'Please answer all questions before submitting.') => {
    setUnansweredQuestionIds(missingQuestionIds);
    setSubmitValidationMessage(message);
    const firstMissingIndex = questions.findIndex(question => missingQuestionIds.includes(question.id));
    if (firstMissingIndex >= 0) {
      setActiveQuestionIdx(firstMissingIndex);
    }
    setTestActive(true);
    isSubmittingRef.current = false;
    setUploadProgress(null);
  };

  const flushCurrentAnswersToBackend = async () => {
    await Promise.all(questions.map((question) => {
      if (debounceTimers.current[question.id]) {
        clearTimeout(debounceTimers.current[question.id]);
        delete debounceTimers.current[question.id];
      }

      return saveAnswerToBackend(question.id, answers[question.id] || '');
    }));
  };

  const handleAutoSubmitOnExpiry = () => {
    setTestActive(false);
    submitAssessment('EXPIRED');
  };

  const handleForceSubmit = () => {
    submitAssessment('SUBMITTED');
  };

  const submitAssessment = async (finalStatus: 'SUBMITTED' | 'EXPIRED') => {
    if (!statusRecord) return;
    const localMissingQuestionIds = getUnansweredQuestionIds();
    if (localMissingQuestionIds.length > 0) {
      blockSubmitForMissingAnswers(localMissingQuestionIds);
      return;
    }

    isSubmittingRef.current = true;
    let submitAccepted = false;
    try {
      setUploadProgress("Finalizing answers...");
      await flushCurrentAnswersToBackend();

      // Submit assessment status before stopping/finalizing recording.
      const submitResult: any = await apiRequest('/api/applicant/assessment/submit', {
        method: 'POST',
        body: JSON.stringify({
          applicantAssessmentId: statusRecord.id,
          status: finalStatus
        })
      });
      if (!submitResult.success) {
        blockSubmitForMissingAnswers(
          submitResult.missingQuestionIds || [],
          submitResult.message || 'Please answer all questions before submitting.'
        );
        return;
      }

      submitAccepted = true;
      setTestActive(false);
      
      // Stop the MediaRecorder if active
      let recordingDurationSeconds = 0;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
        if (recordingStartTime) {
          recordingDurationSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
        }
      }
      mediaRecorderRef.current = null;

      // Stop all screen tracks to release sharing bar
      const stream = screenStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      screenStreamRef.current = null;
      setScreenStream(null);
      setRecordingPermission(false);
      setRecordingActive(false);

      // Wait a short bit to allow the final MediaRecorder chunks to settle
      setUploadProgress("Compiling and uploading screen recording...");
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (recordedChunks.current.length > 0) {
        const videoBlob = new Blob(recordedChunks.current, { type: 'video/webm' });
        const videoFile = new File([videoBlob], `screen-record-${statusRecord.id}.webm`, { type: 'video/webm' });
        
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('applicantAssessmentId', statusRecord.id);
        formData.append('duration', recordingDurationSeconds.toString());

        const uploadResult: any = await apiRequest('/api/applicant/recording/upload', {
          method: 'POST',
          body: formData
        });
        if (!uploadResult.success) {
          console.error("Recording upload failure:", uploadResult.message);
        }
      }

      setStage('completed');
    } catch (err) {
      console.error("Submission/Upload error:", err);
      if (submitAccepted) {
        setStage('completed');
      } else {
        setSubmitValidationMessage('Unable to submit right now. Please try again.');
        setTestActive(true);
        isSubmittingRef.current = false;
      }
    } finally {
      setUploadProgress(null);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" id="applicant-portal">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-green/10 text-brand-green rounded-xl">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Assessment Portal</h1>
            <p className="text-xs text-gray-500 font-medium">Timed AI Evaluation</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-800">{applicantUser.name}</p>
            <p className="text-xs text-brand-green font-medium">{applicantUser.email}</p>
          </div>
          {!testActive && (
            <button 
              onClick={onLogout}
              className="text-xs font-semibold px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl cursor-pointer transition-colors"
            >
              Log Out
            </button>
          )}
        </div>
      </header>

      {/* Main Display Area */}
      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto p-4 md:p-6 justify-center">
        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-brand-green mb-4" />
            <p className="text-sm font-semibold text-gray-600">Retrieving assessment parameters...</p>
          </div>
        ) : errorMsg && stage !== 'test' ? (
          <div className="bg-white border border-red-100 rounded-2xl p-8 text-center max-w-md mx-auto shadow-sm space-y-4">
            <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Access Restricted</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{errorMsg}</p>
            <button 
              onClick={fetchAssessmentData}
              className="w-full py-2.5 bg-brand-green hover:bg-brand-green/90 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Retry Access
            </button>
          </div>
        ) : (
          <>
            {/* ==========================================
                STAGE 1: ASSESSMENT INSTRUCTIONS
               ========================================== */}
            {stage === 'instruction' && assessment && (
              <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-6" id="instruction-stage">
                <div className="border-b border-gray-100 pb-4">
                  <span className="text-xs font-bold text-brand-green uppercase tracking-wider">Assigned Assessment</span>
                  <h2 className="text-2xl font-bold text-gray-900 mt-1">{assessment.title}</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="assessment-stats">
                  <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Time Limit</p>
                    <p className="text-lg font-bold text-gray-800 flex items-center gap-1.5">
                      <Timer className="h-5 w-5 text-brand-yellow" />
                      {assessment.timeLimitMinutes} Minutes
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Evaluation Questions</p>
                    <p className="text-lg font-bold text-gray-800 flex items-center gap-1.5">
                      <List className="h-5 w-5 text-brand-green" />
                      {assessment.questionsCount ?? questions.length} Items
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Candidate Instructions</h3>
                  <div className="p-4 bg-brand-green/5 border border-brand-green/10 rounded-xl text-sm font-medium text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {assessment.instructions}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex gap-2 text-xs font-medium text-gray-500">
                    <CheckCircle className="h-4.5 w-4.5 text-brand-green shrink-0" />
                    <span>Real-time Screen Recording is strictly mandatory.</span>
                  </div>
                  <button
                    onClick={() => setStage('recording-consent')}
                    className="w-full sm:w-auto px-6 py-3 bg-brand-green hover:bg-brand-green/90 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    Proceed to Verification
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ==========================================
                STAGE 2: SCREEN SHARING CONSENT & VERIFICATION
               ========================================== */}
            {stage === 'recording-consent' && assessment && (
              <div className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm space-y-6 max-w-lg mx-auto" id="consent-stage">
                <div className="text-center space-y-3 pb-4 border-b border-gray-100">
                  <div className="p-3.5 bg-brand-green/10 text-brand-green rounded-2xl inline-block">
                    <ScreenShare className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Anti-Cheat Verification</h2>
                  <p className="text-sm text-gray-500">Enable screen capture recording to unlock assessment</p>
                </div>

                {!recordingSupported ? (
                  <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl space-y-3 text-sm">
                    <div className="flex gap-2 items-start font-semibold">
                      <ShieldAlert className="h-5 w-5 shrink-0" />
                      <span>Browser Screen Recording Unsupported</span>
                    </div>
                    <p className="leading-relaxed text-xs">
                      Your current browser or device platform does not support inline screen capture. To take this assessment, please switch to a desktop computer or laptop running Google Chrome, Mozilla Firefox, or Microsoft Edge.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2.5 text-xs text-gray-600 leading-relaxed font-medium">
                      <p className="font-semibold text-gray-800">Verification Steps:</p>
                      <ul className="list-decimal pl-4 space-y-1.5">
                        <li>Click "Share Assessment Screen" below.</li>
                        <li>Select "Entire Screen" or your current browser window tab.</li>
                        <li>Verify screen capture is displaying in the preview window.</li>
                        <li>Click "Initialize Assessment" to immediately start the timer.</li>
                      </ul>
                    </div>

                    {recordingPermission ? (
                      <div className="p-4 bg-brand-green/10 border border-brand-green/20 rounded-xl flex items-center gap-2 text-xs font-semibold text-brand-green">
                        <CheckCircle2 className="h-5 w-5 text-brand-green" />
                        <span>Screen capture successfully connected! Ready to proceed.</span>
                      </div>
                    ) : (
                      <button
                        onClick={requestScreenSharing}
                        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-brand-green/30 bg-brand-green/5 text-brand-green hover:bg-brand-green/10 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        <ScreenShare className="h-4.5 w-4.5 text-brand-yellow" />
                        Share Assessment Screen
                      </button>
                    )}

                    {errorMsg && (
                      <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs font-medium">
                        {errorMsg}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-gray-100 text-xs font-semibold">
                  <button
                    onClick={() => setStage('instruction')}
                    className="flex-1 py-3 border border-gray-300 hover:bg-gray-50 rounded-xl text-gray-700 cursor-pointer transition-colors"
                  >
                    Back to Instructions
                  </button>
                  <button
                    disabled={!recordingPermission || startingAssessment}
                    onClick={handleStartAssessment}
                    className="flex-1 py-3 bg-brand-green hover:bg-brand-green/90 disabled:bg-brand-green/50 text-white rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-sm"
                  >
                    {startingAssessment ? (
                      <Loader2 className="h-4.5 w-4.5 text-brand-yellow animate-spin" />
                    ) : (
                      <Play className="h-4.5 w-4.5 text-brand-yellow" />
                    )}
                    {startingAssessment ? 'Initializing...' : 'Initialize Assessment'}
                  </button>
                </div>
              </div>
            )}

            {/* ==========================================
                STAGE 3: ACTIVE TEST INTERFACE
               ========================================== */}
            {stage === 'test' && assessment && questions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start" id="active-test-interface">
                {/* Left question sidebar list */}
                <div className="md:col-span-4 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4" id="test-sidebar">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Timer Remaining</span>
                    <span className="flex items-center gap-1.5 text-sm font-bold text-yellow-800 font-mono bg-brand-yellow/10 border border-brand-yellow/30 px-2.5 py-1 rounded-md animate-in fade-in">
                      <Timer className="h-4 w-4 animate-pulse text-brand-yellow" />
                      {formatTimer(timeLeftSeconds)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
                    <span>Questions Tracker</span>
                    <span>{questions.filter(q => answers[q.id]?.trim().length > 0).length} / {questions.length} Answered</span>
                  </div>

                  <div className="grid grid-cols-5 gap-2" id="questions-grid">
                    {questions.map((q, idx) => {
                      const hasAnswer = answers[q.id]?.trim().length > 0;
                      const isActive = idx === activeQuestionIdx;
                      const isUnanswered = unansweredQuestionIds.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          onClick={() => setActiveQuestionIdx(idx)}
                          className={`aspect-square flex items-center justify-center font-bold font-mono text-xs rounded-xl border transition-all cursor-pointer ${
                            isActive 
                              ? 'bg-brand-green border-brand-green text-white shadow-md shadow-brand-green/20' 
                              : isUnanswered
                              ? 'bg-rose-50 border-rose-300 text-rose-700'
                              : hasAnswer 
                              ? 'bg-brand-green/10 border-brand-green/30 text-brand-green' 
                              : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Auto-save Status Badge */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[11px] font-medium text-gray-400">
                    <span className="flex items-center gap-1 text-brand-green font-bold uppercase tracking-wider">
                      <span className={`h-2 w-2 rounded-full ${recordingActive ? 'bg-brand-green animate-pulse' : 'bg-rose-500'}`}></span>
                      {recordingActive ? 'Recording Active' : 'Recording Interrupted'}
                    </span>
                    
                    <span>
                      {autoSaveStatus === 'saving' && 'Auto-saving...'}
                      {autoSaveStatus === 'saved' && '✓ Responses Saved'}
                      {autoSaveStatus === 'error' && 'Autosave failed. Retrying...'}
                    </span>
                  </div>

                  {submitValidationMessage && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      {submitValidationMessage}
                    </div>
                  )}

                  <button
                    onClick={handleForceSubmit}
                    className="w-full flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 rounded-xl text-xs cursor-pointer transition-colors shadow-sm"
                  >
                    <StopCircle className="h-4 w-4 text-brand-yellow" />
                    Submit Final Responses
                  </button>
                </div>

                {/* Right active question pane */}
                <div className={`md:col-span-8 bg-white border rounded-2xl p-6 shadow-sm space-y-6 ${
                  unansweredQuestionIds.includes(questions[activeQuestionIdx].id) ? 'border-rose-300 ring-2 ring-rose-100' : 'border-gray-100'
                }`} id="question-pane">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <span className="text-xs font-bold text-brand-green font-mono">QUESTION {activeQuestionIdx + 1} OF {questions.length}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md font-mono">{questions[activeQuestionIdx].points} POINTS</span>
                  </div>

                  <div className="space-y-4">
                    <div 
                       className="text-base font-medium text-gray-900 leading-relaxed rich-text-content"
                      dangerouslySetInnerHTML={{ __html: getSafeFormattedHtml(questions[activeQuestionIdx].questionText) }}
                    />

                    {/* TEXT TYPE */}
                    {questions[activeQuestionIdx].questionType === 'TEXT' && (
                      <textarea
                        value={answers[questions[activeQuestionIdx].id] || ''}
                        onChange={(e) => handleAnswerChange(questions[activeQuestionIdx].id, e.target.value)}
                        className={`w-full min-h-48 border rounded-xl p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green font-medium transition-all ${
                          unansweredQuestionIds.includes(questions[activeQuestionIdx].id) ? 'border-rose-300 bg-rose-50/40' : 'border-gray-300'
                        }`}
                        placeholder="Write your explanation or essay response here. Use bullet points or detailed sentences to clarify your thoughts..."
                      />
                    )}

                    {/* CODE TYPE */}
                    {questions[activeQuestionIdx].questionType === 'CODE' && (
                      <div className="space-y-2 font-mono">
                        <textarea
                          value={answers[questions[activeQuestionIdx].id] || ''}
                          onChange={(e) => handleAnswerChange(questions[activeQuestionIdx].id, e.target.value)}
                          className={`w-full min-h-64 bg-slate-900 text-slate-100 border rounded-xl p-4 text-xs leading-relaxed focus:outline-none font-mono focus:ring-2 focus:ring-brand-green focus:border-brand-green transition-all ${
                            unansweredQuestionIds.includes(questions[activeQuestionIdx].id) ? 'border-rose-400' : 'border-slate-800'
                          }`}
                          placeholder="// Write your clean, executable code or program implementation here..."
                        />
                      </div>
                    )}

                    {/* MULTIPLE CHOICE TYPE */}
                    {questions[activeQuestionIdx].questionType === 'MULTIPLE_CHOICE' && questions[activeQuestionIdx].options && (
                      <div className="grid grid-cols-1 gap-3" id="mc-options">
                        {questions[activeQuestionIdx].options.map((opt: string, optIdx: number) => {
                          const isSelected = answers[questions[activeQuestionIdx].id] === opt;
                          return (
                            <button
                              key={optIdx}
                              onClick={() => {
                                setAnswers(prev => ({ ...prev, [questions[activeQuestionIdx].id]: opt }));
                                setUnansweredQuestionIds(prev => prev.filter(id => id !== questions[activeQuestionIdx].id));
                                setSubmitValidationMessage(null);
                                saveAnswerToBackend(questions[activeQuestionIdx].id, opt);
                              }}
                              className={`w-full p-4 rounded-xl border text-left text-sm font-semibold transition-all cursor-pointer ${
                                isSelected 
                                  ? 'bg-brand-green/5 border-brand-green text-brand-green shadow-sm' 
                                  : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div className="flex gap-3 items-center">
                                <div className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSelected ? 'border-brand-green bg-brand-green' : 'border-gray-300 bg-white'
                                }`}>
                                  {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                                </div>
                                <span>{opt}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Navigation controls */}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <button
                      disabled={activeQuestionIdx === 0}
                      onClick={() => setActiveQuestionIdx(prev => prev - 1)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 disabled:text-gray-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" /> Previous
                    </button>
                    
                    <button
                      disabled={activeQuestionIdx === questions.length - 1}
                      onClick={() => setActiveQuestionIdx(prev => prev + 1)}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 disabled:text-gray-400 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      Next <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                STAGE 4: COMPLETED / SUBMISSION SUCCESS
               ========================================== */}
            {stage === 'completed' && (
              <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center max-w-md mx-auto shadow-sm space-y-5" id="completion-stage">
                <div className="p-4 bg-brand-green/10 text-brand-green rounded-full inline-block">
                  <CheckCircle2 className="h-12 w-12 text-brand-green" />
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900">Responses Submitted</h2>
                <p className="text-sm text-gray-500 leading-relaxed font-medium">
                  Your assessment solutions and accompanying screen recording capture have been uploaded and processed successfully!
                </p>

                <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-left text-xs text-gray-500 font-medium">
                  <p className="font-semibold text-gray-800 mb-1">Details Summary:</p>
                  <p>Candidate: {applicantUser.name}</p>
                  <p>Status: Complete</p>
                  <p>Submit Time: {new Date().toLocaleTimeString()}</p>
                </div>

                <p className="text-xs text-gray-400">
                  The panel assessor will review your answers alongside the recording. You may close this tab or log out.
                </p>

                <button
                  onClick={onLogout}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Log Out Assessment
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Upload Overlay during video processing */}
      {uploadProgress && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-6 text-center space-y-4 shadow-xl">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-brand-green" />
            <p className="text-sm font-bold text-gray-900">{uploadProgress}</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Please do not refresh, close the page, or stop screen permissions while we process your responses.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
