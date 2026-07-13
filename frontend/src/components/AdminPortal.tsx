import React, { useState, useEffect, useRef } from 'react';
import { 
  ClipboardList, Users, CheckCircle2, AlertCircle, Play, Sparkles, 
  Plus, Edit, Trash2, Clock, Award, MessageSquare, ChevronRight, ChevronLeft,
  ExternalLink, RotateCcw, Save, Loader2, Video, FileText, Check, AlertTriangle,
  Copy, Link, Shield, Menu, X, LogOut
} from 'lucide-react';
import { User, Assessment, Question, SubmissionSummary, Review } from '../types';
import RichTextEditor from './RichTextEditor';
import { getSafeFormattedHtml, stripHtmlTags } from '../utils/richText';
import { apiRequest } from '../config/api';

interface AdminPortalProps {
  adminUser: User;
  onLogout: () => void;
}

export default function AdminPortal({ adminUser, onLogout }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<'submissions' | 'assessments' | 'roles'>('submissions');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  // Roles state
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleStatus, setRoleStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [filterRoleId, setFilterRoleId] = useState('');

  // Assessments state
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<any | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);
  const [newAssessmentTitle, setNewAssessmentTitle] = useState('');
  const [newAssessmentInstructions, setNewAssessmentInstructions] = useState('');
  const [newAssessmentTime, setNewAssessmentTime] = useState(15);
  const [assessmentDuration, setAssessmentDuration] = useState(15);
  const [newAssessmentStatus, setNewAssessmentStatus] = useState<'ACTIVE' | 'DRAFT'>('DRAFT');
  const [newAssessmentRoleId, setNewAssessmentRoleId] = useState('');

  // Question form state
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState<'TEXT' | 'MULTIPLE_CHOICE' | 'CODE'>('TEXT');
  const [questionOptions, setQuestionOptions] = useState<string[]>(['', '', '', '']);
  const [questionPoints, setQuestionPoints] = useState(10);
  const [questionOrder, setQuestionOrder] = useState(1);
  const [questionDifficulty, setQuestionDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [easyCount, setEasyCount] = useState(0);
  const [mediumCount, setMediumCount] = useState(0);
  const [hardCount, setHardCount] = useState(0);
  const [randomizeOrder, setRandomizeOrder] = useState(true);

  // AI Question Generation state
  const [showAIGenModal, setShowAIGenModal] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiNumQuestions, setAiNumQuestions] = useState(3);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [submissionDetails, setSubmissionDetails] = useState<any | null>(null);
  const [submissionPendingDelete, setSubmissionPendingDelete] = useState<any | null>(null);
  const [deleteApplicantAccount, setDeleteApplicantAccount] = useState(false);
  const [deletingSubmission, setDeletingSubmission] = useState(false);
  // Video player controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [recordingSignedUrl, setRecordingSignedUrl] = useState<string | null>(null);
  const [recordingUrlLoading, setRecordingUrlLoading] = useState(false);
  const [recordingUrlError, setRecordingUrlError] = useState<string | null>(null);

  // Review form state
  const [reviewScore, setReviewScore] = useState<number>(0);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  // AI Grading state
  const [aiGradingLoading, setAiGradingLoading] = useState(false);
  const [aiGradingResult, setAiGradingResult] = useState<any | null>(null);

  // General loading states
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchAssessments();
    fetchSubmissions();
    fetchRoles();
  }, []);

  useEffect(() => {
    setIsConfirmingDelete(false);
  }, [selectedAssessment?.id]);

  useEffect(() => {
    const recordingId = submissionDetails?.recording?.id;
    if (!recordingId) {
      setRecordingSignedUrl(null);
      setRecordingUrlLoading(false);
      setRecordingUrlError(null);
      return;
    }

    let isCancelled = false;

    const fetchRecordingSignedUrl = async () => {
      try {
        setRecordingUrlLoading(true);
        setRecordingUrlError(null);
        setRecordingSignedUrl(null);
        const data: any = await apiRequest(`/api/admin/recordings/${recordingId}/url`);
        if (!data.success) {
          throw new Error(data.message || "Failed to load recording URL");
        }

        if (!isCancelled) {
          setRecordingSignedUrl(data.data.signedUrl);
        }
      } catch (err) {
        console.error("Error fetching recording signed URL:", {
          recordingId,
          error: err
        });
        if (!isCancelled) {
          setRecordingUrlError("Unable to load recording playback URL.");
        }
      } finally {
        if (!isCancelled) {
          setRecordingUrlLoading(false);
        }
      }
    };

    fetchRecordingSignedUrl();

    return () => {
      isCancelled = true;
    };
  }, [submissionDetails?.recording?.id]);

  const fetchRoles = async () => {
    try {
      const data: any = await apiRequest('/api/roles');
      if (data.success) {
        setRoles(data.data);
      }
    } catch (err) {
      console.error("Error fetching roles:", err);
    }
  };

  const fetchAssessments = async () => {
    try {
      const data: any = await apiRequest('/api/admin/assessments');
      if (data.success) {
        setAssessments(data.data);
      }
    } catch (err) {
      console.error("Error fetching assessments:", err);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const data: any = await apiRequest('/api/admin/submissions');
      if (data.success) {
        setSubmissions(data.data);
      }
    } catch (err) {
      console.error("Error fetching submissions:", err);
    }
  };

  const fetchAssessmentDetails = async (id: string) => {
    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/admin/assessments/${id}`);
      if (data.success) {
        setSelectedAssessment(data.data);
        const config = data.data.questionConfig || {};
        setEasyCount(Number(config.easy_count ?? 0));
        setMediumCount(Number(config.medium_count ?? 0));
        setHardCount(Number(config.hard_count ?? 0));
        setRandomizeOrder(config.randomize_order !== false);
        setAssessmentDuration(Number(data.data.time_limit_minutes ?? data.data.timeLimitMinutes ?? 15));
      }
    } catch (err) {
      console.error("Error fetching assessment details:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissionDetails = async (id: string) => {
    try {
      setLoading(true);
      setAiGradingResult(null); // Reset previous AI grading suggestions
      const data: any = await apiRequest(`/api/admin/submissions/${id}`);
      if (data.success) {
        setSubmissionDetails(data.data);
        setSelectedSubmissionId(id);
        // Prepopulate score and remarks if review already exists
        if (data.data.review) {
          setReviewScore(data.data.review.score);
          setReviewRemarks(data.data.review.remarks);
        } else {
          setReviewScore(0);
          setReviewRemarks('');
        }
      }
    } catch (err) {
      console.error("Error fetching submission details:", err);
    } finally {
      setLoading(false);
    }
  };

  // Manage Assessment Operations
  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const data: any = await apiRequest('/api/admin/assessments', {
        method: 'POST',
        body: JSON.stringify({
          title: newAssessmentTitle,
          instructions: newAssessmentInstructions,
          time_limit_minutes: newAssessmentTime,
          status: newAssessmentStatus,
          role_id: newAssessmentRoleId || null,
          created_by: adminUser.id
        })
      });
      if (data.success) {
        showStatus('success', 'Assessment created successfully!');
        setIsCreatingAssessment(false);
        setNewAssessmentTitle('');
        setNewAssessmentInstructions('');
        setNewAssessmentTime(15);
        setNewAssessmentRoleId('');
        fetchAssessments();
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAssessmentStatus = async (id: string, status: 'ACTIVE' | 'DRAFT') => {
    try {
      const data: any = await apiRequest(`/api/admin/assessments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      if (data.success) {
        showStatus('success', `Assessment is now ${status}`);
        fetchAssessments();
        if (selectedAssessment && selectedAssessment.id === id) {
          fetchAssessmentDetails(id);
        }
      }
    } catch (err) {
      showStatus('error', 'Failed to update assessment status');
    }
  };

  const handleDeleteAssessment = async (id: string) => {
    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/admin/assessments/${id}`, { method: 'DELETE' });
      if (data.success) {
        showStatus('success', 'Assessment deleted');
        setSelectedAssessment(null);
        fetchAssessments();
      } else {
        showStatus('error', data.message || 'Failed to delete assessment');
      }
    } catch (err) {
      showStatus('error', 'Failed to delete assessment');
    } finally {
      setLoading(false);
    }
  };

  // Manage Question Operations
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessment) return;

    const endpoint = editingQuestionId 
      ? `/api/admin/questions/${editingQuestionId}` 
      : `/api/admin/assessments/${selectedAssessment.id}/questions`;
    const method = editingQuestionId ? 'PUT' : 'POST';

    try {
      setLoading(true);
      const data: any = await apiRequest(endpoint, {
        method,
        body: JSON.stringify({
          question_text: questionText,
          question_type: questionType,
          options: questionType === 'MULTIPLE_CHOICE' ? questionOptions.filter(o => o.trim() !== '') : [],
          points: questionPoints,
          order_number: questionOrder,
          difficulty: questionDifficulty
        })
      });
      if (data.success) {
        showStatus('success', editingQuestionId ? 'Question updated!' : 'Question added!');
        resetQuestionForm();
        fetchAssessmentDetails(selectedAssessment.id);
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to save question');
    } finally {
      setLoading(false);
    }
  };

  const handleEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setQuestionText(q.questionText || (q as any).question_text);
    setQuestionType((q.questionType || (q as any).question_type) as any);
    setQuestionOptions((q as any).options || ['', '', '', '']);
    setQuestionPoints(q.points);
    setQuestionOrder(q.orderNumber || (q as any).order_number);
    setQuestionDifficulty(((q as any).difficulty || 'MEDIUM') as any);
    setIsAddingQuestion(true);
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      const data: any = await apiRequest(`/api/admin/questions/${qId}`, { method: 'DELETE' });
      if (data.success) {
        showStatus('success', 'Question deleted');
        if (selectedAssessment) {
          fetchAssessmentDetails(selectedAssessment.id);
        }
      }
    } catch (err) {
      showStatus('error', 'Failed to delete question');
    }
  };

  const resetQuestionForm = () => {
    setIsAddingQuestion(false);
    setEditingQuestionId(null);
    setQuestionText('');
    setQuestionType('TEXT');
    setQuestionOptions(['', '', '', '']);
    setQuestionPoints(10);
    setQuestionOrder(selectedAssessment ? selectedAssessment.questions.length + 1 : 1);
    setQuestionDifficulty('MEDIUM');
  };

  const handleSaveQuestionConfig = async () => {
    if (!selectedAssessment) return;

    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/admin/assessments/${selectedAssessment.id}/question-config`, {
        method: 'PUT',
        body: JSON.stringify({
          easy_count: easyCount,
          medium_count: mediumCount,
          hard_count: hardCount,
          randomize_order: randomizeOrder
        })
      });
      if (data.success) {
        showStatus('success', 'Question randomization settings saved.');
        fetchAssessmentDetails(selectedAssessment.id);
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to save question randomization settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAssessmentDuration = async () => {
    if (!selectedAssessment) return;
    if (!Number.isFinite(assessmentDuration) || assessmentDuration < 1) {
      showStatus('error', 'Time limit must be a positive number');
      return;
    }

    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/admin/assessments/${selectedAssessment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ time_limit_minutes: assessmentDuration })
      });
      if (data.success) {
        showStatus('success', 'Assessment duration updated.');
        fetchAssessments();
        fetchAssessmentDetails(selectedAssessment.id);
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to update assessment duration');
    } finally {
      setLoading(false);
    }
  };

  // Manage Role Operations
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const endpoint = editingRoleId ? `/api/admin/roles/${editingRoleId}` : '/api/admin/roles';
      const method = editingRoleId ? 'PUT' : 'POST';

      const data: any = await apiRequest(endpoint, {
        method,
        body: JSON.stringify({
          role_name: roleName,
          description: roleDescription,
          status: roleStatus
        })
      });
      if (data.success) {
        showStatus('success', editingRoleId ? 'Role updated successfully!' : 'Role created successfully!');
        setIsCreatingRole(false);
        setEditingRoleId(null);
        setRoleName('');
        setRoleDescription('');
        setRoleStatus('ACTIVE');
        fetchRoles();
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to save role');
    } finally {
      setLoading(false);
    }
  };

  const handleEditRole = (role: any) => {
    setEditingRoleId(role.id);
    setRoleName(role.role_name);
    setRoleDescription(role.description || '');
    setRoleStatus(role.status || 'ACTIVE');
    setIsCreatingRole(true);
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Are you sure you want to delete or deactivate this role?")) return;
    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/admin/roles/${roleId}`, {
        method: 'DELETE'
      });
      if (data.success) {
        showStatus('success', 'Role removed successfully');
        fetchRoles();
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to delete role');
    } finally {
      setLoading(false);
    }
  };

  // AI Generation of questions
  const handleAIGenerateQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiTopic.trim() || !selectedAssessment) return;

    try {
      setAiGenerating(true);
      const data: any = await apiRequest('/api/admin/ai/generate-questions', {
        method: 'POST',
        body: JSON.stringify({
          topic: aiTopic,
          numQuestions: aiNumQuestions,
          assessmentId: selectedAssessment.id
        })
      });
      if (data.success) {
        showStatus('success', `AI generated and saved ${data.data.length} questions!`);
        setShowAIGenModal(false);
        setAiTopic('');
        fetchAssessmentDetails(selectedAssessment.id);
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Error generating questions with AI');
    } finally {
      setAiGenerating(false);
    }
  };

  // Review Operations
  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmissionId) return;

    try {
      setSavingReview(true);
      const data: any = await apiRequest(`/api/admin/submissions/${selectedSubmissionId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          score: reviewScore,
          remarks: reviewRemarks,
          reviewed_by: adminUser.id
        })
      });
      if (data.success) {
        showStatus('success', 'Review and grade saved successfully!');
        fetchSubmissions();
        fetchSubmissionDetails(selectedSubmissionId);
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to save review');
    } finally {
      setSavingReview(false);
    }
  };

  // AI Grading Assistance
  const handleAIGradingAssist = async () => {
    if (!selectedSubmissionId) return;

    try {
      setAiGradingLoading(true);
      setAiGradingResult(null);
      const data: any = await apiRequest(`/api/admin/submissions/${selectedSubmissionId}/ai-grade`, {
        method: 'POST'
      });
      if (data.success) {
        setAiGradingResult(data.data);
        showStatus('success', 'AI evaluation complete!');
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Error running AI grading assistance');
    } finally {
      setAiGradingLoading(false);
    }
  };

  const applyAIGrading = () => {
    if (!aiGradingResult) return;
    setReviewScore(aiGradingResult.suggested_score);
    setReviewRemarks(aiGradingResult.overall_remarks);
    showStatus('success', 'Applied AI recommended score and feedback remarks.');
  };

  const formatSubmissionDate = (value?: string | null) => {
    if (!value) return null;
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  };

  const getSubmissionStatusDisplay = (submission: any) => {
    if (submission.status === 'RETAKE_ALLOWED') {
      return {
        label: 'Retake',
        detail: 'Retake allowed',
        className: 'bg-violet-50 text-violet-700 border border-violet-100'
      };
    }

    if (submission.status === 'SUBMITTED' || submission.status === 'EXPIRED') {
      const completedDate = formatSubmissionDate(submission.submittedAt);
      return {
        label: 'Completed',
        detail: completedDate ? `Completed on ${completedDate}` : 'Completed',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-100'
      };
    }

    if (submission.status === 'IN_PROGRESS') {
      const startedDate = formatSubmissionDate(submission.startTime);
      return {
        label: 'In Progress',
        detail: startedDate ? `Started on ${startedDate}` : 'In progress',
        className: 'bg-blue-50 text-blue-700 border border-blue-100'
      };
    }

    return {
      label: submission.status || 'Not Started',
      detail: 'Not started',
      className: 'bg-gray-50 text-gray-600 border border-gray-100'
    };
  };

  const handleResetSubmission = async () => {
    if (!selectedSubmissionId || !submissionDetails) return;
    const submissionId = selectedSubmissionId;
    const applicantName = submissionDetails.applicant?.name || 'applicant';
    if (!confirm(`Are you sure you want to allow ${applicantName} to retake this assessment? The previous answers and screen recording will remain visible here as history.`)) return;

    try {
      setLoading(true);
      const data: any = await apiRequest(`/api/admin/submissions/${submissionId}/reset`, {
        method: 'POST'
      });
      if (data.success) {
        showStatus('success', 'Submission reset. Applicant can now retake.');
        await fetchSubmissions();
        await fetchSubmissionDetails(submissionId);
      } else {
        showStatus('error', data.message);
      }
    } catch (err) {
      showStatus('error', 'Failed to reset submission');
    } finally {
      setLoading(false);
    }
  };

  const openDeleteSubmissionModal = (submission: any) => {
    setSubmissionPendingDelete(submission);
    setDeleteApplicantAccount(false);
  };

  const closeDeleteSubmissionModal = () => {
    if (deletingSubmission) return;
    setSubmissionPendingDelete(null);
    setDeleteApplicantAccount(false);
  };

  const handleDeleteSubmission = async () => {
    if (!submissionPendingDelete) return;

    const submissionId = submissionPendingDelete.applicantAssessmentId;

    try {
      setDeletingSubmission(true);
      const data: any = await apiRequest(`/api/admin/submissions/${submissionId}`, {
        method: 'DELETE',
        body: JSON.stringify({ deleteApplicantAccount })
      });

      if (!data.success) {
        showStatus('error', data.message || 'Failed to delete applicant submission');
        return;
      }

      setSubmissions(prev => prev.filter(sub => sub.applicantAssessmentId !== submissionId));
      if (selectedSubmissionId === submissionId) {
        setSelectedSubmissionId(null);
        setSubmissionDetails(null);
        setRecordingSignedUrl(null);
      }
      setSubmissionPendingDelete(null);
      setDeleteApplicantAccount(false);
      showStatus('success', 'Applicant submission deleted successfully.');
    } catch (err) {
      console.error("Error deleting applicant submission:", err);
      showStatus('error', 'Failed to delete applicant submission');
    } finally {
      setDeletingSubmission(false);
    }
  };

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  const renderSidebarContent = (isMobile: boolean = false) => {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-none">
        {/* Branding/Header */}
        <div className="p-5 flex items-center justify-between border-b border-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/10 shrink-0">
              <ClipboardList className="h-5 w-5" />
            </div>
            {(!isSidebarCollapsed || isMobile) && (
              <div className="min-w-0">
                <h1 className="font-bold text-sm tracking-tight text-white leading-tight truncate">AI Assessment</h1>
                <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">Admin Portal</p>
              </div>
            )}
          </div>
          {isMobile && (
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => {
              setActiveTab('submissions');
              setSelectedSubmissionId(null);
              setSubmissionDetails(null);
              if (isMobile) setIsMobileSidebarOpen(false);
            }}
            title="Applicant Submissions"
            className={`flex items-center gap-3 w-full p-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'submissions'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Users className="h-5 w-5 shrink-0" />
            {(!isSidebarCollapsed || isMobile) && <span className="truncate">Applicant Submissions</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('assessments');
              setSelectedAssessment(null);
              if (isMobile) setIsMobileSidebarOpen(false);
            }}
            title="Manage Assessments"
            className={`flex items-center gap-3 w-full p-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'assessments'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <ClipboardList className="h-5 w-5 shrink-0" />
            {(!isSidebarCollapsed || isMobile) && <span className="truncate">Manage Assessments</span>}
          </button>

          <button
            onClick={() => {
              setActiveTab('roles');
              setSelectedRoleId(null);
              setIsCreatingRole(false);
              setEditingRoleId(null);
              if (isMobile) setIsMobileSidebarOpen(false);
            }}
            title="Roles & Question Sets"
            className={`flex items-center gap-3 w-full p-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Shield className="h-5 w-5 shrink-0" />
            {(!isSidebarCollapsed || isMobile) && <span className="truncate">Roles & Question Sets</span>}
          </button>
        </div>

        {/* Footer / Profile */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/80">
          {(!isSidebarCollapsed || isMobile) ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-slate-900/40 p-2 rounded-xl border border-slate-900/50">
                <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                  {adminUser.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{adminUser.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{adminUser.email}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="flex items-center gap-2.5 w-full p-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-rose-950/20 hover:text-rose-400 transition-all cursor-pointer"
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div 
                className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs uppercase cursor-help"
                title={`${adminUser.name} (${adminUser.email})`}
              >
                {adminUser.name.charAt(0)}
              </div>
              <button
                onClick={onLogout}
                title="Logout"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-rose-950/20 hover:text-rose-400 transition-all cursor-pointer"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Desktop Collapse Button */}
        {!isMobile && (
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex items-center justify-center p-3 text-slate-400 hover:text-white hover:bg-slate-900 border-t border-slate-900/50 transition-colors cursor-pointer"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </div>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row" id="admin-portal">
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:block h-screen sticky top-0 shrink-0 transition-all duration-300 z-30 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`} id="desktop-sidebar">
        {renderSidebarContent(false)}
      </aside>

      {/* Sidebar - Mobile Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex" id="mobile-sidebar-overlay">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsMobileSidebarOpen(false)} 
          />
          {/* Sidebar panel */}
          <aside className="relative w-64 h-full z-10 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200" id="mobile-sidebar-panel">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {submissionPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" id="delete-submission-modal">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={closeDeleteSubmissionModal}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete applicant submission?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Are you sure you want to delete this applicant submission? This will delete answers, recordings, reviews, and assessment attempt data.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteApplicantAccount}
                onChange={(e) => setDeleteApplicantAccount(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
              />
              <span>
                <span className="block text-xs font-bold text-gray-800">Delete applicant account also</span>
                <span className="block text-xs text-gray-500">Default is off. Leave unchecked to delete only this submission attempt.</span>
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeDeleteSubmissionModal}
                disabled={deletingSubmission}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmission}
                disabled={deletingSubmission}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer"
              >
                {deletingSubmission ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace (Right Panel) */}
      <div className="flex-1 flex flex-col min-w-0" id="admin-main-container">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200/80 h-16 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20" id="admin-header">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 md:hidden transition-colors cursor-pointer"
              title="Open Navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest font-mono">HR ADMIN</span>
                <span className="text-gray-300 text-xs">•</span>
                <span className="text-xs font-semibold text-gray-500">
                  {activeTab === 'submissions' && 'Applicant Submissions'}
                  {activeTab === 'assessments' && 'Manage Assessments'}
                  {activeTab === 'roles' && 'Roles & Question Sets'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-800">{adminUser.name}</p>
              <p className="text-[10px] text-gray-400 font-semibold">{adminUser.email}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
              {adminUser.name.charAt(0)}
            </div>
          </div>
        </header>

        {/* Viewport content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto max-w-7xl w-full mx-auto" id="admin-viewport">
          
          {/* ==========================================
              TAB 1: SUBMISSIONS & REVIEW
             ========================================== */}
          {activeTab === 'submissions' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="submissions-tab">
              {/* Left Submissions List */}
              <div className={`${selectedSubmissionId ? 'lg:col-span-4' : 'lg:col-span-12'} bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4`} id="submissions-list-container">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-3">
                  <h2 className="text-lg font-bold text-gray-900">Applicants</h2>
                  <div className="flex items-center gap-2">
                    <select
                      value={filterRoleId}
                      onChange={(e) => setFilterRoleId(e.target.value)}
                      className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      id="submissions-role-filter"
                    >
                      <option value="">All Roles / Positions</option>
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>{r.role_name}</option>
                      ))}
                    </select>
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      {submissions.filter(sub => !filterRoleId || sub.applicant?.applied_role_id === filterRoleId || sub.applicant?.appliedRoleId === filterRoleId).length} total
                    </span>
                  </div>
                </div>

                <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1" id="submissions-scroll">
                  {submissions.filter(sub => !filterRoleId || sub.applicant?.applied_role_id === filterRoleId || sub.applicant?.appliedRoleId === filterRoleId).length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <Users className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">No submissions recorded under this role.</p>
                      <p className="text-xs">Once an applicant finishes an assessment, they will appear here.</p>
                    </div>
                  ) : (
                    submissions.filter(sub => !filterRoleId || sub.applicant?.applied_role_id === filterRoleId || sub.applicant?.appliedRoleId === filterRoleId).map((sub) => {
                      const isSelected = selectedSubmissionId === sub.applicantAssessmentId;
                      const statusDisplay = getSubmissionStatusDisplay(sub);
                      return (
                        <div
                          key={sub.applicantAssessmentId}
                          onClick={() => fetchSubmissionDetails(sub.applicantAssessmentId)}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-indigo-50 border-indigo-200 font-medium' 
                              : 'bg-white hover:bg-gray-50 border-gray-100'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1.5">
                            <div>
                              <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                {sub.applicant?.name || 'Anonymous Applicant'}
                              </h3>
                              {sub.applicant?.role_name && (
                                <p className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wide mt-0.5">
                                  {sub.applicant.role_name}
                                </p>
                              )}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusDisplay.className}`}>
                              Status: {statusDisplay.label}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-gray-500 mb-2 truncate">
                            {sub.assessment?.title || 'Unknown Assessment'}
                          </p>

                          <p className="text-[11px] font-semibold text-gray-500 mb-2">
                            {statusDisplay.detail}
                          </p>

                          <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 text-[11px] font-medium text-gray-400">
                            <span className="flex items-center gap-1">
                              <Video className="h-3 w-3 text-gray-400" />
                              {sub.recording ? 'Recording OK' : 'No screen record'}
                            </span>
                            <span className={`flex items-center gap-0.5 font-semibold ${sub.review ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {sub.review ? `Graded: ${sub.review.score} pts` : 'Pending review'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Submission Evaluation Details */}
              {selectedSubmissionId && submissionDetails && (
                <div className="lg:col-span-8 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]" id="submission-detail-pane">
                  {/* Detail Title */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-xl font-bold text-gray-900">{submissionDetails.applicant?.name}</h2>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-mono">{submissionDetails.applicant?.email}</span>
                      </div>
                      <p className="text-sm font-semibold text-indigo-600">
                        {submissionDetails.assessment?.title} ({submissionDetails.assessment?.timeLimitMinutes} mins timer)
                      </p>
                      {submissionDetails.status === 'RETAKE_ALLOWED' && (
                        <p className="text-xs font-semibold text-violet-700 mt-1">
                          Status: Retake. Previous answers and recording are retained as reset history.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <button
                        onClick={handleResetSubmission}
                        className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reset to Retake
                      </button>
                      <button
                        onClick={() => openDeleteSubmissionModal(submissionDetails)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Video Player */}
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Video className="h-4.5 w-4.5 text-indigo-600" />
                      Applicant Screen Recording Capture
                    </h3>
                    
                    {submissionDetails.recording ? (
                      <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video border border-slate-800 flex flex-col justify-between" id="video-wrapper">
                        <video
                          ref={videoRef}
                          src={recordingSignedUrl ?? undefined}
                          controls
                          className="w-full h-full object-contain bg-black"
                          onLoadedMetadata={() => {
                            if (videoRef.current) {
                              videoRef.current.playbackRate = playbackRate;
                            }
                          }}
                          {...({ referrerPolicy: "strict-origin" } as any)}
                        />

                        {(recordingUrlLoading || recordingUrlError) && (
                          <div className="bg-slate-950 border-t border-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
                            {recordingUrlLoading ? 'Preparing secure recording link...' : recordingUrlError}
                          </div>
                        )}

                        {/* Custom control row (keeps native controls enabled) */}
                        <div className="bg-slate-950 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400 gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const v = videoRef.current;
                                if (!v) return;
                                const curr = Number(v.currentTime) || 0;
                                v.currentTime = Math.max(0, curr - 10);
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300"
                              aria-label="Back 10 seconds"
                            >
                              « Back 10s
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const v = videoRef.current;
                                if (!v) return;
                                const curr = Number(v.currentTime) || 0;
                                const dur = Number(v.duration);
                                if (isFinite(dur) && !Number.isNaN(dur)) {
                                  v.currentTime = Math.min(dur, curr + 10);
                                } else {
                                  v.currentTime = curr + 10;
                                }
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300"
                              aria-label="Forward 10 seconds"
                            >
                              Forward 10s »
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-slate-400 mr-1">Speed</label>
                            <select
                              value={playbackRate}
                              onChange={(e) => {
                                const v = videoRef.current;
                                const rate = Number(e.target.value) || 1;
                                setPlaybackRate(rate);
                                if (v) {
                                  v.playbackRate = rate;
                                }
                              }}
                              className="bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded text-xs"
                              aria-label="Playback speed"
                            >
                              <option value={0.5}>0.5x</option>
                              <option value={1}>1x</option>
                              <option value={1.5}>1.5x</option>
                              <option value={2}>2x</option>
                            </select>
                          </div>
                        </div>

                        <div className="bg-slate-950 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
                          <span>File: {submissionDetails.recording.file_name}</span>
                          <span>Duration: {Math.floor(submissionDetails.recording.duration / 60)}m {submissionDetails.recording.duration % 60}s</span>
                        </div>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50 text-gray-400">
                        <Video className="h-10 w-10 mx-auto text-gray-300 mb-2 animate-pulse" />
                        <p className="text-sm font-semibold">No screen recording submitted</p>
                        <p className="text-xs">Either recording was interrupted or applicant exited early.</p>
                      </div>
                    )}
                  </div>

                  {/* Answers & Assessment Details */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <FileText className="h-4.5 w-4.5 text-indigo-600" />
                      Evaluation Responses ({submissionDetails.questions.length} questions)
                    </h3>

                    <div className="space-y-5" id="assessment-qa-list">
                      {submissionDetails.questions.map((q: any, idx: number) => (
                        <div key={q.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
                          <div className="flex justify-between items-start gap-4">
                            <span className="font-bold text-xs text-gray-400 font-mono">Q{idx + 1} ({q.points} pts)</span>
                            <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">{q.question_type}</span>
                          </div>
                          
                          <div 
                            className="text-sm font-medium text-gray-800 rich-text-content" 
                            dangerouslySetInnerHTML={{ __html: getSafeFormattedHtml(q.question_text) }} 
                          />

                          {q.question_type === 'MULTIPLE_CHOICE' && q.options && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium text-gray-600 pl-2">
                              {q.options.map((opt: string, oIdx: number) => (
                                <div key={oIdx} className={`p-2 rounded-lg border ${q.answer === opt ? 'bg-blue-50 border-blue-200 font-semibold text-blue-700' : 'bg-white border-gray-100'}`}>
                                  {opt} {q.answer === opt && '✓ (Selected)'}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="pt-2 border-t border-gray-200">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Applicant Answer:</p>
                            {q.answer ? (
                              <pre className={`p-3 rounded-lg text-sm text-gray-800 leading-relaxed overflow-x-auto ${q.question_type === 'CODE' ? 'font-mono bg-slate-900 text-slate-100 text-xs' : 'bg-white font-sans whitespace-pre-wrap'}`}>
                                {q.answer}
                              </pre>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No answer submitted for this question.</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Evaluation Assistant Module */}
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-4" id="ai-grading-panel">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-indigo-600 animate-pulse" />
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm leading-tight">Gemini AI Assessor Assistant</h4>
                          <p className="text-xs text-gray-500 font-medium">Auto-evaluate text and code answers with expert recommendation</p>
                        </div>
                      </div>
                      <button
                        onClick={handleAIGradingAssist}
                        disabled={aiGradingLoading}
                        className="flex items-center justify-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-all cursor-pointer disabled:bg-indigo-400"
                      >
                        {aiGradingLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Evaluating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Generate AI Review
                          </>
                        )}
                      </button>
                    </div>

                    {aiGradingResult && (
                      <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-4" id="ai-evaluation-results">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">AI Grading Suggestion</span>
                          <span className="text-sm font-bold text-gray-900 font-mono bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">
                            Suggested Score: <span className="text-indigo-600">{aiGradingResult.suggested_score}</span> / {aiGradingResult.total_possible_points} pts
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Overall AI Recommendation:</p>
                          <p className="text-sm text-gray-700 leading-relaxed font-medium bg-indigo-50/25 p-3 rounded-lg border border-indigo-50">
                            {aiGradingResult.overall_remarks}
                          </p>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Individual Answer Breakdowns:</p>
                          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                            {aiGradingResult.graded_questions.map((gQ: any, gIdx: number) => (
                              <div key={gIdx} className="p-3 bg-slate-50 rounded-lg text-xs border border-gray-100">
                                <div className="flex justify-between items-center mb-1 font-semibold text-gray-800">
                                  <span className="truncate max-w-xs" title={stripHtmlTags(gQ.question_text)}>
                                    {stripHtmlTags(gQ.question_text)}
                                  </span>
                                  <span className="font-mono bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                    {gQ.score_assigned} pts
                                  </span>
                                </div>
                                <p className="text-gray-500 leading-relaxed">{gQ.feedback_comment}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={applyAIGrading}
                          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Use AI Score & Remarks Recommendation
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Score & Review Input Section */}
                  <form onSubmit={handleSaveReview} className="p-5 border border-gray-100 bg-gray-50/50 rounded-2xl space-y-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Award className="h-4.5 w-4.5 text-indigo-600" />
                      Save Grade & Evaluation
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Assigned Score (pts)</label>
                        <input
                          type="number"
                          required
                          value={reviewScore}
                          onChange={(e) => setReviewScore(Number(e.target.value))}
                          className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold font-mono"
                          min="0"
                        />
                      </div>
                      
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Reviewer Status</label>
                        <div className="flex items-center h-11 text-xs font-semibold text-gray-500 pl-1">
                          {submissionDetails.review ? (
                            <span className="flex items-center gap-1.5 text-emerald-600">
                              <Check className="h-4 w-4" /> Evaluated & Saved
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-500">
                              <AlertTriangle className="h-4 w-4" /> Pending Scoring
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Assessor Remarks / Feedback</label>
                      <textarea
                        required
                        value={reviewRemarks}
                        onChange={(e) => setReviewRemarks(e.target.value)}
                        className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-24 leading-relaxed font-medium"
                        placeholder="Provide formal, constructive feedback on technical correctness, explanation depth, and accuracy..."
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingReview}
                      className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs transition-colors disabled:bg-indigo-400 cursor-pointer"
                    >
                      {savingReview ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Assessment Review
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              TAB 2: MANAGE ASSESSMENTS
             ========================================== */}
          {activeTab === 'assessments' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="assessments-tab">
              {/* Assessments List */}
              <div className="lg:col-span-5 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4" id="assessments-list-pane">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Assessments</h2>
                  <button
                    onClick={() => { setIsCreatingAssessment(true); setSelectedAssessment(null); }}
                    className="flex items-center gap-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> Create
                  </button>
                </div>

                {isCreatingAssessment ? (
                  <form onSubmit={handleSaveAssessment} className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-4" id="create-assessment-form">
                    <h3 className="text-sm font-bold text-gray-800">New Assessment</h3>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Assessment Title</label>
                      <input
                        type="text"
                        required
                        value={newAssessmentTitle}
                        onChange={(e) => setNewAssessmentTitle(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                        placeholder="e.g. LLM Engineering Competency"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Duration (minutes)</label>
                      <input
                        type="number"
                        required
                        value={newAssessmentTime}
                        onChange={(e) => setNewAssessmentTime(Number(e.target.value))}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                        min="1"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Candidate Instructions</label>
                      <textarea
                        value={newAssessmentInstructions}
                        onChange={(e) => setNewAssessmentInstructions(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs min-h-20"
                        placeholder="Instructions displayed to applicants before screen sharing is initialized..."
                      />
                    </div>                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Target Candidate Role</label>
                      <select
                        value={newAssessmentRoleId}
                        onChange={(e) => setNewAssessmentRoleId(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white cursor-pointer"
                        required
                      >
                        <option value="">Select Target Role / Position...</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.role_name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Publish Status</label>
                      <select
                        value={newAssessmentStatus}
                        onChange={(e: any) => setNewAssessmentStatus(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white cursor-pointer"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="ACTIVE">Active (Publish)</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 text-xs font-semibold pt-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingAssessment(false)}
                        className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3" id="assessments-list-scroll">
                    {assessments.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-6">No assessments configured.</p>
                    ) : (
                      assessments.map((a) => (
                        <div
                          key={a.id}
                          onClick={() => { fetchAssessmentDetails(a.id); setIsCreatingAssessment(false); }}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                            selectedAssessment?.id === a.id 
                              ? 'bg-indigo-50 border-indigo-200' 
                              : 'bg-white hover:bg-gray-50 border-gray-100'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{a.title}</h3>
                              {a.role_name && (
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 px-2 py-0.5 rounded-md mt-1 inline-block">
                                  Role: {a.role_name}
                                </span>
                              )}
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              a.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {a.status}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-500 font-medium mt-3">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-gray-400" />
                              {a.time_limit_minutes} mins
                            </span>
                            <span>{a.questionsCount || 0} questions</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Assessment Questions detail list */}
              <div className="lg:col-span-7 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5" id="questions-list-pane">
                {selectedAssessment ? (
                  <div className="space-y-6" id="questions-detail-container">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">{selectedAssessment.title}</h2>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md">
                            Role: {selectedAssessment.role_name || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center self-start sm:self-center">
                        <select
                          value={selectedAssessment.role_id || ''}
                          onChange={async (e) => {
                            const newRoleId = e.target.value;
                            try {
                              const data: any = await apiRequest(`/api/admin/assessments/${selectedAssessment.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ role_id: newRoleId || null })
                              });
                              if (data.success) {
                                showStatus('success', 'Role assignment updated successfully.');
                                fetchAssessments();
                                fetchAssessmentDetails(selectedAssessment.id);
                              }
                            } catch (err) {
                              showStatus('error', 'Failed to update role assignment');
                            }
                          }}
                          className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-semibold text-gray-700 cursor-pointer"
                        >
                          <option value="">Unassigned Role</option>
                          {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.role_name}</option>
                          ))}
                        </select>

                        <button
                          onClick={() => handleUpdateAssessmentStatus(selectedAssessment.id, selectedAssessment.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE')}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer ${
                            selectedAssessment.status === 'ACTIVE' 
                              ? 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100' 
                              : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {selectedAssessment.status === 'ACTIVE' ? 'Make Draft' : 'Publish Active'}
                        </button>
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-100 animate-pulse">Confirm delete?</span>
                            <button
                              onClick={() => handleDeleteAssessment(selectedAssessment.id)}
                              className="text-xs font-bold px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer"
                            >
                              Yes, Delete
                            </button>
                            <button
                              onClick={() => setIsConfirmingDelete(false)}
                              className="text-xs font-semibold px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsConfirmingDelete(true)}
                            className="text-xs font-semibold px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-100 cursor-pointer"
                          >
                            Delete Assessment
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Time Limit (minutes)</label>
                          <input
                            type="number"
                            min="1"
                            value={assessmentDuration}
                            onChange={(e) => setAssessmentDuration(Number(e.target.value))}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveAssessmentDuration}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Save Duration
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">Randomized Question Assignment</h3>
                          <p className="text-xs text-gray-500 font-medium">Set how many questions applicants receive from each difficulty.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveQuestionConfig}
                          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Save Settings
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Easy</label>
                          <input type="number" value={easyCount} onChange={(e) => setEasyCount(Number(e.target.value))} className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono" min="0" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Medium</label>
                          <input type="number" value={mediumCount} onChange={(e) => setMediumCount(Number(e.target.value))} className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono" min="0" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Hard</label>
                          <input type="number" value={hardCount} onChange={(e) => setHardCount(Number(e.target.value))} className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono" min="0" />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <input type="checkbox" checked={randomizeOrder} onChange={(e) => setRandomizeOrder(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                        Shuffle selected question order for each attempt
                      </label>
                    </div>

                    {/* Question Addition Form */}
                    {isAddingQuestion ? (
                      <form onSubmit={handleSaveQuestion} className="p-5 border border-indigo-100 bg-indigo-50/20 rounded-2xl space-y-4">
                        <h3 className="text-sm font-bold text-gray-800">{editingQuestionId ? 'Modify Question' : 'Add Question'}</h3>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Question Type</label>
                          <select
                            value={questionType}
                            onChange={(e: any) => setQuestionType(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                          >
                            <option value="TEXT">Short Answer / Essay</option>
                            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                            <option value="CODE">Coding Task</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Question Text</label>
                          <RichTextEditor
                            value={questionText}
                            onChange={setQuestionText}
                            placeholder="Write clearly. Specify exact expectations, background scenarios, and tasks..."
                          />
                        </div>

                        {questionType === 'MULTIPLE_CHOICE' && (
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Options (Exactly 4)</label>
                            {questionOptions.map((opt, optIdx) => (
                              <input
                                key={optIdx}
                                type="text"
                                required
                                value={opt}
                                onChange={(e) => {
                                  const updated = [...questionOptions];
                                  updated[optIdx] = e.target.value;
                                  setQuestionOptions(updated);
                                }}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                                placeholder={`Option ${optIdx + 1}`}
                              />
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Weight points</label>
                            <input
                              type="number"
                              required
                              value={questionPoints}
                              onChange={(e) => setQuestionPoints(Number(e.target.value))}
                              className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono"
                              min="1"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Difficulty</label>
                            <select
                              value={questionDifficulty}
                              onChange={(e: any) => setQuestionDifficulty(e.target.value)}
                              className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                            >
                              <option value="EASY">Easy</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HARD">Hard</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Display order</label>
                            <input
                              type="number"
                              required
                              value={questionOrder}
                              onChange={(e) => setQuestionOrder(Number(e.target.value))}
                              className="block w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono"
                              min="1"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 text-xs font-semibold pt-2">
                          <button
                            type="button"
                            onClick={resetQuestionForm}
                            className="px-3.5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
                          >
                            {editingQuestionId ? 'Apply Changes' : 'Add Question'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => { resetQuestionForm(); setIsAddingQuestion(true); }}
                          className="flex-1 flex items-center justify-center gap-1.5 p-3.5 border border-dashed border-gray-300 hover:bg-gray-50 rounded-2xl text-xs font-semibold text-gray-600 cursor-pointer"
                        >
                          <Plus className="h-4.5 w-4.5 text-gray-400" /> Add Custom Question
                        </button>
                        
                        <button
                          onClick={() => setShowAIGenModal(true)}
                          className="flex-1 flex items-center justify-center gap-1.5 p-3.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-2xl text-xs font-semibold cursor-pointer"
                        >
                          <Sparkles className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
                          AI Auto-Generate Questions
                        </button>
                      </div>
                    )}

                    {/* Questions Listing */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Configured Questions</h3>
                      {selectedAssessment.questions?.length === 0 ? (
                        <p className="text-center text-xs text-gray-400 py-6">No questions. Add custom questions or use Gemini AI creator.</p>
                      ) : (
                        selectedAssessment.questions?.map((q: Question, idx: number) => (
                          <div key={q.id} className="p-4 border border-gray-100 hover:border-gray-200 bg-gray-50/20 rounded-2xl flex justify-between gap-4 items-start">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-gray-400">#{q.orderNumber || (q as any).order_number}</span>
                                <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                  {q.questionType || (q as any).question_type}
                                </span>
                                <span className="text-[9px] bg-gray-100 text-gray-600 border border-gray-200 font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                  {(q as any).difficulty || 'MEDIUM'}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium">{q.points} pts</span>
                              </div>
                              <div 
                                className="text-sm font-medium text-gray-800 rich-text-content" 
                                dangerouslySetInnerHTML={{ __html: getSafeFormattedHtml(q.questionText || (q as any).question_text) }} 
                              />
                              
                              {((q as any).options || q.options) && (
                                <ul className="list-disc pl-5 text-xs text-gray-500 font-medium space-y-0.5">
                                  {((q as any).options || q.options).map((opt: string, oIdx: number) => (
                                    <li key={oIdx}>{opt}</li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleEditQuestion(q)}
                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-24 text-gray-400">
                    <ClipboardList className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm font-medium">No assessment selected.</p>
                    <p className="text-xs">Choose or create an assessment from the left panel to configure it.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==========================================
              TAB 3: ROLES & QUESTION GROUPS
             ========================================== */}
          {activeTab === 'roles' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200" id="roles-tab">
              {/* Left Column: Role Configuration & List */}
              <div className="lg:col-span-5 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-5" id="roles-config-panel">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h2 className="text-lg font-bold text-gray-900">Positions</h2>
                  <button
                    onClick={() => {
                      setIsCreatingRole(!isCreatingRole);
                      setEditingRoleId(null);
                      setRoleName('');
                      setRoleDescription('');
                      setRoleStatus('ACTIVE');
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> {isCreatingRole && !editingRoleId ? 'Hide Form' : 'Create Role'}
                  </button>
                </div>

                {isCreatingRole && (
                  <form onSubmit={handleSaveRole} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-200" id="role-upsert-form">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {editingRoleId ? 'Modify Existing Role' : 'Define New Position'}
                    </h3>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Role / Position Name</label>
                      <input
                        type="text"
                        required
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        placeholder="e.g. ESL Teacher"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                      <textarea
                        value={roleDescription}
                        onChange={(e) => setRoleDescription(e.target.value)}
                        className="block w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs min-h-16 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        placeholder="Define responsibilities and required background for applicants of this role..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Role Status</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="roleStatus"
                            value="ACTIVE"
                            checked={roleStatus === 'ACTIVE'}
                            onChange={() => setRoleStatus('ACTIVE')}
                            className="text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          Active
                        </label>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="roleStatus"
                            value="INACTIVE"
                            checked={roleStatus === 'INACTIVE'}
                            onChange={() => setRoleStatus('INACTIVE')}
                            className="text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          Deactivated
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => { setIsCreatingRole(false); setEditingRoleId(null); }}
                        className="px-3.5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
                      >
                        Save Role
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1" id="roles-list-scroll">
                  {roles.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-12 font-medium">No roles created yet.</p>
                  ) : (
                    roles.map((r) => {
                      const isSelected = selectedRoleId === r.id;
                      const roleAssessments = assessments.filter(a => a.role_id === r.id);
                      return (
                        <div
                          key={r.id}
                          onClick={() => { setSelectedRoleId(r.id); }}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-indigo-50 border-indigo-200 font-medium shadow-sm' 
                              : 'bg-white hover:bg-gray-50 border-gray-100'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1.5">
                            <div>
                              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{r.role_name}</h3>
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed font-medium">{r.description || 'No description provided.'}</p>
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              r.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>
                              {r.status}
                            </span>
                          </div>

                          <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-2 text-[10px] text-gray-400 font-bold">
                            <span className="text-indigo-600 bg-indigo-50/50 px-2 py-0.5 rounded-md">
                              {roleAssessments.length} {roleAssessments.length === 1 ? 'Assessment' : 'Assessments'}
                            </span>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditRole(r); }}
                                className="px-2 py-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 border border-gray-200 rounded-md transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.id); }}
                                className="px-2 py-1 text-gray-500 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 rounded-md transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Question Set and Assessment Viewer */}
              <div className="lg:col-span-7 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5 animate-in fade-in slide-in-from-right-2 duration-200" id="role-questions-grouping-pane">
                {selectedRoleId ? (() => {
                  const currentRole = roles.find(r => r.id === selectedRoleId);
                  const roleAssessments = assessments.filter(a => a.role_id === selectedRoleId);

                  return (
                    <div className="space-y-6">
                      <div className="border-b border-gray-100 pb-4">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
                          <Shield className="h-5 w-5 text-indigo-600" />
                          Dedicated Questions: {currentRole?.role_name}
                        </h2>
                        <p className="text-xs text-gray-500 font-medium leading-relaxed mt-1">
                          Below are all assessments and complete sets of evaluation questions specifically assigned for the <span className="font-semibold text-gray-700">{currentRole?.role_name}</span> position.
                        </p>
                      </div>

                      <div className="space-y-6 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
                        {roleAssessments.length === 0 ? (
                          <div className="text-center py-16 text-gray-400 space-y-3">
                            <ClipboardList className="h-12 w-12 mx-auto text-gray-300" />
                            <p className="text-sm font-medium">No Assessments assigned to this position yet.</p>
                            <p className="text-xs max-w-sm mx-auto">
                              Assessments contain the structured testing questions. Assign or create a new assessment to begin formulating evaluation questions.
                            </p>
                            <button
                              onClick={() => {
                                setNewAssessmentRoleId(selectedRoleId);
                                setIsCreatingAssessment(true);
                                setActiveTab('assessments');
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
                            >
                              <Plus className="h-4 w-4" /> Define First Assessment
                            </button>
                          </div>
                        ) : (
                          roleAssessments.map(asmt => (
                            <div key={asmt.id} className="border border-gray-100 bg-gray-50/10 rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition-all">
                              <div className="flex justify-between items-center pb-2.5 border-b border-gray-100">
                                <div>
                                  <h3 className="font-bold text-gray-800 text-sm">{asmt.title}</h3>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-semibold">
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" /> {asmt.time_limit_minutes} mins
                                    </span>
                                    <span>•</span>
                                    <span>{asmt.questionsCount || 0} questions configured</span>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      fetchAssessmentDetails(asmt.id);
                                      setActiveTab('assessments');
                                    }}
                                    className="text-[10px] font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors"
                                  >
                                    Manage Questions
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-3">
                                {(!asmt.questions || asmt.questions.length === 0) ? (
                                  <p className="text-xs text-gray-400 py-3 text-center">No questions added yet. Use the manage button to define evaluation items.</p>
                                ) : (
                                  asmt.questions.map((q: any) => (
                                    <div key={q.id} className="p-3 bg-white border border-gray-100 rounded-xl space-y-1">
                                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                        <span>#{q.order_number || q.orderNumber || 1}</span>
                                        <span>•</span>
                                        <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{q.question_type || q.questionType}</span>
                                        <span>•</span>
                                        <span>{q.points} pts</span>
                                      </div>
                                      <div 
                                        className="text-xs font-medium text-gray-700 leading-normal rich-text-content"
                                        dangerouslySetInnerHTML={{ __html: getSafeFormattedHtml(q.question_text || q.questionText) }}
                                      />
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="text-center py-24 text-gray-400">
                    <Shield className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm font-medium">No role selected.</p>
                    <p className="text-xs">Choose a role from the left panel to review its assessments and complete sets of questions.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Floating Toast Notification */}
      {statusMessage && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl border shadow-xl flex gap-3 items-start max-w-sm bg-white animate-in slide-in-from-bottom duration-200 ${
          statusMessage.type === 'success' ? 'border-emerald-100 text-emerald-900 bg-emerald-50/90 backdrop-blur-md shadow-emerald-100/50' : 'border-rose-100 text-rose-900 bg-rose-50/90 backdrop-blur-md shadow-rose-100/50'
        }`} id="toast-notification">
          {statusMessage.type === 'success' ? (
            <div className="p-1.5 bg-emerald-500 text-white rounded-lg">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          ) : (
            <div className="p-1.5 bg-rose-500 text-white rounded-lg">
              <AlertTriangle className="h-4 w-4" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs font-bold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
            <p className="text-[11px] font-medium text-gray-600 mt-0.5">{statusMessage.text}</p>
          </div>
        </div>
      )}

      {/* Gemini Questions Generator Modal */}
      {showAIGenModal && selectedAssessment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2.5 mb-3">
              <Sparkles className="h-6 w-6 text-indigo-600 animate-bounce" />
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">Gemini AI Question Creator</h3>
                <p className="text-xs text-gray-500 font-medium">Automatic multi-type generation using Google Gemini</p>
              </div>
            </div>

            <form onSubmit={handleAIGenerateQuestions} className="space-y-4 pt-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Assessment Topic / Tech Stack</label>
                <input
                  type="text"
                  required
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="e.g. React Hooks, Docker Basics, Prompt Engineering"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Number of Questions</label>
                <input
                  type="number"
                  required
                  value={aiNumQuestions}
                  onChange={(e) => setAiNumQuestions(Number(e.target.value))}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                  min="1"
                  max="10"
                />
              </div>

              <div className="flex justify-end gap-2 text-xs font-semibold pt-4 border-t border-gray-100">
                <button
                  type="button"
                  disabled={aiGenerating}
                  onClick={() => setShowAIGenModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={aiGenerating || !aiTopic.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex items-center gap-1.5 cursor-pointer disabled:bg-indigo-400"
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate and Save
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
