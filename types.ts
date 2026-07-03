
// --- SHARED CORE TYPES ---

export enum UserRole {
  ADMIN = 'ADMIN',
  CREW = 'CREW'
}

export interface CurrentUser {
  role: UserRole;
  uid: string;
  name?: string;
  outletId?: string;
  // Specific role from the Crew table (e.g. "Manager", "HR") used for Admin Matrix checks
  accessRole?: string; 
  // The Firestore Document ID (required because Auth UID might differ from legacy Crew Doc ID)
  dbId?: string;
}

export interface AppConfig {
  timezone: string;
  currencySymbol?: string;
}

export interface Store {
  id?: string;
  outletId: string;
  name: string;
  address?: string;
  fassaiNumber?: string;
  gstNumber?: string;
  fassaiCertUrl?: string;
  gstCertUrl?: string;
  isActive: boolean;
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
  MANAGER_MEET: 'MANAGER_MEET',
  BLUEBOOK: 'BLUEBOOK',
  RECIPE: 'RECIPE',
  LOGIN_ACTIVITY: 'LOGIN_ACTIVITY',
  SETTINGS: 'SETTINGS',

  // Crew App Features
  CREW_ORDERS: 'CREW_ORDERS',
  CREW_TASKS: 'CREW_TASKS',
  CREW_SHIFTS: 'CREW_SHIFTS',
  CREW_EOM: 'CREW_EOM',
  CREW_BLUEBOOK: 'CREW_BLUEBOOK',
  CREW_RECIPE: 'CREW_RECIPE'
} as const;

export type ModuleId = keyof typeof MODULE_IDS;

export interface AccessConfig {
  [key: string]: string[]; // ModuleID -> Array of Role Names
}

export interface RoleDef {
  id?: string;
  name: string;
}

// --- MODULE: BLUEBOOK (NEW) ---
export interface BluebookItem {
  id?: string;
  title: string;
  category: string;
  shortText: string;
  detailedText?: string;
  imageUrl?: string;
  createdAt: any;
  createdBy: string;
}

export interface BluebookConfig {
  categories: string[];
}

// --- MODULE: EMPLOYEES ---
export interface CrewDocument {
  id: string;
  name: string;
  type: 'OFFER_SIGNED' | 'ID_PROOF' | 'RESUME' | 'OTHER';
  url: string;
  uploadedAt: any;
}

export interface CrewMember {
  id?: string;
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
  name: string; 
  startTime: string; 
  endTime: string; 
  outletId: string;
  color: string; 
}

export interface CafeHoliday {
  id?: string;
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
  isActive: boolean;
  createdAt?: any;
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
  proofData?: { type: TaskProofType; value: string }[];
  status: 'completed' | 'late';
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
}

// --- MODULE: EMPLOYEE OF THE MONTH (EOM) ---
export interface EOMCycle {
  id: string; // YYYY-MM
  monthName: string;
  status: 'OPEN' | 'VOTING' | 'SCORING' | 'COMPLETED';
  winnerId?: string;
  winnerName?: string;
  calculatedAt?: any;
}

export interface EOMVote {
  id?: string;
  cycleId: string;
  voterId: string;
  nomineeId: string;
  timestamp: any;
}

export interface EOMScore {
  id?: string;
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
  prepTime?: number;
  cookTime?: number;
  servingSize?: number;
  createdAt: any;
  createdBy: string;
}

export interface RecipeConfig {
  categories: string[];
}

// --- MODULE: MANAGER MEET ---
export interface MeetingAgendaItem {
  id: string;
  text: string;
  isDiscussed: boolean;
  addedBy: string;
}

export interface MeetingActionItem {
  id?: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  status: 'OPEN' | 'DONE';
  originMeetingId: string;
  createdAt: any;
}

export interface ManagerMeeting {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  status: 'PLANNED' | 'COMPLETED';
  notes: string;
  agenda: MeetingAgendaItem[];
}
