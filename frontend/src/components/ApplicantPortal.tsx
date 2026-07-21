import React, { useState, useEffect, useRef } from 'react';


import { 
  ClipboardList, ScreenShare, Play, Timer, ArrowLeft, ArrowRight, 
  CheckCircle2, ShieldAlert, Loader2, 
  CheckCircle, List, StopCircle
} from 'lucide-react';
import { User } from '../types';
import { getSafeFormattedHtml } from '../utils/richText';
import { apiUrl } from '../config/api';

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
  const [recordingUploadComplete, setRecordingUploadComplete] = useState(false);
  const [uploadedRecordingId, setUploadedRecordingId] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const testActiveRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const recordedChunks = useRef<Blob[]>([]);
  const currentSegmentNumberRef = useRef(1);
  const currentSegmentClientIdRef = useRef<string | null>(null);
  const currentSegmentStartedAtRef = useRef<number | null>(null);
  const uploadedRecordingIdsRef = useRef<string[]>([]);
  const pendingRecordingUploadsRef = useRef<Promise<any | null>[]>([]);
  const finalizingInterruptedSegmentRef = useRef(false);
  const answersRef = useRef<{ [qId: string]: string }>({});
  const pendingAutosavesRef = useRef<Map<string, Promise<boolean>>>(new Map());

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
  const [missingQuestionIds, setMissingQuestionIds] = useState<string[]>([]);
  const [submitValidationMessage, setSubmitValidationMessage] = useState<string | null>(null);

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

  const fetchAssessmentData = async (options: { showLoading?: boolean } = {}) => {
    const showLoading = options.showLoading !== false;
    try {
      if (showLoading) {
        setLoading(true);
      }
      const res = await fetch(apiUrl(`/api/applicant/assessment?applicantId=${applicantUser.id}`));
      const data = await res.json();
      
      if (data.success) {
        setErrorMsg(null);
        setAssessment(data.data.assessment);
        setQuestions(data.data.questions || []);
        if (data.data.statusRecord?.id && data.data.statusRecord.id !== statusRecord?.id) {
          setRecordingUploadComplete(false);
          setUploadedRecordingId(null);
          uploadedRecordingIdsRef.current = [];
          currentSegmentNumberRef.current = 1;
          currentSegmentClientIdRef.current = null;
          currentSegmentStartedAtRef.current = null;
          recordedChunks.current = [];
        }
        if (Array.isArray(data.data.recordings)) {
          const existingRecordingIds = data.data.recordings
            .map((recording: any) => recording.id)
            .filter(Boolean);
          const highestSegmentNumber = data.data.recordings.reduce((highest: number, recording: any) => {
            const segmentNumber = Number(recording.segment_number ?? 0);
            return Number.isFinite(segmentNumber) ? Math.max(highest, segmentNumber) : highest;
          }, 0);

          uploadedRecordingIdsRef.current = existingRecordingIds;
          setUploadedRecordingId(existingRecordingIds[existingRecordingIds.length - 1] ?? null);
          setRecordingUploadComplete(existingRecordingIds.length > 0);
          currentSegmentNumberRef.current = highestSegmentNumber + 1;
        }
        setStatusRecord(data.data.statusRecord);
        if (data.data.answers || data.data.questions) {
          const restoredAnswers = { ...(data.data.answers || {}) };
          (data.data.questions || []).forEach((question: any) => {
            const draft = localStorage.getItem(`assessment_answer_${question.id}`);
            if (draft !== null) {
              restoredAnswers[question.id] = draft;
            }
          });
          setAnswers(restoredAnswers);
          answersRef.current = restoredAnswers;
        }
        
        // Setup initial stage
        if (data.data.statusRecord) {
          const status = data.data.statusRecord.status;
          if (status === 'SUBMITTED' || status === 'EXPIRED') {
            setStage('completed');
          } else if (status === 'IN_PROGRESS') {
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
              if (hasActiveRecording()) {
                setStage('test');
                setTestActive(true);
              } else {
                setStage('recording-consent');
                setTestActive(false);
                setErrorMsg("Your assessment is still in progress. Please share your screen again to continue.");
              }
            }
          }
        }
        return true;
      } else {
        setErrorMsg(data.message || 'No active assessments found');
        return false;
      }
    } catch (err) {
      setErrorMsg('Failed to connect to the server');
      return false;
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Screen recording trigger
  const isScreenStreamLive = (stream: MediaStream | null = screenStreamRef.current) => {
    const videoTrack = stream?.getVideoTracks()[0];
    return Boolean(videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled);
  };

  const hasActiveRecording = () => {
    const recorder = mediaRecorderRef.current;
    return Boolean(recorder && recorder.state === 'recording' && isScreenStreamLive());
  };

  const logRecordingEvent = (eventType: string, segmentNumber = currentSegmentNumberRef.current, overrideApplicantAssessmentId?: string) => {
    const applicantAssessmentId = overrideApplicantAssessmentId ?? statusRecord?.id;
    if (!applicantAssessmentId) return;

    fetch(apiUrl('/api/applicant/recording/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantAssessmentId,
        eventType,
        segmentNumber
      })
    }).catch(err => {
      console.warn("Recording event log failed:", { eventType, err });
    });
  };

  const requestScreenSharing = async () => {
    setErrorMsg(null);
    try {
      if (pendingRecordingUploadsRef.current.length > 0) {
        setUploadProgress("Saving previous recording segment...");
        const results = await Promise.all(pendingRecordingUploadsRef.current);
        setUploadProgress(null);
        if (results.some(result => !result)) {
          setErrorMsg("The previous recording segment could not upload. Please check your connection and try again.");
          return;
        }
      }

      // Prompt with maximum cross-browser settings
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false // Screen recording audio is optional and often blocks in browsers, video is sufficient
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        stream.getTracks().forEach(track => track.stop());
        setRecordingPermission(false);
        setErrorMsg("Screen recording permission is required to proceed. Please select an active screen or browser tab.");
        return;
      }

      // Listen for the applicant stopping the sharing via browser bar
      videoTrack.onended = () => {
        handleScreenShareInterrupted();
      };

      setScreenStream(stream);
      screenStreamRef.current = stream;
      setRecordingPermission(true);
      setRecordingUploadComplete(false);

      if (statusRecord?.status === 'IN_PROGRESS') {
        const recorderStarted = startMediaRecorder(stream, { resetChunks: true });
        if (!recorderStarted || !hasActiveRecording()) {
          stopRecordingResources();
          setErrorMsg("Screen recording could not be restored. Please try sharing your screen again.");
          return;
        }

        setErrorMsg(null);
        setStage('test');
        setTestActive(true);
      }
    } catch (err: any) {
      console.error("Screen share permission failed:", err);
      setRecordingPermission(false);
      setStage('recording-consent');
      setTestActive(false);
      setErrorMsg("Screen recording permission is required to proceed. Please click the button and select a screen/tab to share.");
    }
  };

  const handleScreenShareInterrupted = () => {
    if (finalizingInterruptedSegmentRef.current) {
      return;
    }
    finalizingInterruptedSegmentRef.current = true;
    setRecordingActive(false);
    setRecordingPermission(false);
    setScreenStream(null);
    screenStreamRef.current = null;
    setTestActive(false);
    if (testActiveRef.current && !isSubmittingRef.current) {
      setErrorMsg("Screen sharing was stopped. Please restore screen sharing before answering or submitting.");
    }
      console.log("SCREEN_SHARE_STOPPED", {
        applicantAssessmentId: statusRecord?.id ?? null,
        segmentNumber: currentSegmentNumberRef.current,
        timestamp: new Date().toISOString()
      });
      logRecordingEvent("SCREEN_SHARE_STOPPED");

    if (statusRecord?.id && !isSubmittingRef.current) {
      const uploadPromise = uploadCurrentRecording(statusRecord.id, { stopStream: false })
        .catch(err => {
          console.error("Interrupted recording segment upload failed:", err);
          setSubmitValidationMessage("Screen sharing stopped. The last recording segment could not upload yet. Please check your connection and try restoring screen sharing.");
          return null;
        });
      pendingRecordingUploadsRef.current.push(uploadPromise);
      uploadPromise.finally(() => {
        pendingRecordingUploadsRef.current = pendingRecordingUploadsRef.current.filter(promise => promise !== uploadPromise);
        finalizingInterruptedSegmentRef.current = false;
      });
    } else {
      finalizingInterruptedSegmentRef.current = false;
    }
  };

  const restoreScreenSharing = async () => {
    setErrorMsg(null);
    setSubmitValidationMessage(null);
    try {
      if (pendingRecordingUploadsRef.current.length > 0) {
        setUploadProgress("Saving previous recording segment...");
        const results = await Promise.all(pendingRecordingUploadsRef.current);
        setUploadProgress(null);
        if (results.some(result => !result)) {
          setErrorMsg("The previous recording segment could not upload. Please check your connection and try again.");
          return;
        }
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        stream.getTracks().forEach(track => track.stop());
        setErrorMsg("Screen sharing could not be restored. Please select an active screen or browser tab.");
        return;
      }

      videoTrack.onended = () => {
        handleScreenShareInterrupted();
      };

      setScreenStream(stream);
      screenStreamRef.current = stream;
      setRecordingPermission(true);
      setRecordingUploadComplete(false);

      const recorderStarted = startMediaRecorder(stream, { resetChunks: true });
      if (!recorderStarted || !hasActiveRecording()) {
        stopRecordingResources();
        setErrorMsg("Screen recording could not be restored. Please try sharing your screen again.");
        return;
      }
      console.log("SCREEN_SHARE_RESTORED", {
        applicantAssessmentId: statusRecord?.id ?? null,
        segmentNumber: currentSegmentNumberRef.current,
        timestamp: new Date().toISOString()
      });
      logRecordingEvent("SCREEN_SHARE_RESTORED");
    } catch (err) {
      console.error("Screen share restore failed:", err);
      setErrorMsg("Screen sharing is required to continue. Please restore screen sharing.");
    }
  };

  const handleStartAssessment = async () => {
    const activeStream = screenStreamRef.current || screenStream;
    if (!recordingPermission || !activeStream || !isScreenStreamLive(activeStream) || !assessment) {
      setErrorMsg("Please grant screen recording permissions before starting.");
      return;
    }

    try {
      setStartingAssessment(true);
      const recorderStarted = startMediaRecorder(activeStream, { resetChunks: true });
      if (!recorderStarted || !hasActiveRecording()) {
        stopRecordingResources();
        setErrorMsg("Screen recording must be active before the assessment can start. Please share your screen again.");
        return;
      }

      const res = await fetch(apiUrl('/api/applicant/assessment/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantId: applicantUser.id,
          assessmentId: assessment.id
        })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setStatusRecord(data.data);
        logRecordingEvent("SCREEN_SHARE_STARTED", currentSegmentNumberRef.current, data.data.id);

        const reloaded = await fetchAssessmentData({ showLoading: false });
        if (!reloaded) {
          setErrorMsg("Assessment started, but questions could not be loaded. Please check your connection and try again.");
          return;
        }
      } else {
        stopRecordingResources();
        setErrorMsg(data.message || 'Failed to start assessment');
      }
    } catch (err) {
      stopRecordingResources();
      setErrorMsg("Failed to start assessment. Please check your internet connection.");
    } finally {
      setStartingAssessment(false);
    }
  };

  const startMediaRecorder = (stream: MediaStream, options: { resetChunks?: boolean } = {}) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      return true;
    }

    if (!stream || !isScreenStreamLive(stream)) {
      console.error("No screen stream available.");
      setErrorMsg("Screen recording stream is not available. Please grant permission again.");
      return false;
    }

    try {
      if (options.resetChunks) {
        recordedChunks.current = [];
      }
      currentSegmentStartedAtRef.current = Date.now();
      currentSegmentClientIdRef.current = currentSegmentClientIdRef.current
        ?? `seg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setRecordingUploadComplete(false);
      setUploadedRecordingId(null);

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
        setRecordingActive(false);
        setRecordingPermission(false);
        setErrorMsg("Recording encountered an error. Please restore screen sharing before continuing.");
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
      setRecordingActive(recorder.state === 'recording');
      setRecordingStartTime(prev => (options.resetChunks ? Date.now() : prev ?? Date.now()));

      console.log("SCREEN_SHARE_STARTED", {
        applicantAssessmentId: statusRecord?.id ?? null,
        segmentNumber: currentSegmentNumberRef.current,
        timestamp: new Date().toISOString()
      });
      logRecordingEvent("SCREEN_SHARE_STARTED");
      console.log("MediaRecorder started:", recorder.state);
      return recorder.state === 'recording';
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

  const stopMediaRecorderAndCollectChunks = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }

    await new Promise<void>((resolve) => {
      const previousOnStop = recorder.onstop;
      recorder.onstop = (event) => {
        previousOnStop?.call(recorder, event);
        resolve();
      };

      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch (err) {
        console.warn("Unable to request final recording data:", err);
      }

      recorder.stop();
    });

    mediaRecorderRef.current = null;
  };

  const uploadCurrentRecording = async (applicantAssessmentId: string, options: { stopStream?: boolean } = {}) => {
    const segmentStartedAt = currentSegmentStartedAtRef.current ?? recordingStartTime ?? Date.now();
    const segmentEndedAt = Date.now();
    const recordingDurationSeconds = segmentStartedAt
      ? Math.max(0, Math.floor((segmentEndedAt - segmentStartedAt) / 1000))
      : 0;
    const segmentNumber = currentSegmentNumberRef.current;
    const clientSegmentId = currentSegmentClientIdRef.current
      ?? `seg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await stopMediaRecorderAndCollectChunks();

    const stream = screenStreamRef.current;
    if (stream && options.stopStream !== false) {
      stream.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setRecordingPermission(false);
    }
    setRecordingActive(false);

    if (recordedChunks.current.length === 0) {
      throw new Error("Screen recording is missing. Please restore screen sharing and try again.");
    }

    const videoBlob = new Blob(recordedChunks.current, { type: 'video/webm' });
    if (videoBlob.size === 0) {
      throw new Error("Screen recording is empty. Please restore screen sharing and try again.");
    }

    const videoFile = new File([videoBlob], `screen-record-${applicantAssessmentId}-segment-${segmentNumber}.webm`, { type: 'video/webm' });
    console.log("Recording final blob prepared:", {
      applicantAssessmentId,
      segmentNumber,
      blobSize: videoBlob.size,
      chunks: recordedChunks.current.length
    });
    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('applicantAssessmentId', applicantAssessmentId);
    formData.append('duration', recordingDurationSeconds.toString());
    formData.append('segmentNumber', segmentNumber.toString());
    formData.append('clientSegmentId', clientSegmentId);
    formData.append('segmentStartedAt', new Date(segmentStartedAt).toISOString());
    formData.append('segmentEndedAt', new Date(segmentEndedAt).toISOString());

    const uploadRes = await fetch(apiUrl('/api/applicant/recording/upload'), {
      method: 'POST',
      body: formData
    });
    const uploadResult = await uploadRes.json();

    if (!uploadRes.ok || !uploadResult.success) {
      throw new Error(uploadResult.message || "Failed to upload screen recording. Please try again.");
    }

    const recordingId = uploadResult.data?.id;
    if (!recordingId) {
      throw new Error("Recording uploaded, but the server did not return a recording id. Please try again.");
    }

    console.log("Recording upload confirmed:", {
      applicantAssessmentId,
      recordingId,
      segmentNumber,
      fileSize: uploadResult.data?.file_size ?? videoBlob.size
    });

    setUploadedRecordingId(recordingId);
    uploadedRecordingIdsRef.current = uploadedRecordingIdsRef.current.includes(recordingId)
      ? uploadedRecordingIdsRef.current
      : [...uploadedRecordingIdsRef.current, recordingId];
    setRecordingUploadComplete(true);
    recordedChunks.current = [];
    currentSegmentStartedAtRef.current = null;
    currentSegmentClientIdRef.current = null;
    currentSegmentNumberRef.current = segmentNumber + 1;
    return uploadResult.data;
  };

  // Auto-saves answers with debouncing
  const handleAnswerChange = (questionId: string, value: string) => {
    if (!hasActiveRecording() && !recordingUploadComplete) {
      setErrorMsg("Screen sharing is required before you can continue answering.");
      return;
    }

    answersRef.current = { ...answersRef.current, [questionId]: value };
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (value.trim().length > 0) {
      setMissingQuestionIds(prev => prev.filter(id => id !== questionId));
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
    if (!statusRecord) return false;

    const savePromise = (async () => {
      try {
      const res = await fetch(apiUrl('/api/applicant/answers/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantAssessmentId: statusRecord.id,
          questionId,
          answerText: text
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data = await res.json();

      if (data.success) {
        setAutoSaveStatus('saved');
        localStorage.removeItem(`assessment_answer_${questionId}`);
        return true;
      } else {
        setAutoSaveStatus('error');
        scheduleAutosaveRetry(questionId, text);
        return false;
      }
    } catch (err) {
      console.error("Autosave failed:", err);
      setAutoSaveStatus('error');
      scheduleAutosaveRetry(questionId, text);
      return false;
    }
    })();

    pendingAutosavesRef.current.set(questionId, savePromise);
    savePromise.finally(() => {
      if (pendingAutosavesRef.current.get(questionId) === savePromise) {
        pendingAutosavesRef.current.delete(questionId);
      }
    });

    return savePromise;
  };

  const scheduleAutosaveRetry = (questionId: string, text: string) => {
    if (retryTimers.current[questionId]) {
      clearTimeout(retryTimers.current[questionId]);
    }

    retryTimers.current[questionId] = setTimeout(() => {
      saveAnswerToBackend(questionId, text);
    }, 3000);
  };

  const handleAutoSubmitOnExpiry = () => {
    submitAssessment('EXPIRED');
  };

  const handleForceSubmit = () => {
    submitAssessment('SUBMITTED');
  };

  const getMissingQuestionIds = () => {
    return questions
      .filter((question) => {
        const answer = answersRef.current[question.id];
        return answer == null || String(answer).trim().length === 0;
      })
      .map((question) => question.id);
  };

  const logSubmissionDiagnostics = (context: string, missingQuestionIds: string[] = []) => {
    const answeredQuestionIds = questions
      .filter(question => String(answersRef.current[question.id] ?? '').trim().length > 0)
      .map(question => question.id);

    console.log("Assessment submission diagnostics:", {
      context,
      applicantAssessmentId: statusRecord?.id ?? null,
      totalQuestionCount: questions.length,
      requiredQuestionIds: questions.map(question => question.id),
      answeredQuestionIds,
      missingQuestionIds,
      pendingAutosaveOperations: pendingAutosavesRef.current.size,
      mediaRecorderState: mediaRecorderRef.current?.state ?? "none",
      recordingActive,
      recordedChunkCount: recordedChunks.current.length
    });
  };

  const flushPendingAutosaves = async () => {
    if (!statusRecord) return false;

    Object.values(debounceTimers.current).forEach(clearTimeout);
    Object.values(retryTimers.current).forEach(clearTimeout);
    debounceTimers.current = {};
    retryTimers.current = {};

    const currentAnswers = answersRef.current;
    const saveResults = await Promise.all(
      questions.map(question => {
        const answerText = currentAnswers[question.id] ?? "";
        return saveAnswerToBackend(question.id, answerText);
      })
    );

    const pendingResults = await Promise.all(Array.from(pendingAutosavesRef.current.values()));
    const allResults = [...saveResults, ...pendingResults];

    console.log("Pending autosave flush completed:", {
      applicantAssessmentId: statusRecord.id,
      attemptedSaves: saveResults.length,
      pendingAutosaveOperations: pendingAutosavesRef.current.size,
      failedSaves: allResults.filter(result => !result).length
    });

    return allResults.every(Boolean);
  };

  const validateSavedAnswersBeforeRecording = async () => {
    if (!statusRecord) return false;

    const res = await fetch(apiUrl('/api/applicant/assessment/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantAssessmentId: statusRecord.id,
        validateOnly: true
      })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      const backendMissingQuestionIds = Array.isArray(data.missingQuestionIds)
        ? data.missingQuestionIds
        : [];

      if (backendMissingQuestionIds.length > 0) {
        logSubmissionDiagnostics("backend-preflight-missing-answers", backendMissingQuestionIds);
        blockSubmitForMissingAnswers(
          backendMissingQuestionIds,
          data.message || 'Please answer all questions before submitting.'
        );
        return false;
      }

      setSubmitValidationMessage(data.message || 'Unable to validate saved answers. Please try again.');
      setUploadProgress(null);
      setTestActive(true);
      isSubmittingRef.current = false;
      return false;
    }

    console.log("Backend answer preflight passed:", {
      applicantAssessmentId: statusRecord.id,
      requiredQuestionCount: Array.isArray(data.data?.requiredQuestionIds) ? data.data.requiredQuestionIds.length : null
    });

    return true;
  };

  const blockSubmitForMissingAnswers = (
    questionIds: string[],
    message = 'Please answer all questions before submitting.'
  ) => {
    setMissingQuestionIds(questionIds);
    setSubmitValidationMessage(message);
    setErrorMsg(null);
    setUploadProgress(null);
    setTestActive(true);
    isSubmittingRef.current = false;

    const firstMissingIndex = questions.findIndex(question => questionIds.includes(question.id));
    if (firstMissingIndex >= 0) {
      setActiveQuestionIdx(firstMissingIndex);
    }
  };

  const submitAssessment = async (finalStatus: 'SUBMITTED' | 'EXPIRED') => {
    if (!statusRecord) return;
    if (!hasActiveRecording()) {
      setSubmitValidationMessage("Screen sharing must be active before you can submit.");
      setErrorMsg("Screen sharing was stopped. Please restore screen sharing before submitting.");
      return;
    }

    const localMissingQuestionIds = getMissingQuestionIds();
    if (localMissingQuestionIds.length > 0) {
      logSubmissionDiagnostics("frontend-missing-answers", localMissingQuestionIds);
      blockSubmitForMissingAnswers(localMissingQuestionIds);
      return;
    }

    isSubmittingRef.current = true;

    try {
      logSubmissionDiagnostics("before-autosave-flush");
      setUploadProgress("Saving latest answers...");
      const autosavesFlushed = await flushPendingAutosaves();
      if (!autosavesFlushed) {
        setSubmitValidationMessage("Some answers could not be saved yet. Please check your connection and try submitting again.");
        setUploadProgress(null);
        setTestActive(true);
        isSubmittingRef.current = false;
        return;
      }

      logSubmissionDiagnostics("after-autosave-flush");
      setUploadProgress("Validating saved answers...");
      const savedAnswersValid = await validateSavedAnswersBeforeRecording();
      if (!savedAnswersValid) {
        return;
      }

      if (pendingRecordingUploadsRef.current.length > 0) {
        setUploadProgress("Waiting for saved recording segments...");
        const segmentUploadResults = await Promise.all(pendingRecordingUploadsRef.current);
        if (segmentUploadResults.some(result => !result)) {
          throw new Error("A previous recording segment could not upload. Please check your connection and try again before submitting.");
        }
      }

      let recordingIdForSubmit = uploadedRecordingId;
      if (!recordingUploadComplete || !recordingIdForSubmit) {
        setUploadProgress("Compiling and uploading screen recording...");
        const uploadedRecording = await uploadCurrentRecording(statusRecord.id);
        recordingIdForSubmit = uploadedRecording.id;
      }
      const recordingIdsForSubmit = recordingIdForSubmit
        ? Array.from(new Set([...uploadedRecordingIdsRef.current, recordingIdForSubmit]))
        : uploadedRecordingIdsRef.current;

      setUploadProgress("Finalizing answers...");

      const submitFinalAssessment = async (recordingIds: string[]) => {
        const submitRes = await fetch(apiUrl('/api/applicant/assessment/submit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicantAssessmentId: statusRecord.id,
            recordingIds,
            status: finalStatus
          })
        });
        const submitData = await submitRes.json();
        return { submitRes, submitData };
      };

      let { submitRes, submitData } = await submitFinalAssessment(recordingIdsForSubmit);

      if ((!submitRes.ok || !submitData.success) && submitData.code === 'RECORDING_REQUIRED') {
        console.warn("Recording validation failed after upload; retrying recording upload once.", {
          applicantAssessmentId: statusRecord.id,
          recordingId: recordingIdForSubmit,
          recordedChunkCount: recordedChunks.current.length
        });
        setRecordingUploadComplete(false);
        setUploadedRecordingId(null);
        if (recordedChunks.current.length > 0) {
          setUploadProgress("Re-uploading screen recording...");
          const uploadedRecording = await uploadCurrentRecording(statusRecord.id);
          recordingIdForSubmit = uploadedRecording.id;
          ({ submitRes, submitData } = await submitFinalAssessment(Array.from(new Set([...recordingIdsForSubmit, recordingIdForSubmit]))));
        }
      }

      if (!submitRes.ok || !submitData.success) {
        const backendMissingQuestionIds = Array.isArray(submitData.missingQuestionIds)
          ? submitData.missingQuestionIds
          : [];

        if (backendMissingQuestionIds.length > 0) {
          logSubmissionDiagnostics("backend-missing-answers", backendMissingQuestionIds);
          blockSubmitForMissingAnswers(
            backendMissingQuestionIds,
            submitData.message || 'Please answer all questions before submitting.'
          );
          return;
        }

        if (submitData.code === 'RECORDING_REQUIRED') {
          setRecordingUploadComplete(false);
          setUploadedRecordingId(null);
        }

        setSubmitValidationMessage(submitData.message || 'Failed to submit assessment');
        isSubmittingRef.current = false;
        setUploadProgress(null);
        setTestActive(true);
        return;
      }

      setMissingQuestionIds([]);
      setSubmitValidationMessage(null);
      setTestActive(false);

      setStage('completed');
    } catch (err) {
      console.error("Submission/Upload error:", err);
      setSubmitValidationMessage(err instanceof Error ? err.message : 'Unable to submit right now. Please try again.');
      setTestActive(true);
      isSubmittingRef.current = false;
    } finally {
      setUploadProgress(null);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const evaluationQuestionCount = Number(assessment?.questionsCount ?? questions.length ?? 0);
  const answeringLocked = stage === 'test' && !recordingActive;
  const submitDisabled = Boolean(uploadProgress) || !recordingActive;

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
        ) : errorMsg && stage !== 'test' && stage !== 'recording-consent' ? (
          <div className="bg-white border border-red-100 rounded-2xl p-8 text-center max-w-md mx-auto shadow-sm space-y-4">
            <ShieldAlert className="h-12 w-12 text-rose-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Access Restricted</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{errorMsg}</p>
            <button 
              onClick={() => fetchAssessmentData()}
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
                      {evaluationQuestionCount} {evaluationQuestionCount === 1 ? 'Item' : 'Items'}
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
                        {statusRecord?.status === 'IN_PROGRESS' && (
                          <p className="font-bold text-red-800 mb-1">Screen Sharing Required</p>
                        )}
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
                    disabled={!recordingPermission || !isScreenStreamLive() || startingAssessment}
                    onClick={handleStartAssessment}
                    hidden={statusRecord?.status === 'IN_PROGRESS'}
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
                      const isMissing = missingQuestionIds.includes(q.id) && !hasAnswer;
                      return (
                        <button
                          key={q.id}
                          onClick={() => setActiveQuestionIdx(idx)}
                          className={`aspect-square flex items-center justify-center font-bold font-mono text-xs rounded-xl border transition-all cursor-pointer ${
                            isActive
                              ? 'bg-brand-green border-brand-green text-white shadow-md shadow-brand-green/20'
                              : isMissing
                              ? 'bg-rose-50 border-rose-200 text-rose-600'
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

                  {answeringLocked && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800 space-y-2">
                      <p>Screen sharing is interrupted. Restore it to continue answering or submit.</p>
                      <button
                        onClick={restoreScreenSharing}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                      >
                        Restore Screen Sharing
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleForceSubmit}
                    disabled={submitDisabled}
                    className="w-full flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl text-xs cursor-pointer transition-colors shadow-sm"
                  >
                    <StopCircle className="h-4 w-4 text-brand-yellow" />
                    Submit Final Responses
                  </button>
                </div>

                {/* Right active question pane */}
                <div className={`md:col-span-8 bg-white border rounded-2xl p-6 shadow-sm space-y-6 ${
                  missingQuestionIds.includes(questions[activeQuestionIdx].id) && !(answers[questions[activeQuestionIdx].id] || '').trim()
                    ? 'border-rose-300 ring-2 ring-rose-100'
                    : 'border-gray-100'
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
                        disabled={answeringLocked}
                        className={`w-full min-h-48 border rounded-xl p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green font-medium transition-all ${
                          missingQuestionIds.includes(questions[activeQuestionIdx].id) && !(answers[questions[activeQuestionIdx].id] || '').trim()
                            ? 'border-rose-300 bg-rose-50/40'
                            : 'border-gray-300'
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
                          disabled={answeringLocked}
                          className={`w-full min-h-64 bg-slate-900 text-slate-100 border rounded-xl p-4 text-xs leading-relaxed focus:outline-none font-mono focus:ring-2 focus:ring-brand-green focus:border-brand-green transition-all ${
                            missingQuestionIds.includes(questions[activeQuestionIdx].id) && !(answers[questions[activeQuestionIdx].id] || '').trim()
                              ? 'border-rose-400'
                              : 'border-slate-800'
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
                              disabled={answeringLocked}
                              onClick={() => {
                                if (answeringLocked) return;
                                answersRef.current = { ...answersRef.current, [questions[activeQuestionIdx].id]: opt };
                                setAnswers(prev => ({ ...prev, [questions[activeQuestionIdx].id]: opt }));
                                setMissingQuestionIds(prev => prev.filter(id => id !== questions[activeQuestionIdx].id));
                                setSubmitValidationMessage(null);
                                saveAnswerToBackend(questions[activeQuestionIdx].id, opt);
                              }}
                              className={`w-full p-4 rounded-xl border text-left text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
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
