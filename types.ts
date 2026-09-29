
// --- SHARED CORE TYPES ---

export enum UserRole {
  ADMIN = 'ADMIN',
  CREW = 'CREW'
}

export interface CurrentUser {
  role: UserRole;
  uid: string;
  // Present only when the tenant-aware session path is enabled. Keeping this
  // optional lets the existing production records continue working during the
  // additive migration.
  tenantId?: string;
  membershipId?: string;
  name?: string;
  outletId?: string;
  // Specific role from the Crew table (e.g. "Manager", "HR") used for Admin Matrix checks
  accessRole?: string; 
  // The Firestore Document ID (required because Auth UID might differ from legacy Crew Doc ID)
  dbId?: string;
}

export type TenantPersonType = 'CREW' | 'MANAGER' | 'OWNER' | 'ADMINISTRATOR';

export interface TenantMembership {
  id?: string;
  tenantId: string;
  uid: string;
  personId: string;
  personType: TenantPersonType;
  role?: string;
  outletIds: string[];
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface TenantContext {
  tenantId: string;
  membershipId: string;
  personId: string;
  personType: TenantPersonType;
  role?: string;
  outletIds: string[];
}

export interface AppConfig {
  timezone: string;
  currencySymbol?: string;
}

export interface Store {
  id?: string;
  tenantId?: string;
  outletId: string;
  name: string;
  address?: string;
  fassaiNumber?: string;
  gstNumber?: string;
  fassaiCertUrl?: string;
  gstCertUrl?: string;
  isActive: boolean;
}

// --- MODULE: DAILY MANAGER OVERVIEW ---
export interface ManagerAction {
  id?: string;
  title: string;
  details?: string;
  outletId: string | 'ALL';
  priority: 'HIGH' | 'NORMAL';
  status: 'OPEN' | 'COMPLETED';
  createdAt: any;
  createdBy: string;
  createdByName: string;
  actionNote?: string;
  actionUpdatedAt?: any;
  actionUpdatedBy?: string;
  actionUpdatedByName?: string;
  completedAt?: any;
  completedBy?: string;
  completedByName?: string;
}

// --- MODULE: ACCESS CONTROL ---
export const MODULE_IDS = {
  // Admin Dashboard Modules
  TASKS: 'TASKS',
  ACCURACY: 'ACCURACY',
  EMPLOYEE: 'EMPLOYEE',
  STORES: 'STORES',
  ATTENDANCE: 'ATTENDANCE',
  SHIFTS: 'SHIFTS',
  HR: 'HR',
  REPORTS: 'REPORTS',
  EOM: 'EOM',
  RECIPE: 'RECIPE',
  LOGIN_ACTIVITY: 'LOGIN_ACTIVITY',
  TRAINING: 'TRAINING',
  SETTINGS: 'SETTINGS',

  // Crew App Features
  CREW_ORDERS: 'CREW_ORDERS',
  CREW_TASKS: 'CREW_TASKS',
  CREW_SHIFTS: 'CREW_SHIFTS',
  CREW_EOM: 'CREW_EOM',
  CREW_RECIPE: 'CREW_RECIPE',
  CREW_TRAINING: 'CREW_TRAINING'
} as const;

export type ModuleId = keyof typeof MODULE_IDS;

export interface AccessConfig {
  [key: string]: string[]; // ModuleID -> Array of Role Names
}

// --- MODULE: TRAINING ---
// Training is intentionally separate from daily tasks. A module records
// competence; a task records whether that competence was applied today.
export type TrainingTrack = 'CORE_STAFF' | 'BARISTA' | 'KITCHEN' | 'MANAGER';
export type TrainingModuleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type TrainingFormat = 'THEORETICAL' | 'PRACTICAL';
export type TrainingAssignmentStatus = 'ASSIGNED' | 'NOT_STARTED' | 'LEARNING' | 'COMPLETED' | 'DEMONSTRATION_COMPLETED' | 'PRACTISING_UNDER_SUPERVISION' | 'ASSESSMENT_PENDING' | 'PASSED' | 'CERTIFIED' | 'RETRAINING_REQUIRED' | 'EXPIRED';
export type TrainingEvidence = { name: string; storagePath?: string; url?: string; type?: 'IMAGE' | 'VIDEO' | 'FILE' };

export interface TrainingLesson {
  id: string;
  type: 'KNOWLEDGE' | 'DEMONSTRATION' | 'SUPERVISED_PRACTICE' | 'KNOWLEDGE_ASSESSMENT' | 'PRACTICAL_ASSESSMENT';
  title: string;
  content?: string;
  objectives?: string[];
  checklist?: string[];
  required?: boolean;
  media?: TrainingEvidence[];
}

export interface TrainingQuizQuestion {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'MULTIPLE_SELECT' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  prompt: string;
  options?: string[];
  required?: boolean;
}

// Stored in the restricted trainingAssessmentKeys collection, never inside a
// learner-readable module document.
export interface TrainingQuizAnswerKey { questionId: string; acceptedAnswers: string[]; }

export interface PracticalCriterion {
  id: string;
  name: string;
  instructions?: string;
  isCritical?: boolean;
  scored?: boolean;
  weight?: number;
}

export interface TrainingModule {
  id?: string;
  tenantId?: string;
  versionId?: string;
  title: string;
  description?: string;
  track: TrainingTrack;
  trainingFormat?: TrainingFormat;
  applicableRoles: string[];
  applicableOutletIds: string[];
  learningObjectives: string[];
  estimatedMinutes?: number;
  mandatory: boolean;
  ownerId?: string;
  ownerName?: string;
  instructions?: string;
  media?: TrainingEvidence[];
  safetyWarnings?: string[];
  relatedRecipeIds?: string[];
  relatedEquipment?: string[];
  relatedTaskIds?: string[];
  lessons: TrainingLesson[];
  requiredLessonOrder: boolean;
  requiredSupervisedAttempts: number;
  knowledgeTestRequired: boolean;
  practicalTestRequired: boolean;
  minimumPassingScore: number;
  quizQuestions?: TrainingQuizQuestion[];
  quizAttemptLimit?: number;
  practicalCriteria?: PracticalCriterion[];
  managerSignOffRequired: boolean;
  certificationValidityDays?: number;
  version: number;
  reviewDate?: string;
  status: TrainingModuleStatus;
  publishedAt?: any;
  archivedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string;
  changeSummary?: string;
  updateRequirement?: 'NONE' | 'ACKNOWLEDGEMENT' | 'KNOWLEDGE_RETEST' | 'FULL_REASSESSMENT';
}

export interface TrainingAssignment {
  id?: string;
  tenantId?: string;
  employeeId: string;
  employeeUid: string;
  employeeName: string;
  employeeRole?: string;
  outletId: string;
  moduleId: string;
  moduleVersionId: string;
  moduleTitle: string;
  track: TrainingTrack;
  trainingFormat?: TrainingFormat;
  mandatory: boolean;
  assignmentType: 'INITIAL' | 'REFRESHER';
  reason?: string;
  assignedBy: string;
  assignedByName?: string;
  assignedAt: any;
  dueDate?: string;
  status: TrainingAssignmentStatus;
  completedLessonIds: string[];
  acknowledgementAt?: any;
  demonstration?: TrainingDemonstration;
  supervisedAttempts: TrainingPracticeAttempt[];
  quizResults: TrainingQuizResult[];
  practicalAssessment?: TrainingPracticalAssessment;
  practicalAssessmentRequestedAt?: any;
  managerFeedback?: string;
  certifiedAt?: any;
  certificationId?: string;
  updatedAt?: any;
}

export interface TrainingDemonstration { trainerId: string; trainerName: string; occurredAt: any; checklist: string[]; employeeAcknowledgedAt?: any; notes?: string; evidence?: TrainingEvidence[]; }
export interface TrainingPracticeAttempt { id: string; trainerId: string; trainerName: string; occurredAt: any; outcome: 'MEETS_STANDARD' | 'NEEDS_IMPROVEMENT' | 'NOT_DEMONSTRATED'; notes?: string; evidence?: TrainingEvidence[]; }
export interface TrainingQuizResult { attempt: number; score: number; passed: boolean; submittedAt: any; }
export interface TrainingPracticalAssessment { assessorId: string; assessorName: string; assessedAt: any; score: number; result: 'PASSED' | 'RETRAINING_REQUIRED'; criticalFailure: boolean; criteria: Array<{ criterionId: string; outcome: 'MEETS_STANDARD' | 'NEEDS_IMPROVEMENT' | 'NOT_DEMONSTRATED' | 'CRITICAL_FAILURE' | 'NOT_APPLICABLE'; comment?: string; }>; managerComment?: string; evidence?: TrainingEvidence[]; }

export interface TrainingCertification { id?: string; tenantId?: string; assignmentId: string; employeeId: string; employeeUid: string; employeeName: string; outletId: string; role?: string; moduleId: string; moduleVersionId: string; moduleTitle: string; moduleVersion: number; assessmentResult: 'PASSED'; score?: number; criticalFailures: string[]; certifyingManagerId: string; certifyingManagerName: string; certificationDate: any; expiryDate?: any; evidence?: TrainingEvidence[]; managerNotes?: string; employeeAcknowledgedAt?: any; }
export interface TrainingAuditEvent { id?: string; tenantId?: string; actorId: string; actorName?: string; action: string; employeeId?: string; employeeName?: string; moduleId: string; moduleVersionId?: string; outletId?: string; previousStatus?: TrainingAssignmentStatus; newStatus?: TrainingAssignmentStatus; notes?: string; createdAt: any; }

export interface RoleDef {
  id?: string;
  name: string;
}

// --- MODULE: EMPLOYEES ---
export interface CrewDocument {
  id: string;
  name: string;
  type: 'OFFER_SIGNED' | 'ID_PROOF' | 'RESUME' | 'OTHER';
  // New documents keep only the private Storage path. url remains optional so
  // existing legacy records continue to be viewable during the migration.
  storagePath?: string;
  url?: string;
  uploadedAt: any;
}

export interface CrewMember {
  id?: string;
  tenantId?: string;
  authUid?: string; // LINK TO FIREBASE AUTH
  crewName: string;
  crewCode: string;
  email?: string;
  phoneNumber?: string;
  photoUrl?: string;
  outletId: string;
  isMobile?: boolean; 
  active: boolean;
  role?: string;
  gender?: 'Male' | 'Female' | 'Others';
  createdAt?: any;
  dateOfBirth?: string;
  birthMMDD?: string;     // "MM-DD" derived from dateOfBirth, for cheap birthday lookups
  dateOfJoining?: string; 
  dateOfLeaving?: string; 
  documents?: CrewDocument[];
  leaveBalanceOverride?: number;
  leaveBalanceOverrideDate?: string; // YYYY-MM-DD - The reset point for accrual
}

// Public-safe subset of CrewMember, mirrored into /crewDirectory (doc ID =
// crew doc ID) so crew-facing features (birthday banner, EOM nominees) can
// list coworkers without read access to /crew, which holds login codes and
// HR fields. Synced by employeeService on save/delete and self-healed when
// an admin opens the Employees tab.
export interface CrewDirectoryEntry {
  id?: string;
  crewName: string;
  role?: string | null;
  birthMMDD?: string | null;
  active?: boolean;
}

// --- MODULE: SHIFTS ---
export interface Shift {
  id?: string;
  tenantId?: string;
  name: string; 
  startTime: string; 
  endTime: string; 
  outletId: string;
  color: string; 
}

export interface CafeHoliday {
  id?: string;
  tenantId?: string;
  name: string;
  date: string; 
  outletId: string; 
}

export interface ShiftAssignment {
  id?: string;
  shiftId?: string; 
  shiftName?: string; 
  startTime?: string;
  endTime?: string;
  color?: string;
  crewId: string;
  crewName: string;
  outletId: string;
  date: string; 
  isDayOff?: boolean; 
  isPilot?: boolean; 
  tenantId?: string;
}

// --- VISUAL ASSETS ---
export const PILOT_CAT_IMAGE = "https://raw.githubusercontent.com/GreenNekoCafe/assets/main/pilot-cat.png"; 

// --- MODULE: ORDER ACCURACY ---
export interface OrderItem {
  name: string;
  quantity: number;
  category: 'food' | 'drink';
  validation?: {
    correct: boolean;
    packaging?: {
      napkin: boolean;
      straw?: boolean;   
      cutlery?: boolean; 
    };
  };
}

export interface OrderValidation {
  id?: string;
  orderId: string;
  customerName: string;
  customerOrderCount?: number; 
  items: OrderItem[];
  accessoriesChecked: {
    napkinIncluded: boolean;
    strawIncluded?: boolean; 
    cutleryIncluded?: boolean; 
  };
  outletId: string;
  photos: string[]; 
  validatedByCrewId: string;
  validatedByCrewName: string;
  validatedAt: any;
  status: 'completed';
}

// --- MODULE: TASKS ---
export enum TaskFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  ONCE = 'ONCE' 
}

export enum TaskProofType {
  NONE = 'NONE',
  PHOTO = 'PHOTO',
  TEXT = 'TEXT',
  AUDIO = 'AUDIO'
}

export interface TaskTemplate {
  id?: string;
  title: string;
  description?: string;
  instructions?: string;
  frequency: TaskFrequency;
  repeatDays?: string[];
  repeatDate?: number;
  timeSlots: string[];
  proofType: TaskProofType;
  proofTypes?: TaskProofType[];
  proofPhotoCount?: number; // How many photos are required when PHOTO proof is selected (default 1)
  tenantId?: string;
}

export interface Task {
  id?: string;
  title: string;
  description?: string;
  instructions?: string;
  outletId: string;
  assignedCrewIds?: string[];
  frequency: TaskFrequency;
  repeatDays?: string[];
  repeatDate?: number;
  timeSlots: string[];
  dueTime?: string;
  proofType: TaskProofType;
  proofTypes?: TaskProofType[];
  proofPhotoCount?: number; // How many photos are required when PHOTO proof is selected (default 1)
  isActive: boolean;
  createdAt?: any;
  tenantId?: string;
}

export interface TaskLog {
  id?: string;
  taskId: string;
  taskTitle: string;
  crewId: string;
  crewName: string;
  outletId: string;
  completedAt: any;
  scheduledTime?: string;
  proofValue?: string;
  proofType: TaskProofType;
  proofData?: { type: TaskProofType; value: string | string[] }[];
  status: 'completed' | 'late';
  tenantId?: string;
}

export interface TaskConfig {
  alertEnabled: boolean;
  alertType: 'SOUND' | 'FLASH' | 'BOTH';
  alertDurationMinutes: number; 
  alertSoundId?: string; 
}

// --- MODULE: ATTENDANCE ---
export interface AttendanceConfig {
  enableQrScan: boolean;
  enablePinCode: boolean;
  allowLeaveOverrideEdit?: boolean;
  showLeaveBalanceInApp?: boolean;
  permittedPinCrewIds?: string[]; // Restricted keypad access
}

export interface AttendanceLog {
  id?: string;
  crewId: string;
  crewName: string;
  outletId: string;
  timestamp: any;
  type: 'CHECK_IN' | 'CHECK_OUT';
  method: 'FACE' | 'QR' | 'PIN' | 'QR_SCAN';
  photoUrl?: string;
  tenantId?: string;
}

export interface LeaveRequest {
  id?: string;
  crewId: string;
  crewName: string;
  outletId: string;
  type: 'SICK' | 'CASUAL' | 'VACATION';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  appliedAt: any;
  tenantId?: string;
}

// --- MODULE: EMPLOYEE OF THE MONTH (EOM) ---
export interface EOMCycle {
  id: string; // YYYY-MM
  tenantId?: string;
  monthName: string;
  status: 'OPEN' | 'VOTING' | 'SCORING' | 'COMPLETED';
  winnerId?: string;
  winnerName?: string;
  calculatedAt?: any;
}

export interface EOMVote {
  id?: string;
  tenantId?: string;
  cycleId: string;
  voterId: string;
  nomineeId: string;
  timestamp: any;
}

export interface EOMScore {
  id?: string;
  tenantId?: string;
  cycleId: string;
  nomineeId: string;
  score: number; // 1-10
  managerId: string;
}

export interface EOMResult {
  nomineeId: string;
  nomineeName: string;
  voteCount: number;
  voteScoreNormalized: number;
  mgmtScoreRaw: number;
  mgmtScoreNormalized: number;
  finalScore: number;
}

// --- MODULE: LOGIN ACTIVITY ---
export interface LoginLog {
  id?: string;
  userId: string;        // Firebase Auth UID
  dbId?: string;         // Firestore document ID of the crew/manager profile
  userName: string;
  role: 'ADMIN' | 'CREW';
  accessRole?: string;   // e.g. "Manager", "Counter"
  outletId?: string;
  loginMethod: 'STAFF_CODE' | 'MANAGER_EMAIL';
  device?: string;       // Human-readable device summary
  userAgent?: string;    // Raw UA string for debugging
  location?: string;     // Approximate IP-based location, e.g. "Imphal, Manipur, IN"
  ip?: string;           // IP address the login came from
  timestamp: any;
}

// --- MODULE: RECIPE ---
export interface RecipeIngredient {
  name: string;
  amount: string;
  unit: string;
}

export interface Recipe {
  id?: string;
  name: string;
  category: string;
  description?: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  imageUrl?: string;
  isShared: boolean;
  // Who a shared recipe reaches in the crew app. Absent (legacy) === 'ALL'.
  // 'ROLES' -> anyone whose role is in sharedRoles; 'PEOPLE' -> anyone whose
  // crew doc id is in sharedCrewIds. Filtering is client-side (relevance, not
  // access-lock): the read rule still allows any staff to read shared recipes.
  shareScope?: 'ALL' | 'ROLES' | 'PEOPLE';
  sharedRoles?: string[];   // role names (match CrewMember.role / CurrentUser.accessRole)
  sharedCrewIds?: string[]; // crew doc ids (match CurrentUser.dbId)
  prepTime?: number;
  cookTime?: number;
  servingSize?: number;
  createdAt: any;
  createdBy: string;
}

export interface RecipeConfig {
  categories: string[];
}
