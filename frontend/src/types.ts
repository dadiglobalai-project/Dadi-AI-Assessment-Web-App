/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'ADMIN' | 'APPLICANT';

export interface Role {
  id: string;
  role_name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  applied_role_id?: string;
  appliedRoleId?: string;
  role_name?: string;
  createdAt: string;
}

export type QuestionType = 'TEXT' | 'MULTIPLE_CHOICE' | 'CODE';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Question {
  id: string;
  assessmentId: string;
  role_id?: string;
  roleId?: string;
  questionText: string;
  questionType: QuestionType;
  difficulty?: QuestionDifficulty;
  options?: string[]; // Used if MULTIPLE_CHOICE
  points: number;
  orderNumber: number;
  createdAt: string;
}

export type AssessmentStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

export interface Assessment {
  id: string;
  role_id?: string;
  roleId?: string;
  title: string;
  instructions: string;
  timeLimitMinutes: number;
  status: AssessmentStatus;
  createdBy: string;
  createdAt: string;
  questions?: Question[];
}

export type ApplicantAssessmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'RETAKE_ALLOWED';

export interface ApplicantAssessment {
  id: string;
  applicantId: string;
  assessmentId: string;
  status: ApplicantAssessmentStatus;
  startTime?: string;
  endTime?: string;
  submittedAt?: string;
}

export interface Answer {
  id: string;
  applicantAssessmentId: string;
  questionId: string;
  answerText: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recording {
  id: string;
  applicantAssessmentId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  duration: number; // in seconds
  uploadedAt: string;
}

export type ReviewStatus = 'PENDING' | 'REVIEWED';

export interface Review {
  id: string;
  applicantAssessmentId: string;
  score: number;
  remarks: string;
  status: ReviewStatus;
  reviewedBy: string;
  reviewedAt: string;
}

// Composite type for Admin viewing submissions
export interface SubmissionSummary {
  applicantAssessmentId: string;
  applicant: User;
  assessment: Assessment;
  status: ApplicantAssessmentStatus;
  startTime?: string;
  submittedAt?: string;
  recording?: Recording;
  review?: Review;
  answersCount: number;
}
